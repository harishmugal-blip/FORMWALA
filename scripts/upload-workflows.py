#!/usr/bin/env python3
"""Upload modified workflows to n8n and publish."""
import json, urllib.request

KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
BASE = "http://localhost:5678/api/v1"

def api(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE + path, data=body, method=method)
    r.add_header("X-N8N-API-KEY", KEY)
    r.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(r, timeout=60)
        return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]

JOBS = [
    ("3c5c0004-0000-4000-8000-000000000001", "/home/z/my-project/scripts/wf-edit/csc01.json", "CSC 01"),
    ("3c5c2020-0000-4000-8000-000000000020", "/home/z/my-project/scripts/wf-edit/csc20.json", "CSC 20"),
]

for wid, path, label in JOBS:
    wf = json.load(open(path))
    payload = {
        "name": wf["name"],
        "nodes": wf["nodes"],
        "connections": wf["connections"],
        "settings": wf.get("settings", {}),
    }
    code, resp = api("PUT", f"/workflows/{wid}", payload)
    print(f"{label} UPDATE: {code}", "" if code == 200 else str(resp)[:200])
    code, resp = api("POST", f"/workflows/{wid}/publish")
    print(f"{label} PUBLISH: {code}", "" if code in (200, 201) else str(resp)[:200])
