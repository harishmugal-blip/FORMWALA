#!/usr/bin/env python3
"""Modify CSC 20 Sender: add Evolution API branch (config-based, priority: EVO > META > MOCK)."""
import json

F = "/home/z/my-project/scripts/wf-edit/csc20.json"
d = json.load(open(F))

DT_GET = {
    "resource": "row",
    "operation": "get",
    "dataTableId": {"__rl": True, "mode": "name", "value": "system_config"},
    "matchType": "allConditions",
    "filters": {"conditions": [{"keyName": "config_key", "condition": "eq", "keyValue": "={KEY}"}]},
    "returnAll": False,
    "limit": 1,
}

def dt_node(name, key, pos):
    p = json.loads(json.dumps(DT_GET).replace("{KEY}", key))
    return {
        "parameters": p,
        "id": f"evo-{key.lower()}-node",
        "name": name,
        "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1.1,
        "position": pos,
    }

# 1. Remove old IF node, add 3 EVO config lookups + Switch + Send Evolution
d["nodes"] = [n for n in d["nodes"] if n["name"] != "Creds Ready?"]

d["nodes"].append(dt_node("Get EVO URL", "EVO_URL", [-200, 560]))
d["nodes"].append(dt_node("Get EVO API Key", "EVO_API_KEY", [-200, 700]))
d["nodes"].append(dt_node("Get EVO Instance", "EVO_INSTANCE", [-200, 840]))

d["nodes"].append({
    "parameters": {
        "rules": {"values": [
            {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
              "conditions": [{"id": "r-evo", "leftValue": "={{ $json.mode }}", "rightValue": "evo",
                              "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"},
             "renameOutput": True, "outputKey": "evo"},
            {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
              "conditions": [{"id": "r-meta", "leftValue": "={{ $json.mode }}", "rightValue": "meta",
                              "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"},
             "renameOutput": True, "outputKey": "meta"},
            {"conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
              "conditions": [{"id": "r-mock", "leftValue": "={{ $json.mode }}", "rightValue": "mock",
                              "operator": {"type": "string", "operation": "equals"}}], "combinator": "and"},
             "renameOutput": True, "outputKey": "mock"}
        ]},
        "options": {}
    },
    "id": "evo-send-mode-switch",
    "name": "Send Mode",
    "type": "n8n-nodes-base.switch",
    "typeVersion": 3.2,
    "position": [560, 300]
})

d["nodes"].append({
    "parameters": {
        "method": "POST",
        "url": "={{ $('Check WA Creds').first().json.evoUrl }}/message/sendText/{{ $('Check WA Creds').first().json.evoInst }}",
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "apikey", "value": "={{ $('Check WA Creds').first().json.evoKey }}"},
            {"name": "Content-Type", "value": "application/json"}
        ]},
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ number: $('Check WA Creds').first().json.phone.replace(/\\D/g, ''), text: $('Check WA Creds').first().json.message, linkPreview: false }) }}",
        "options": {"response": {"response": {"neverError": True}}, "timeout": 30000}
    },
    "id": "evo-send-http-node",
    "name": "Send Evolution",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [820, 160]
})

# 2. Update Check WA Creds code
for n in d["nodes"]:
    if n["name"] == "Check WA Creds":
        n["parameters"]["jsCode"] = """const pid = $('Get Phone ID').first().json.config_value || '';
const token = $('Get Token').first().json.config_value || '';
const ver = $('Get API Ver').first().json.config_value || 'https://graph.facebook.com/v21.0';
const evoUrlRow = $('Get EVO URL').first().json || {};
const evoKeyRow = $('Get EVO API Key').first().json || {};
const evoInstRow = $('Get EVO Instance').first().json || {};
const evoUrl = (evoUrlRow.config_value || '').replace(/\\/+$/, '');
const evoKey = evoKeyRow.config_value || '';
const evoInst = evoInstRow.config_value || '';
const isSet = v => v && !v.startsWith('SET_');
const metaReady = isSet(pid) && isSet(token);
const evoReady = isSet(evoUrl) && isSet(evoKey) && isSet(evoInst);
const mode = evoReady ? 'evo' : (metaReady ? 'meta' : 'mock');
const t = $('Trigger').first().json;
return [{ json: { ready: metaReady, evoReady, mode, pid, token, ver, evoUrl, evoKey, evoInst, phone: t.phone, message: t.message, template: t.template || 'GENERIC', related_id: t.related_id || t.phone } }];"""

# 3. Update Update Sent Status (handle Meta + Evolution response shapes)
for n in d["nodes"]:
    if n["name"] == "Update Sent Status":
        n["parameters"]["jsCode"] = """const r = $json;
const waMsgId = (r.messages && r.messages[0] && r.messages[0].id) || (r.key && r.key.id) || '';
const err = r.error ? String(r.error.message || JSON.stringify(r.error)).slice(0, 500) : '';
return [{ json: { waMsgId, err, phone: $('Check WA Creds').first().json.phone, related_id: $('Check WA Creds').first().json.related_id } }];"""
    if n["name"] == "Mock Send":
        n["parameters"]["jsCode"] = """const c = $('Check WA Creds').first().json;
return [{ json: { ok: true, mock: true, phone: c.phone, message: c.message, related_id: c.related_id, note: 'Sender MOCK mode - koi credentials set nahi. Evolution (EVO_URL/EVO_API_KEY/EVO_INSTANCE) ya Meta (WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID) system_config mein daalte hi real WhatsApp send shuru ho jayega.' } }];"""
    if n["name"] == "Sent Output":
        n["parameters"]["jsCode"] = """return [{ json: { ok: true, mock: false, mode: $('Check WA Creds').first().json.mode, wa_message_id: $json.waMsgId, error: $json.err } }];"""

# 4. Rewire connections
C = d["connections"]
C["Get API Ver"] = {"main": [[{"node": "Get EVO URL", "type": "main", "index": 0}]]}
C["Get EVO URL"] = {"main": [[{"node": "Get EVO API Key", "type": "main", "index": 0}]]}
C["Get EVO API Key"] = {"main": [[{"node": "Get EVO Instance", "type": "main", "index": 0}]]}
C["Get EVO Instance"] = {"main": [[{"node": "Check WA Creds", "type": "main", "index": 0}]]}
C["Check WA Creds"] = {"main": [[{"node": "Send Mode", "type": "main", "index": 0}]]}
C["Send Mode"] = {"main": [
    [{"node": "Send Evolution", "type": "main", "index": 0}],
    [{"node": "Send WhatsApp", "type": "main", "index": 0}],
    [{"node": "Mock Send", "type": "main", "index": 0}]
]}
C["Send Evolution"] = {"main": [[{"node": "Update Sent Status", "type": "main", "index": 0}]]}

json.dump(d, open(F, "w"), indent=1)
print("CSC 20 modified. Nodes:", len(d["nodes"]))
