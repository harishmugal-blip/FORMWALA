#!/usr/bin/env python3
"""Patch CSC 12 Payment Message with AI compose (link-safe)."""
import json
import re
import urllib.request
import urllib.error

API = "http://127.0.0.1:5678"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
HDR = {"X-N8N-API-KEY": KEY, "content-type": "application/json"}


def api(path, method="GET", body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None, headers=HDR)
    try:
        return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    except urllib.error.HTTPError as e:
        body_txt = ""
        try:
            body_txt = e.read().decode()[:400]
        except Exception:
            pass
        print(f"HTTP {e.code} on {method} {path}: {body_txt}")
        raise SystemExit(1)


WF = "3c5c1212-0000-4000-8000-000000000012"
w = api(f"/api/v1/workflows/{WF}")
# strip invalid top-level node keys (import tolerated them, PUT validates strictly)
ALLOWED = {"parameters", "id", "name", "type", "typeVersion", "position", "disabled", "notes",
           "notesInFlow", "retryOnFail", "maxTries", "waitBetweenTries", "alwaysOutputData",
           "executeOnce", "onError", "credentials", "webhookId"}
clean_nodes = []
for nd in w["nodes"]:
    clean_nodes.append({k: v for k, v in nd.items() if k in ALLOWED})
w["nodes"] = clean_nodes
n = next(x for x in w["nodes"] if x["name"] == "Payment Message")
code = n["parameters"]["jsCode"]
if "aiCompose" in code:
    print("already patched")
    raise SystemExit(0)

m = re.search(r"return \[\{ json: \{ reply: msg, phone: info\.phone, payment_id: info\.payment_id \} \}\s*\];", code)
if not m:
    print("PATTERN NOT FOUND, tail:", code[-120:])
    raise SystemExit(1)

helper = """// AI compose (link-safe): natural phrasing; URL ke numbers/links change hue to draft fallback
async function aiCompose(kind, phone, draft, payload) {
  try {
    const ai = await this.helpers.httpRequest({
      method: 'POST', url: 'http://127.0.0.1:8090/compose',
      body: { kind, phone, draft, payload },
      headers: { 'content-type': 'application/json' }, json: true, timeout: 30000,
    });
    if (ai && ai.text) return String(ai.text);
  } catch (e) {}
  return draft;
}
"""
call = "_out = await aiCompose('payment_note', info.phone, _out, { service_name: (info.service_id || '') });"
newcode = (helper + code[:m.start()] + "let _out = msg;\n" + call +
           "\nreturn [{ json: { reply: _out, phone: info.phone, payment_id: info.payment_id } }];")
n["parameters"]["jsCode"] = newcode
body = {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})}
api(f"/api/v1/workflows/{WF}", method="PUT", body=body)
try:
    api(f"/api/v1/workflows/{WF}/activate", method="POST")
except SystemExit:
    pass
print("Payment Message patched (link-safe)")
