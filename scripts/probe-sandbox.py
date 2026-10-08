#!/usr/bin/env python3
"""Diagnostic: probe what globals the n8n Code node sandbox exposes."""
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
probe = r"""// sandbox capability probe
const caps = {
  fetch: typeof fetch,
  httpRequire: (() => { try { return typeof require('node:http'); } catch (e) { return 'ERR:' + String(e.message).slice(0, 60); } })(),
  helpers: typeof this !== 'undefined' ? typeof this.helpers : 'no-this',
  process: typeof process,
};
return [{ json: { probe: caps } }];
"""
for n in w["nodes"]:
    if n.get("name") == "AI Brain":
        n["parameters"]["jsCode"] = probe
body = {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})}
api(f"/api/v1/workflows/{WF}", method="PUT", body=body)
print("probe version saved")
