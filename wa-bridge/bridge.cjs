/**
 * CSC Smart Seva — FREE WhatsApp Bridge (Baileys)
 * - Your own WhatsApp number becomes the business number (QR scan once)
 * - Meta Graph API compatible endpoints so n8n CSC 01/CSC 20 work unchanged:
 *     POST /v21.0/<phoneId>/messages  -> { to, text: { body } } => real WhatsApp send
 * - Incoming WhatsApp messages -> converted to Meta webhook format -> n8n Router
 * - Media (image/document) saved to media/ + metadata forwarded
 * Run: node /home/z/my-project/wa-bridge/bridge.js  (port 3010, localhost only)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = __dirname;
const PORT = 3010;
const N8N_URL = process.env.N8N_URL || 'http://127.0.0.1:4000/webhook/whatsapp';
const SESSION_DIR = path.join(BASE, 'session');
const MEDIA_DIR = path.join(BASE, 'media');
const STATE_FILE = path.join(BASE, 'state.json');
fs.mkdirSync(SESSION_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadMediaMessage, Browsers } = baileys;
const pino = require('pino');
const logger = pino({ level: 'silent' });
const QRCode = require('qrcode');

// ---------- runtime state ----------
let sock = null;
let connected = false;
let connectedUser = '';
let lastQR = '';          // raw qr string
let qrDataUrl = '';       // png data url for portal
let qrAt = 0;
let starting = false;
const seenMsgIds = new Set();
const state = { startedAt: new Date().toISOString(), messages_in: 0, messages_out: 0, replies_sent: 0, last_in: '', last_out: '' };
try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (e) {}
const saveState = () => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1)); } catch (e) {} };

function log(...a) { console.log(new Date().toISOString(), ...a); }

// ---------- helpers ----------
function digitsOnly(v) { return String(v || '').replace(/\D/g, ''); }
function normalizeTo(v) {
  let d = digitsOnly(v);
  if (d.length === 10) d = '91' + d;           // Indian numbers
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}
function jidOf(num) { return num + '@s.whatsapp.net'; }
function ownNumber() {
  if (!sock || !sock.user) return '';
  return digitsOnly(sock.user.id.split(':')[0]);
}

function extractText(m) {
  const msg = m.message || {};
  return msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.documentMessage?.caption
    || msg.videoMessage?.caption
    || msg.buttonsResponseMessage?.selectedButtonId
    || msg.listResponseMessage?.title
    || '';
}
function mediaInfo(m) {
  const msg = m.message || {};
  if (msg.imageMessage) return { kind: 'image', mime: msg.imageMessage.mimetype || 'image/jpeg', filename: '' };
  if (msg.documentMessage) return { kind: 'document', mime: msg.documentMessage.mimetype || 'application/octet-stream', filename: msg.documentMessage.fileName || 'document' };
  if (msg.audioMessage) return { kind: 'audio', mime: msg.audioMessage.mimetype || 'audio/ogg', filename: '' };
  if (msg.videoMessage) return { kind: 'video', mime: msg.videoMessage.mimetype || 'video/mp4', filename: '' };
  return null;
}

// save media async, non-blocking
function saveMedia(m, info) {
  try {
    downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })
      .then(buf => {
        if (!buf || !buf.length) return;
        const ext = (info.mime.split('/')[1] || 'bin').split(';')[0];
        const f = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${ext}`;
        fs.writeFileSync(path.join(MEDIA_DIR, f), buf);
        log('media saved:', f, buf.length, 'bytes');
      })
      .catch(e => log('media download failed:', e.message));
  } catch (e) { log('media err:', e.message); }
}

// ---------- start / reconnect ----------
async function startSock() {
  if (starting) return;
  starting = true;
  const { state: authState, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  let version;
  try { version = (await fetchLatestBaileysVersion()).version; } catch (e) { version = [2, 3000, 1023223877]; }
  sock = makeWASocket({
    version,
    auth: { creds: authState.creds, keys: makeCacheableSignalKeyStore(authState.keys, logger) },
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      lastQR = qr; qrAt = Date.now();
      try { qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 }); } catch (e) {}
      log('QR generated (scan within ~30s). Total QR rotations:', qrAt);
    }
    if (connection === 'open') {
      connected = true;
      connectedUser = sock.user?.id || '';
      log('CONNECTED as', connectedUser);
      saveState();
    }
    if (connection === 'close') {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === code) || code;
      log('connection closed:', reason);
      if (code === DisconnectReason.loggedOut) {
        log('LOGGED OUT - clearing session, new QR needed on next start');
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); fs.mkdirSync(SESSION_DIR, { recursive: true }); } catch (e) {}
        starting = false;
        setTimeout(startSock, 5000);
      } else {
        starting = false;
        setTimeout(startSock, Math.min(30000, 3000 + Math.random() * 5000));
      }
      saveState();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try { await handleIncoming(m); } catch (e) { log('handle err:', e.message); }
    }
  });
}

// ---------- incoming -> n8n ----------
async function handleIncoming(m) {
  const jid = m.key?.remoteJid || '';
  if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@newsletter')) return;
  if (!m.message) return;
  const id = m.key.id || '';
  if (seenMsgIds.has(id)) return;
  seenMsgIds.add(id);
  if (seenMsgIds.size > 3000) { const it = seenMsgIds.values().next().value; seenMsgIds.delete(it); }

  const own = ownNumber();
  const isSelf = own && digitsOnly(jid.split('@')[0].split(':')[0]) === own;
  if (m.key.fromMe && !isSelf) return;   // ignore our own sends in customer chats

  const text = extractText(m);
  const minfo = mediaInfo(m);
  if (!text && !minfo) return;

  const sender = isSelf ? own : digitsOnly(jid.split('@')[0].split(':')[0]);
  const name = m.pushName || 'Customer';

  // build Meta-format webhook payload (CSC 01 Normalize Message compatible)
  const message = { from: sender, id: id || 'msg' + Date.now(), timestamp: String(Math.floor((m.messageTimestamp || Date.now() / 1000))) };
  if (minfo) {
    message.type = minfo.kind;
    message[minfo.kind] = { id: message.id, mime_type: minfo.mime, filename: minfo.filename || '' };
    if (text) message.text = { body: text };
  } else {
    message.type = 'text';
    message.text = { body: text };
  }
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'BRIDGE',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: own, phone_number_id: 'BRIDGE-LOCAL' },
          contacts: [{ profile: { name }, wa_id: sender }],
          messages: [message]
        },
        field: 'messages'
      }]
    }]
  };

  if (minfo) saveMedia(m, minfo);

  state.messages_in++; state.last_in = `${sender}: ${text || minfo?.kind}`; saveState();
  log('IN ->', sender, JSON.stringify(text || minfo?.kind).slice(0, 60));

  try {
    const res = await fetch(N8N_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(120000)
    });
    const body = await res.text().catch(() => '');
    log('n8n responded', res.status, body.slice(0, 120));
    // NOTE: reply is sent synchronously by CSC 01 "Send WhatsApp Reply" through this
    // bridge (Meta-compatible endpoint), so we never send from response body.
  } catch (e) {
    log('n8n forward failed:', e.message);
  }
}

// ---------- Meta-compatible HTTP API ----------
function sendJSON(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
  });
}

async function handleSend(body, res) {
  if (!connected || !sock) return sendJSON(res, 503, { error: { message: 'WhatsApp bridge not connected. Scan QR first.', code: 503 } });
  const to = normalizeTo(body.to);
  const text = String(body.text?.body ?? body.body ?? body.message ?? '').slice(0, 4096);
  if (!to || !text) return sendJSON(res, 400, { error: { message: 'to + text.body required', code: 400 } });
  try {
    const [response] = await sock.sendMessage(jidOf(to), { text }, { waitForAck: true });
    // mark as bridge-sent so our own reply (esp. note-to-self) never re-triggers the router
    const sentId = response?.key?.id || response?.id;
    if (sentId) { seenMsgIds.add(sentId); if (seenMsgIds.size > 3000) { const it = seenMsgIds.values().next().value; seenMsgIds.delete(it); } }
    state.messages_out++; state.last_out = `${to}: ${text.slice(0, 50)}`; saveState();
    log('OUT ->', to, JSON.stringify(text).slice(0, 60));
    sendJSON(res, 200, {
      messaging_product: 'whatsapp',
      contacts: [{ input: String(body.to), wa_id: to }],
      messages: [{ id: sentId || 'wamid.' + crypto.randomBytes(8).toString('hex').toUpperCase() }]
    });
  } catch (e) {
    log('send failed:', e.message);
    sendJSON(res, 502, { error: { message: 'send failed: ' + e.message, code: 502 } });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;

  if (req.method === 'GET' && /^\/v[\d.]+\/[^/]+\/messages$/.test(p)) {
    return sendJSON(res, 400, { error: { message: 'POST only', code: 400 } });
  }
  if (req.method === 'POST' && /^\/v[\d.]+\/[^/]+\/messages$/.test(p)) {
    const body = await readBody(req);
    return handleSend(body, res);
  }
  if (req.method === 'GET' && p === '/status') {
    return sendJSON(res, 200, {
      connected, user: connectedUser, qr_ready: !!qrDataUrl && !connected,
      qr_age_sec: qrAt ? Math.round((Date.now() - qrAt) / 1000) : null,
      ...state
    });
  }
  if (req.method === 'GET' && p === '/qr.json') {
    return sendJSON(res, 200, { connected, qr: connected ? '' : qrDataUrl, qr_age_sec: qrAt ? Math.round((Date.now() - qrAt) / 1000) : null });
  }
  if (req.method === 'GET' && p === '/qr.png') {
    if (!lastQR) return sendJSON(res, 404, { error: 'no qr yet' });
    const buf = await QRCode.toBuffer(lastQR, { width: 400, margin: 1 });
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(buf);
  }
  if (req.method === 'POST' && p === '/pair') {
    const body = await readBody(req);
    const phone = normalizeTo(body.phone);
    if (!phone || phone.length < 10) return sendJSON(res, 400, { error: 'phone required (with country code, e.g. 919876543210)' });
    if (connected) return sendJSON(res, 400, { error: 'already connected' });
    if (!sock) return sendJSON(res, 503, { error: 'socket not ready, try again in 5s' });
    try {
      const code = await sock.requestPairingCode(phone);
      log('pairing code for', phone, ':', code);
      return sendJSON(res, 200, { code });
    } catch (e) {
      log('pair failed:', e.message);
      return sendJSON(res, 502, { error: e.message });
    }
  }
  if (req.method === 'POST' && p === '/reconnect') {
    starting = false;
    try { sock?.end(new Error('manual reconnect')); } catch (e) {}
    setTimeout(startSock, 1000);
    return sendJSON(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/logout') {
    try { await sock?.logout(); } catch (e) {}
    try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); fs.mkdirSync(SESSION_DIR, { recursive: true }); } catch (e) {}
    connected = false; starting = false;
    setTimeout(startSock, 2000);
    return sendJSON(res, 200, { ok: true, note: 'logged out, new QR on reconnect' });
  }
  sendJSON(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`CSC WA Bridge listening on 127.0.0.1:${PORT} | n8n: ${N8N_URL}`);
  startSock();
});

process.on('uncaughtException', (e) => log('uncaught:', e.message));
process.on('unhandledRejection', (e) => log('unhandled:', e?.message || e));
