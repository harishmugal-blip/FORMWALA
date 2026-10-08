#!/usr/bin/env python3
"""Fix CSC 01 Router: route ALL replies through CSC 20 (tri-mode sender) instead of legacy Meta-only sender."""
import json
import urllib.request

KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
BASE = "http://localhost:5678/api/v1"
CSC01 = "3c5c0004-0000-4000-8000-000000000001"
CSC20 = "3c5c2020-0000-4000-8000-000000000020"
SRC = "/home/z/my-project/scripts/wf-edit/csc01-live.json"


def api(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE + path, data=body, method=method)
    r.add_header("X-N8N-API-KEY", KEY)
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


wf = json.load(open(SRC))
nodes = wf["nodes"]
conns = wf["connections"]

# 1. drop legacy Meta-only sender node
nodes = [n for n in nodes if n["name"] != "Send WhatsApp Reply"]
conns.pop("Send WhatsApp Reply", None)

# 2. remove old Build Send Payload -> (Send WhatsApp Reply) connection
bp = conns.get("Build Send Payload", {})
bp.pop("main", None)
conns["Build Send Payload"] = bp

# 3. add Prep Sender Payload code node
prep = {
    "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": (
            "const b = $('Build Send Payload').first().json;\n"
            "return [{ json: { phone: b.to, message: b.reply, template: 'GENERIC', related_id: b.to } }];"
        ),
    },
    "name": "Prep Sender Payload",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [1216, 640],
}
nodes.append(prep)

# 4. add Run Sender executeWorkflow node (same shape as existing Run Operator Assistant)
run_sender = {
    "parameters": {
        "source": "database",
        "workflowId": CSC20,
        "workflowInputs": {
            "mappingMode": "defineBelow",
            "value": {
                "phone": "={{ $json.phone }}",
                "message": "={{ $json.message }}",
                "template": "={{ $json.template }}",
                "related_id": "={{ $json.related_id }}",
            },
        },
    },
    "name": "Run Sender",
    "type": "n8n-nodes-base.executeWorkflow",
    "typeVersion": 1,
    "position": [1440, 640],
}
nodes.append(run_sender)

# 5. rewire: Build Send Payload -> Prep Sender Payload -> Run Sender -> Respond 200
conns["Build Send Payload"]["main"] = [[{"node": "Prep Sender Payload", "type": "main", "index": 0}]]
conns["Prep Sender Payload"] = {"main": [[{"node": "Run Sender", "type": "main", "index": 0}]]}
conns["Run Sender"] = {"main": [[{"node": "Respond 200", "type": "main", "index": 0}]]}

# 6. update Respond 200 label to real sender mode
for n in nodes:
    if n["name"] == "Respond 200":
        n["parameters"]["responseBody"] = (
            "={{ JSON.stringify({ ok: true, "
            "sent_via: $('Run Sender').first().json.mode || ($('Run Sender').first().json.mock ? 'mock' : 'sender-error'), "
            "wa_msg_id: $('Run Sender').first().json.wa_message_id || '', "
            "send_error: $('Run Sender').first().json.error || '', "
            "reply: $('Build Send Payload').first().json.reply }) }}"
        )

payload = {"name": wf["name"], "nodes": nodes, "connections": conns, "settings": wf.get("settings", {})}
code, resp = api("PUT", f"/workflows/{CSC01}", payload)
print("CSC 01 UPDATE:", code, "" if code == 200 else str(resp)[:200])
code, resp = api("POST", f"/workflows/{CSC01}/publish")
print("CSC 01 PUBLISH:", code, "" if code in (200, 201) else str(resp)[:200])
