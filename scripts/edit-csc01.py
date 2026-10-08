#!/usr/bin/env python3
"""Modify CSC 01 Router: Normalize Message node supports Meta Cloud API + Evolution API + direct test format."""
import json

F = "/home/z/my-project/scripts/wf-edit/csc01.json"
d = json.load(open(F))

NEW_CODE = """const body = $json.body || $json;
let phone = '', name = '', text = '', msgType = 'unknown';
let media = null;
let src = '';

// ---------- FORMAT 1: Meta WhatsApp Cloud API ----------
try {
  const entry = body.entry && body.entry[0];
  const change = entry && entry.changes && entry.changes[0];
  const value = change && change.value;
  const msg = value && value.messages && value.messages[0];
  if (msg) {
    src = 'meta';
    phone = msg.from || '';
    msgType = msg.type || 'text';
    const contact = value.contacts && value.contacts[0];
    name = (contact && contact.profile && contact.profile.name) || 'Customer';
    if (msgType === 'text') text = msg.text && msg.text.body || '';
    else if (msgType === 'image') media = { id: msg.image && msg.image.id, mime: msg.image && msg.image.mime_type, filename: '' };
    else if (msgType === 'document') media = { id: msg.document && msg.document.id, mime: msg.document && msg.document.mime_type, filename: msg.document && msg.document.filename };
    else if (msgType === 'audio' || msgType === 'video' || msgType === 'sticker') media = { id: (msg[msgType] || {}).id, mime: (msg[msgType] || {}).mime_type, filename: '' };
    else if (msgType === 'button') text = (msg.button || {}).text || '';
    else if (msgType === 'interactive') {
      const it = msg.interactive || {};
      text = (it.button_reply && it.button_reply.title) || (it.list_reply && it.list_reply.title) || '';
    }
  }
} catch (e) {}

// ---------- FORMAT 2: Evolution API (messages.upsert webhook) ----------
try {
  if (!src && body.event && String(body.event).toLowerCase().indexOf('messages.upsert') === 0 && body.data && body.data.key) {
    const d = body.data;
    const jid = (d.key && d.key.remoteJid) || '';
    if (d.key.fromMe) return [];
    if (!jid || jid.indexOf('@g.us') !== -1 || jid.indexOf('status@') !== -1) return [];
    src = 'evo';
    phone = jid.split('@')[0];
    name = d.pushName || 'Customer';
    const m = d.message || {};
    if (m.conversation) { text = m.conversation; msgType = 'text'; }
    else if (m.extendedTextMessage && m.extendedTextMessage.text) { text = m.extendedTextMessage.text; msgType = 'text'; }
    else if (m.imageMessage) { msgType = 'image'; media = { id: m.imageMessage.url || '', mime: m.imageMessage.mimetype || '', filename: '' }; text = m.imageMessage.caption || ''; }
    else if (m.documentMessage) { msgType = 'document'; media = { id: m.documentMessage.url || '', mime: m.documentMessage.mimetype || '', filename: m.documentMessage.fileName || '' }; text = m.documentMessage.caption || ''; }
    else if (m.audioMessage) { msgType = 'audio'; media = { id: m.audioMessage.url || '', mime: m.audioMessage.mimetype || '', filename: '' }; }
    else if (m.videoMessage) { msgType = 'video'; media = { id: m.videoMessage.url || '', mime: m.videoMessage.mimetype || '', filename: '' }; }
    else if (m.buttonsResponseMessage) { text = m.buttonsResponseMessage.selectedDisplayText || m.buttonsResponseMessage.selectedButtonId || ''; msgType = 'text'; }
    else if (m.listResponseMessage) { text = m.listResponseMessage.title || ''; msgType = 'text'; }
    else if (m.reactionMessage) { text = m.reactionMessage.text || ''; msgType = 'text'; }
  }
} catch (e) {}

// ---------- FORMAT 3: direct test payload {from, text} ----------
try {
  if (!src && body.from && (typeof body.text === 'string' ? body.text : (body.text && body.text.body))) {
    src = 'direct';
    phone = body.from;
    name = body.name || 'Customer';
    text = typeof body.text === 'string' ? body.text : (body.text.body || '');
    msgType = 'text';
  }
} catch (e) {}

return [{ json: { phone: phone || 'unknown', name: name || 'Customer', message: text, media, msg_type: media ? 'media' : 'text', is_media: !!media, wa_id: src || 'unknown', source: src || 'unknown' } }];"""

for n in d["nodes"]:
    if n["name"] == "Normalize Message":
        n["parameters"]["jsCode"] = NEW_CODE

json.dump(d, open(F, "w"), indent=1)
print("CSC 01 Normalize Message updated.")
