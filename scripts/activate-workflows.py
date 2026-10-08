#!/usr/bin/env python3
"""Activate all CSC workflows via n8n public API."""
import json, urllib.request, time

KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
BASE = "http://localhost:5678/api/v1"

def api(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(BASE + path, data=body, method=method)
    r.add_header("X-N8N-API-KEY", KEY)
    r.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(r, timeout=30)
        return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]

ok, fail = [], []
# Real IDs (CSC 01-04 have irregular IDs from original creation order)
ID_MAP = {
    1: "3c5c0004-0000-4000-8000-000000000001",
    2: "3c5c0003-0000-4000-8000-000000000002",
    3: "3c5c0001-0000-4000-8000-000000000003",
    4: "3c5c0002-0000-4000-8000-000000000004",
}
def get_id(wid):
    if wid in ID_MAP:
        return ID_MAP[wid]
    return f"3c5c{wid:02d}{wid:02d}-0000-4000-8000-{wid:012d}"

def publish(wid):
    wf_id = get_id(wid)
    code, resp = api("POST", f"/workflows/{wf_id}/publish")
    return wf_id, code, resp

# Pass 1
pending = []
for wid in range(1, 26):
    wf_id, code, resp = publish(wid)
    if code in (200, 201):
        ok.append(wid)
        print(f"  OK  CSC {wid:02d}")
    else:
        pending.append((wid, code, resp))
        print(f"  FAIL CSC {wid:02d}: {code} {str(resp)[:80]}")

# Pass 2 for dependency-order failures
print("\n--- PASS 2 (dependencies now published) ---")
still = []
for wid, _, _ in pending:
    wf_id, code, resp = publish(wid)
    if code in (200, 201):
        ok.append(wid)
        print(f"  OK  CSC {wid:02d}")
    else:
        still.append((wid, code, resp))
        print(f"  FAIL CSC {wid:02d}: {code} {str(resp)[:80]}")

print(f"\nPUBLISHED: {len(ok)}/25, STILL FAILED: {len(still)}")
for wid, code, resp in still:
    print(f"  CSC {wid:02d}: {code} {str(resp)[:150]}")
