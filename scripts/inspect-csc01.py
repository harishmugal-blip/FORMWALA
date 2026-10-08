#!/usr/bin/env python3
"""Inspect CSC 01 (router) webhook + Normalize Message code, and CSC 20 (sender) Evolution nodes."""
import json
import urllib.request

BASE = "http://localhost:5678/api/v1"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
HDR = {"X-N8N-API-KEY": KEY, "Content-Type": "application/json"}

CSC01 = "3c5c0004-0000-4000-8000-000000000001"
CSC20 = "3c5c2020-0000-4000-8000-200000000000"


def get_wf(wid):
    req = urllib.request.Request(f"{BASE}/workflows/{wid}", headers=HDR)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def list_wfs():
    req = urllib.request.Request(f"{BASE}/workflows?limit=100", headers=HDR)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def find_id(name_prefix):
    data = list_wfs()
    for w in data.get("data", []):
        if w.get("name", "").startswith(name_prefix):
            return w["id"]
    return None


def main():
    wf = get_wf(CSC01)
    print("=== CSC 01:", wf.get("name"))
    for n in wf.get("nodes", []):
        ntype = n.get("type", "")
        if "webhook" in ntype:
            print(f"[WEBHOOK] name={n.get('name')} path={n.get('parameters', {}).get('path')} method={n.get('parameters', {}).get('httpMethod')}")
        if n.get("name") == "Normalize Message":
            code = n.get("parameters", {}).get("jsCode", "")
            print("--- Normalize Message jsCode START ---")
            print(code)
            print("--- Normalize Message jsCode END ---")

    csc20_id = find_id("CSC 20")
    print("\nCSC 20 id =", csc20_id)
    wf20 = get_wf(csc20_id)
    print("\n=== CSC 20:", wf20.get("name"))
    for n in wf20.get("nodes", []):
        nname = n.get("name", "")
        if nname in ("Send Evolution", "Update Sent Status", "Send Mode", "Check WA Creds", "Get EVO URL", "Get EVO API Key", "Get EVO Instance"):
            print(f"\n--- [{nname}] type={n.get('type')}")
            print(json.dumps(n.get("parameters", {}), indent=1)[:2500])


if __name__ == "__main__":
    main()
