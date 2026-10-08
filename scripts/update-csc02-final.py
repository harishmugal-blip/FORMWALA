#!/usr/bin/env python3
"""CSC 02 final: AI Brain using this.helpers.httpRequest (works in Code node sandbox)."""
import json
import urllib.request

API = "http://127.0.0.1:5678"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
WF = "3c5c0003-0000-4000-8000-000000000002"
HDR = {"X-N8N-API-KEY": KEY, "content-type": "application/json"}


def api(path, method="GET", body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None, headers=HDR)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


w = api(f"/api/v1/workflows/{WF}")

brain_code = r"""// CSC AI Brain — natural Hinglish conversation + intent classification.
// Calls local AI Agent service (127.0.0.1:8090) via n8n helper httpRequest.
// Falls back to keyword templates if the service is down. System never silent.
const input = $('Trigger').first().json || {};
let catalog = [];
try { catalog = $('Get Service Catalog').first().json.catalog || []; } catch (e) {}

const payload = {
  phone: input.phone || '',
  name: input.name || 'Customer',
  text: input.message || '',
  state: input.state || '',
  pending_service: input.pending_service || '',
  catalog,
};

let out = null;
try {
  out = await this.helpers.httpRequest({
    method: 'POST',
    url: 'http://127.0.0.1:8090/chat',
    body: payload,
    headers: { 'content-type': 'application/json' },
    json: true,
    timeout: 55000,
  });
} catch (e) {
  console.log('AI agent call failed:', String((e && e.message) || e));
}

let reply = String((out && out.reply) || '');
let service_id = String((out && out.service_id) || 'UNKNOWN');
let intent = String((out && out.intent) || 'GREETING');
let confidence = Number((out && out.confidence) || 0);

const VALID = ['NEW_APPLICATION', 'STATUS_CHECK', 'HUMAN_AGENT', 'GENERAL_QUESTION', 'GREETING'];
if (!VALID.includes(intent)) intent = 'GREETING';
if (confidence > 1) confidence = confidence / 100;

// Fallback (AI service down / bad response) — keyword templates
if (!reply) {
  const up = String(input.message || '').toUpperCase();
  const svcList = catalog.map((s, i) => (i + 1) + '. ' + s.service_name).join('\n');
  if (/HUMAN|AGENT|OPERATOR/.test(up)) {
    reply = 'Main aapko CSC operator se connect kar raha hoon. Wo thodi der me aapko reply karenge. 🙏';
    intent = 'HUMAN_AGENT'; confidence = 0.9;
  } else if (/STATUS/.test(up)) {
    reply = 'Aapki application ka status jald update hoga. Application number ke saath STATUS likhein.';
    intent = 'STATUS_CHECK'; confidence = 0.8;
  } else {
    reply = 'Namaste ' + (input.name || 'Customer') + '! 🙏 Main CSC Smart Seva ka sahayak hoon.\nHum ye services provide karte hain:\n' + svcList + '\n\nAap kya karwana chahenge?';
    intent = 'GREETING'; confidence = 0.5;
  }
  service_id = 'UNKNOWN';
}

return [{ json: { reply, phone: input.phone || '', name: input.name || 'Customer', service_id, intent, confidence } }];
"""

for n in w["nodes"]:
    if n.get("name") == "AI Brain":
        n["parameters"]["jsCode"] = brain_code

body = {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})}
api(f"/api/v1/workflows/{WF}", method="PUT", body=body)
w2 = api(f"/api/v1/workflows/{WF}")
names = [n.get("name") for n in w2.get("nodes", [])]
print("nodes:", names)
print("OK: AI Brain now uses helpers.httpRequest")
