#!/usr/bin/env python3
"""CSC 06 Field Collector surgery: add AI field-chat gate (mid-flow conversation intelligence).
- Compute Step: FIELDS/DOCS/PAYMENT paths call ai-agent /field-chat
- Route Step: new output 'ai_reply'
- New node: AI Reply Out
"""
import json, urllib.request

BASE = "http://127.0.0.1:5678/api/v1"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
WF_ID = "3c5c0606-0000-4000-8000-000000000006"

def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method,
        headers={"X-N8N-API-KEY": KEY, "content-type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

wf = api("GET", f"/workflows/{WF_ID}")

COMPUTE_NEW = r'''const state = $('Get Conv State').first().json || {};
const cfg = $json || {};
const input = $('Trigger').first().json;
const msg = String(input.message || '').trim();
const up = msg.toUpperCase();
const phone = input.phone;

const FIELDS = cfg.fields || [];
const DOCS = cfg.documents || [];
const service = cfg.service || {};
let ctx = {};
try { ctx = JSON.parse(state.context_data || '{}'); } catch (e) {}

if (up === 'CANCEL') return [{ json: { next: 'cancel', phone } }];

const activeState = state.state || '';
const validStates = ['FIELDS', 'DOCS', 'PAYMENT'];
if (!validStates.includes(activeState)) {
  if (!service.service_id) return [{ json: { next: 'no_config', phone } }];
  const application_id = 'APP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  return [{ json: { next: 'start', phone, application_id, service_id: service.service_id, fields: FIELDS, docs: DOCS, service } }];
}

// ---------- AI gate (field-chat): customer ka message samajhta hai ----------
// answer = isi sawal ka jawab (normalized) | reply = side-question ka jawab | cancel = band karna chahta hai
// Fail hone par null -> purana rigid flow waise hi chalega (system never breaks).
const gate = async (fcState, extraField) => {
  try {
    return await this.helpers.httpRequest({
      method: 'POST',
      url: 'http://127.0.0.1:8090/field-chat',
      body: {
        phone,
        name: input.name || 'Customer',
        text: msg,
        state: fcState,
        service_name: (service && (service.service_name || service.name)) || (cfg.service_id || ''),
        field: extraField || null,
        docs: (DOCS || []).map(d => d.label || d.doc_key || d),
      },
      headers: { 'content-type': 'application/json' },
      json: true,
      timeout: 45000,
    });
  } catch (e) { return null; }
};

if (activeState === 'PAYMENT') {
  const fc = await gate('PAYMENT', null);
  if (fc && fc.action === 'reply' && fc.reply) return [{ json: { next: 'ai_reply', phone, reply: fc.reply } }];
  return [{ json: { next: 'payment_note', phone, application_id: ctx.application_id, service } }];
}

if (activeState === 'DOCS') {
  const fc = await gate('DOCS', null);
  if (fc && fc.action === 'cancel') return [{ json: { next: 'cancel', phone } }];
  if (fc && fc.action === 'reply' && fc.reply) return [{ json: { next: 'ai_reply', phone, reply: fc.reply } }];
  return [{ json: { next: 'ask_doc_reminder', phone, application_id: ctx.application_id, docs: DOCS, ctx, service } }];
}

// FIELDS state
const idx = Number(ctx.field_index || 0);
const field = FIELDS[idx];
if (!field) {
  const application_id = ctx.application_id || ('APP' + Date.now().toString(36).toUpperCase());
  return [{ json: { next: 'all_fields_done', phone, application_id, fields: FIELDS, docs: DOCS, ctx, service } }];
}
const fc = await gate('FIELDS', { label: field.label, question: field.question, field_type: field.field_type, options: field.options, error_hint: field.error_hint });
if (fc && fc.action === 'cancel') return [{ json: { next: 'cancel', phone } }];
if (fc && fc.action === 'reply' && fc.reply) return [{ json: { next: 'ai_reply', phone, reply: fc.reply } }];
const value = (fc && fc.action === 'answer' && fc.value && String(fc.value).trim()) ? String(fc.value).trim() : msg;
return [{ json: { next: 'answer', phone, application_id: ctx.application_id, field, value, fields: FIELDS, docs: DOCS, ctx, service, idx } }];'''

AI_REPLY_OUT = r'''return [{ json: { reply: $json.reply, phone: $json.phone } }];'''

nodes = wf['nodes']
updated = 0
for n in nodes:
    if n['name'] == 'Compute Step':
        n['parameters']['jsCode'] = COMPUTE_NEW
        updated += 1
    if n['name'] == 'Ask Doc Reminder':
        anchor_pos = n.get('position', [0, 0])

if updated != 1:
    raise SystemExit(f"ERROR: Compute Step found {updated} times, abort")

# add AI Reply Out node if missing
if not any(n['name'] == 'AI Reply Out' for n in nodes):
    nodes.append({
        "parameters": {"mode": "runOnceForAllItems", "jsCode": AI_REPLY_OUT},
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "name": "AI Reply Out",
        "position": [anchor_pos[0], anchor_pos[1] + 220],
    })

# Route Step: append ai_reply rule (r7)
for n in nodes:
    if n['name'] == 'Route Step':
        rules = n['parameters']['rules']['values']
        if not any(r.get('outputKey') == 'ai_reply' for r in rules):
            rules.append({
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                    "conditions": [{"id": "r7", "leftValue": "={{ $json.next }}", "rightValue": "ai_reply",
                                     "operator": {"type": "string", "operation": "equals"}}],
                    "combinator": "and",
                },
                "renameOutput": True,
                "outputKey": "ai_reply",
            })

# connections: Route Step output 7 -> AI Reply Out
conns = wf['connections']
rs = conns.setdefault('Route Step', {}).setdefault('main', [])
while len(rs) < 8:
    rs.append([])
rs[7] = [{"node": "AI Reply Out", "type": "main", "index": 0}]

body = {"name": wf['name'], "nodes": nodes, "connections": conns, "settings": wf.get('settings', {})}
api("PUT", f"/workflows/{WF_ID}", body)
print("CSC 06 updated OK")

# verify round-trip
wf2 = api("GET", f"/workflows/{WF_ID}")
names = [n['name'] for n in wf2['nodes']]
assert 'AI Reply Out' in names, "AI Reply Out missing after save!"
rules2 = [n for n in wf2['nodes'] if n['name'] == 'Route Step'][0]['parameters']['rules']['values']
assert any(r.get('outputKey') == 'ai_reply' for r in rules2), "ai_reply rule missing!"
cs2 = [n for n in wf2['nodes'] if n['name'] == 'Compute Step'][0]['parameters']['jsCode']
assert 'field-chat' in cs2, "AI gate missing in Compute Step!"
print("Verify OK: nodes =", len(names), "| ai_reply rule | AI gate present")
