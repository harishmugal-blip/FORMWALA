#!/usr/bin/env python3
"""CSC 08 Doc Collector: add mid-DOCS AI gate (side questions answered naturally).
Pattern same as CSC 06 gate: Match Next Doc -> AI Doc Gate -> AI Handled? -> AI Reply Out / All Docs Already?"""
import json
import urllib.request

API = "http://127.0.0.1:5678"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
WF = "3c5c0808-0000-4000-8000-000000000008"  # CSC 08
HDR = {"X-N8N-API-KEY": KEY, "content-type": "application/json"}


def api(path, method="GET", body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None, headers=HDR)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


w = api(f"/api/v1/workflows/{WF}")
names = [n.get("name") for n in w["nodes"]]

if "AI Doc Gate" not in names:
    gate_code = r"""// Mid-DOCS AI gate: side questions ("JPEG chalegi kya?") answered naturally.
// Media / empty text -> instant passthrough (no AI call, no delay).
const m = $json;
const text = String(m.text || '').trim();
if (!text || m.hasMedia) return [{ json: m }];
let out = null;
try {
  out = await this.helpers.httpRequest({
    method: 'POST',
    url: 'http://127.0.0.1:8090/field-chat',
    body: {
      phone: m.phone,
      name: 'Customer',
      text,
      state: 'DOCS',
      service_name: (m.service && (m.service.service_name || m.service.name)) || '',
      docs: m.missing || [],
      collected: m.savedCount || 0,
    },
    headers: { 'content-type': 'application/json' },
    json: true,
    timeout: 55000,
  });
} catch (e) {
  console.log('AI doc gate failed (passthrough):', String((e && e.message) || e));
}
if (out && out.action === 'reply' && out.reply) {
  return [{ json: { ai_handled: true, reply: String(out.reply), phone: m.phone } }];
}
return [{ json: m }];"""
    w["nodes"].append({
        "parameters": {"mode": "runOnceForAllItems", "jsCode": gate_code},
        "id": "csc08-ai-doc-gate",
        "name": "AI Doc Gate",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1240, 300],
    })

if "AI Handled?" not in names:
    w["nodes"].append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
                "conditions": [{
                    "id": "aih-1",
                    "leftValue": "={{ $json.ai_handled }}",
                    "rightValue": True,
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                }],
                "combinator": "and",
            }
        },
        "id": "csc08-ai-handled-if",
        "name": "AI Handled?",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [1460, 300],
    })

if "AI Reply Out" not in names:
    w["nodes"].append({
        "parameters": {"mode": "runOnceForAllItems", "jsCode":
            "return [{ json: { reply: $json.reply, phone: $json.phone } }];"},
        "id": "csc08-ai-reply-out",
        "name": "AI Reply Out",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1680, 200],
    })

# rewire: Match Next Doc -> AI Doc Gate -> AI Handled? -> (true) AI Reply Out / (false) All Docs Already?
c = w["connections"]
c["Match Next Doc"] = {"main": [[{"node": "AI Doc Gate", "type": "main", "index": 0}]]}
c["AI Doc Gate"] = {"main": [[{"node": "AI Handled?", "type": "main", "index": 0}]]}
c["AI Handled?"] = {"main": [
    [{"node": "AI Reply Out", "type": "main", "index": 0}],
    [{"node": "All Docs Already?", "type": "main", "index": 0}],
]}

body = {"name": w["name"], "nodes": w["nodes"], "connections": c, "settings": w.get("settings", {})}
api(f"/api/v1/workflows/{WF}", method="PUT", body=body)
try:
    api(f"/api/v1/workflows/{WF}/activate", method="POST")
except Exception as e:
    print("activate:", str(e)[:150])

w2 = api(f"/api/v1/workflows/{WF}")
n2 = [n["name"] for n in w2["nodes"]]
mnd = w2["connections"].get("Match Next Doc", {}).get("main", [])
print("nodes:", len(n2), "| AI gate nodes:", [n for n in n2 if "AI" in n])
print("Match Next Doc ->", [t["node"] for t in (mnd[0] if mnd else [])])
print("OK: CSC 08 AI gate installed")
