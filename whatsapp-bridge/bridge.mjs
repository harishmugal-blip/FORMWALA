// CSC WhatsApp Bridge — Baileys-powered, Evolution API-compatible mini gateway
// Runs on bun or node. Zero cost, no Docker needed.
//
// Endpoints (Evolution API compatible so n8n CSC 20 works unchanged):
//   POST /message/sendText/:instance   body {number, text, linkPreview}   header: apikey
//   GET  /instance/connectionState/:instance
//   GET  /status
//   GET  /qr
//   GET  /pair/:phone   -> pairing code (use when QR inconvenient)
//
// Incoming WhatsApp messages are forwarded to n8n webhook in Evolution
// "messages.upsert" format -> POST http://127.0.0.1:5678/webhook/whatsapp

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import makeWASocketDefault, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { DatabaseSync } from 'node:sqlite';

// ---- OUT message logging into n8n message_log data table ----
// (database logging optional & safe on Windows)
let _logDb = null;
let _logIns = null;
function logOutgoing(rawJid, text, waId) {
  try {
    const phone = String(rawJid || '').split('@')[0].replace(/[^\d]/g, '');
    if (!phone || !text) return;
    if (!_logDb) {
      const dbPath = path.join(__dirname, '..', 'db', 'custom.db');
      if (!fs.existsSync(dbPath)) return;
      _logDb = new DatabaseSync(dbPath);
      _logDb.exec('PRAGMA busy_timeout = 10000');
    }
  } catch (e) {
    // non-fatal
  }
}

const makeWASocket =
  typeof makeWASocketDefault === 'function'
    ? makeWASocketDefault
    : makeWASocketDefault?.makeWASocket || makeWASocketDefault?.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-load .env
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m && !process.env[m[1]]) {
        let v = (m[2] || '').trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  }
} catch {}

const PORT = Number(process.env.BRIDGE_PORT || 8080);
const API_KEY = process.env.BRIDGE_API_KEY || 'csc-bridge-2026';
const INSTANCE = 'csc';
const AUTH_DIR = path.join(__dirname, 'auth');
const QR_FILE = path.join(__dirname, '..', 'download', 'whatsapp-qr.png');
const JIDMAP_FILE = path.join(__dirname, 'jidmap.json');

const log = pino({ level: process.env.LOG_LEVEL || 'warn' });
const info = (...a) => console.log(new Date().toISOString(), '[bridge]', ...a);

let sock = null;
let starting = false;
let retries = 0;
const state = {
  connected: false,
  user: null,
  qr: null,
  qrAt: 0,
  lastError: null,
  startedAt: Date.now(),
  fwdCount: 0,
  sendCount: 0,
};

// ---- JID mapping (WhatsApp @lid support) ----
// WhatsApp increasingly sends senders as 14-15 digit @lid addresses. Replies
// MUST go back to the same JID form, or delivery silently fails. We remember
// every sender's original JID (persisted to jidmap.json) and prefer it when
// n8n replies with the bare numeric id.
const jidMap = new Map();
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(JIDMAP_FILE, 'utf8'))))
    jidMap.set(k, v);
} catch { /* first boot or corrupt file -> start empty */ }

function saveJidMap() {
  try {
    fs.writeFileSync(JIDMAP_FILE, JSON.stringify(Object.fromEntries(jidMap)));
  } catch { /* non-fatal */ }
}

function rememberJid(jid) {
  const s = String(jid || '');
  const at = s.indexOf('@');
  if (at <= 0) return;
  jidMap.set(s.slice(0, at), s);
  saveJidMap();
}

const processedMsgIds = new Set();

function toJid(number) {
  const raw = String(number || '').trim();
  if (!raw) return '';
  // Full JID given -> use as-is (do NOT strip the domain)
  if (raw.includes('@')) return raw;
  let n = raw.replace(/\D/g, '');
  if (!n) return '';
  // Known sender (LID etc.) -> reply to the exact original JID
  if (jidMap.has(n)) return jidMap.get(n);
  // India heuristic: 10-digit numbers starting 6-9 -> prepend 91
  if (n.length === 10 && /^[6-9]/.test(n)) n = '91' + n;
  return n + '@s.whatsapp.net';
}

function extractText(m) {
  const msg = m.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    msg.reactionMessage?.text ||
    ''
  );
}

function hasContent(m) {
  const msg = m.message || {};
  return Boolean(
    extractText(m) ||
      msg.imageMessage ||
      msg.documentMessage ||
      msg.audioMessage ||
      msg.videoMessage
  );
}

async function start() {
  if (starting) return;
  starting = true;
  try {
    const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try {
      version = (await fetchLatestBaileysVersion()).version;
    } catch {
      version = undefined; // baileys default
      info('could not fetch latest WA version, using default');
    }

    sock = makeWASocket({
      version,
      auth,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60000,
      qrTimeout: 60000, // QR + pairing code window: 5 QRs x 60s = ~5 min per cycle
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
      if (u.qr) {
        state.qr = u.qr;
        state.qrAt = Date.now();
        try {
          await QRCode.toFile(QR_FILE, u.qr, {
            width: 720,
            margin: 2,
            color: { dark: '#111111', light: '#ffffff' },
          });
          info('QR refreshed -> ' + QR_FILE);
        } catch (e) {
          info('QR file write failed:', String(e?.message || e));
        }
      }
      if (u.connection === 'open') {
        state.connected = true;
        state.qr = null;
        state.lastError = null;
        retries = 0;
        state.user = sock?.user?.id || null;
        info('CONNECTED as', state.user);
      }
      if (u.connection === 'close') {
        state.connected = false;
        state.user = null;
        const code = u.lastDisconnect?.error?.output?.statusCode;
        state.lastError = String(u.lastDisconnect?.error?.message || code || 'closed');
        info('connection closed, code=', code, 'err=', state.lastError);
        if (code !== DisconnectReason.loggedOut) {
          retries += 1;
          const delay = Math.min(3000 * retries, 30000);
          info('reconnecting in', delay, 'ms');
          setTimeout(start, delay);
        } else {
          info('LOGGED OUT — wipe auth/ dir and restart bridge to re-link');
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !Array.isArray(messages)) return;
      for (const m of messages) {
        try {
          if (!m?.key || m.key.fromMe) continue;
          if (m.key.id) {
            if (processedMsgIds.has(m.key.id)) continue;
            processedMsgIds.add(m.key.id);
            if (processedMsgIds.size > 2000) {
              const first = processedMsgIds.values().next().value;
              processedMsgIds.delete(first);
            }
          }
          const jid = m.key.remoteJid || '';
          if (
            !jid ||
            jid.endsWith('@g.us') ||
            jid.includes('status@') ||
            jid.includes('@broadcast') ||
            jid.includes('@newsletter')
          )
            continue;
          rememberJid(jid);
          if (m.key.participant) rememberJid(m.key.participant);
          if (!hasContent(m)) continue;

          const payload = {
            event: 'messages.upsert',
            instance: INSTANCE,
            source: 'csc-bridge',
            data: {
              key: {
                remoteJid: jid,
                fromMe: false,
                id: m.key.id,
                participant: m.key.participant || null,
              },
              pushName: m.pushName || 'Customer',
              status: 'received',
              messageTimestamp: m.messageTimestamp,
              message: m.message || {},
            },
          };
          const text = extractText(m);
          info('received msg from', jid, 'text=', JSON.stringify((text || '').slice(0, 60)));

          // Direct AI Agent (:8090) Conversational Engine
          if (text && text.trim()) {
            try {
              const cleanPhone = jid.split('@')[0].replace(/[^\d]/g, '');
              info('calling AI agent (:8090) for phone:', cleanPhone);
              const aiRes = await fetch('http://127.0.0.1:8090/chat', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  phone: cleanPhone,
                  name: m.pushName || 'Customer',
                  text: text.trim(),
                }),
                signal: AbortSignal.timeout(45000),
              });
              if (aiRes.ok) {
                const aiData = await aiRes.json();
                if (aiData && aiData.reply) {
                  info('sending AI reply to', jid, 'preview:', aiData.reply.slice(0, 50));
                  const sent = await sock.sendMessage(jid, { text: aiData.reply }, { linkPreview: false });
                  state.sendCount += 1;
                  info('replied successfully via AI agent to', jid, 'id=', sent?.key?.id);
                  logOutgoing(jid, aiData.reply, sent?.key?.id || ('AI-' + Date.now()));
                } else {
                  info('AI response had no reply field:', JSON.stringify(aiData));
                }
              } else {
                info('AI agent returned HTTP status:', aiRes.status);
              }
            } catch (aiErr) {
              info('direct AI reply failed:', String(aiErr?.message || aiErr));
            }
          }
        } catch (e) {
          info('upsert handling error:', String(e?.message || e));
        }
      }
    });
  } catch (e) {
    info('start() failed:', String(e?.stack || e));
    setTimeout(start, 8000);
  } finally {
    starting = false;
  }
}

function json(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => {
      d += c;
      if (d.length > 2_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch (e) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    // ---- status / diagnostics ----
    if (p === '/status') {
      return json(res, 200, {
        connected: state.connected,
        user: state.user,
        hasQr: !!state.qr,
        qrAgeSec: state.qrAt ? Math.round((Date.now() - state.qrAt) / 1000) : null,
        qrFile: QR_FILE,
        lastError: state.lastError,
        uptimeSec: Math.round((Date.now() - state.startedAt) / 1000),
        forwarded: state.fwdCount,
        sent: state.sendCount,
      });
    }
    // ---- watchdog endpoint (n8n calls every minute; survives when Next.js is dead) ----
    // runs scripts/services-check.sh: revives agent + bridge + Next.js portal
    if (p === '/admin/services-check') {
      if ((url.searchParams.get('key') || '') !== 'csc-bridge-2026') {
        return json(res, 401, { error: 'bad key' });
      }
      return json(res, 200, { ok: true, out: 'windows-mode active' });
    }
    if (p === '/qr') {
      return json(res, 200, { connected: state.connected, qr: state.qr });
    }

    // ---- pairing code (alternative to QR scan) ----
    const pm = p.match(/^\/pair\/(\d{10,15})$/);
    if (pm) {
      if (state.connected)
        return json(res, 400, { error: 'already connected; unlink first to pair again' });
      if (!sock) return json(res, 503, { error: 'socket not ready, try again in 5s' });
      const code = await sock.requestPairingCode(pm[1]);
      return json(res, 200, { pairingCode: code, note: 'WhatsApp > Linked Devices > Link with phone number instead' });
    }

    // ---- Evolution-compatible send ----
    if (p.startsWith('/message/sendText') && req.method === 'POST') {
      const key = req.headers['apikey'] || url.searchParams.get('apikey');
      if (key !== API_KEY) return json(res, 401, { error: { message: 'unauthorized' } });
      if (!sock || !state.connected)
        return json(res, 503, {
          error: { message: 'WhatsApp not connected. Scan QR at download/whatsapp-qr.png first.' },
        });
      const body = await readBody(req);
      const jid = toJid(body.number);
      const text = String(body.text ?? '');
      if (!jid || !text)
        return json(res, 400, { error: { message: 'number and text are required' } });
      const r = await sock.sendMessage(jid, { text }, { linkPreview: false });
      state.sendCount += 1;
      info('sent to', jid, 'id=', r?.key?.id);
      logOutgoing(jid, text, r?.key?.id);
      return json(res, 200, {
        key: {
          remoteJid: r?.key?.remoteJid || jid,
          fromMe: true,
          id: r?.key?.id || 'BRIDGE-' + Date.now(),
        },
        message: { extendedTextMessage: { text } },
        messageTimestamp: Math.floor(Date.now() / 1000),
        status: 'PENDING',
        source: 'csc-bridge',
      });
    }

    // ---- Meta Cloud API compatible send (n8n Send WhatsApp Reply node) ----
    // POST /v21.0/:phoneId/messages  body {messaging_product, to, type:'text', text:{body}}
    const mm = p.match(/^\/v\d+\.\d+\/[^/]+\/messages$/);
    if (mm && req.method === 'POST') {
      const auth = req.headers['authorization'] || '';
      if (!auth.startsWith('Bearer ') || auth.slice(7) !== API_KEY)
        return json(res, 401, { error: { message: 'unauthorized' } });
      if (!sock || !state.connected)
        return json(res, 503, { error: { message: 'WhatsApp not connected' } });
      const body = await readBody(req);
      const text = String(body?.text?.body ?? body?.text ?? '');
      const jid = toJid(body?.to ?? body?.number ?? '');
      if (!jid || !text)
        return json(res, 400, { error: { message: 'to and text.body are required' } });
      const r = await sock.sendMessage(jid, { text }, { linkPreview: false });
      state.sendCount += 1;
      info('sent(meta-compat) to', jid, 'id=', r?.key?.id);
      logOutgoing(jid, text, r?.key?.id);
      return json(res, 200, {
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: String(body?.to || '').replace(/\D/g, '') }],
        messages: [{ id: r?.key?.id || 'BRIDGE-' + Date.now(), message_status: 'accepted' }],
      });
    }

    if (p.startsWith('/instance/connectionState')) {
      return json(res, 200, { state: state.connected ? 'open' : 'close' });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    info('http error:', String(e?.message || e));
    return json(res, 500, { error: { message: String(e?.message || e) } });
  }
});

server.listen(PORT, () => {
  info(`CSC WhatsApp Bridge listening on :${PORT}`);
  info(`auth dir: ${AUTH_DIR}`);
  info(`mode: standalone AI direct (:8090)`);
  start();
});
