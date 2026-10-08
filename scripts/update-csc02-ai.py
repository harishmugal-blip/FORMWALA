#!/usr/bin/env python3
"""CSC 02 surgery: replace OpenRouter chainLlm brain with local AI Agent service (port 8090).
Keeps the exact output contract {reply, phone, name, service_id, intent, confidence}."""
import json
import urllib.request

API = "http://127.0.0.1:5678"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
WF = "3c5c0003-0000-4000-8000-000000000002"  # CSC 02 - AI Intent Engine

HDR = {"X-N8N-API-KEY": KEY, "content-type": "application/json"}


def api(path, method="GET", body=None):
    req = urllib.request.Request(
        API + path, method=method,
        data=json.dumps(body).encode() if body else None,
        headers=HDR,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


w = api(f"/api/v1/workflows/{WF}")
print("fetched:", w["name"], "| nodes:", len(w["nodes"]))

REMOVE = {"Build Prompt", "AI Intent Detection", "OpenRouter Model", "Validate & Reply"}
nodes = [n for n in w["nodes"] if n.get("name") not in REMOVE]

http_node = {
    "parameters": {
        "method": "POST",
        "url": "http://127.0.0.1:8090/chat",
        "sendBody": True,
        "contentType": "application/json",
        "specifyBody": "json",
        "jsonBody": (
            "={{ JSON.stringify({"
            "phone: $('Trigger').first().json.phone || '', "
            "name: $('Trigger').first().json.name || 'Customer', "
            "text: $('Trigger').first().json.message || '', "
            "state: $('Trigger').first().json.state || '', "
            "pending_service: $('Trigger').first().json.pending_service || '', "
            "catalog: $json.catalog || [] }) }}"
        ),
        "options": {"timeout": 90000},
    },
    "id": "csc02-call-ai-agent",
    "name": "Call AI Agent",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [400, 300],
    "onError": "continueRegularOutput",
}

shape_code = """// Shape AI Agent output -> CSC 01 contract {reply, phone, name, service_id, intent, confidence}
const t = $('Trigger').first().json;
let catalog = [];
try { catalog = $('Get Service Catalog').first().json.catalog || []; } catch (e) {}

let reply = ($json.reply || '').toString();
let service_id = ($json.service_id || 'UNKNOWN').toString();
let intent = ($json.intent || 'GREETING').toString();
let confidence = Number($json.confidence) || 0;

const VALID = ['NEW_APPLICATION', 'STATUS_CHECK', 'HUMAN_AGENT', 'GENERAL_QUESTION', 'GREETING'];
if (!VALID.includes(intent)) intent = 'GREETING';
if (confidence > 1) confidence = confidence / 100;

// Fallback (AI service down / unparseable) - keyword templates, system never silent
if (!reply) {
  const up = String(t.message || '').toUpperCase();
  const svcList = catalog.map((s, i) => (i + 1) + '. ' + s.service_name).join('\\n');
  if (/HUMAN|AGENT|OPERATOR/.test(up)) {
    reply = 'Main aapko CSC operator se connect kar raha hoon. Wo thodi der me aapko reply karenge. 🙏';
    intent = 'HUMAN_AGENT'; confidence = 0.9;
  } else if (/STATUS/.test(up)) {
    reply = 'Aapki application ka status jald update hoga. Application number ke saath STATUS likhein.';
    intent = 'STATUS_CHECK'; confidence = 0.8;
  } else {
    reply = 'Namaste ' + (t.name || 'Customer') + '! 🙏 Main CSC Smart Seva ka sahayak hoon.\\nHum ye services provide karte hain:\\n' + svcList + '\\n\\nAap kya karwana chahenge?';
    intent = 'GREETING'; confidence = 0.5;
  }
  service_id = 'UNKNOWN';
}

return [{ json: { reply, phone: t.phone || '', name: t.name || 'Customer', service_id, intent, confidence } }];
"""

shape_node = {
    "parameters": {"mode": "runOnceForAllItems", "jsCode": shape_code},
    "id": "csc02-shape-output",
    "name": "Shape Output",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [620, 300],
}

nodes.extend([http_node, shape_node])

# rewire: Get Service Catalog -> Call AI Agent -> Shape Output
conn = {
    "Trigger": {"main": [[{"node": "Get Service Catalog", "type": "main", "index": 0}]]},
    "Get Service Catalog": {"main": [[{"node": "Call AI Agent", "type": "main", "index": 0}]]},
    "Call AI Agent": {"main": [[{"node": "Shape Output", "type": "main", "index": 0}]]},
}

body = {
    "name": w["name"],
    "nodes": nodes,
    "connections": conn,
    "settings": w.get("settings", {}),
}
api(f"/api/v1/workflows/{WF}", method="PUT", body=body)
print("PUT done")

# verify
w2 = api(f"/api/v1/workflows/{WF}")
names = [n.get("name") for n in w2.get("nodes", [])]
print("new nodes:", names)
assert "Call AI Agent" in names and "Shape Output" in names
assert "OpenRouter Model" not in names
print("OK: CSC 02 now uses local AI Agent service")
