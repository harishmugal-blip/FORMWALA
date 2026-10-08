#!/usr/bin/env python3
"""CSC 01 fix: BR Research must prefer the AI reply over the old researcher template."""
import json
import urllib.request

API = "http://127.0.0.1:5678"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
WF = "3c5c0004-0000-4000-8000-000000000001"  # CSC 01
HDR = {"X-N8N-API-KEY": KEY, "content-type": "application/json"}


def api(path, method="GET", body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None, headers=HDR)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


w = api(f"/api/v1/workflows/{WF}")
changed = False
for n in w["nodes"]:
    if n.get("name") == "BR Research":
        old = n["parameters"]["jsCode"]
        n["parameters"]["jsCode"] = (
            "// Prefer natural AI reply; researcher output only as backup\n"
            "let ai = {};\n"
            "try { ai = $('AI Intent (CSC 02)').first().json; } catch (e) {}\n"
            "const r = $json;\n"
            "return [{ json: { reply: ai.reply || r.reply || 'Service list bhej raha hoon...', "
            "phone: $('Route Decision').first().json.phone } }];"
        )
        changed = True
        print("OLD:", old[:120])
        print("NEW:", n["parameters"]["jsCode"][:160])

assert changed, "BR Research node not found"
body = {"name": w["name"], "nodes": w["nodes"], "connections": w["connections"], "settings": w.get("settings", {})}
api(f"/api/v1/workflows/{WF}", method="PUT", body=body)
print("OK: CSC 01 BR Research updated")
