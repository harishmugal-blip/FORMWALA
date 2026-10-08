#!/usr/bin/env python3
"""Point n8n system_config EVO_* keys at the CSC WhatsApp bridge (dynamic table lookup)."""
import json
import sqlite3
import urllib.request

DB = "/home/z/.n8n/database.sqlite"
API = "http://localhost:5678/api/v1"
HDR = {"X-N8N-API-KEY": "n8n_api_csc-build-2026-a7f3d9e2b8c4", "Content-Type": "application/json"}

CFG = {
    "EVO_URL": "http://127.0.0.1:8080",
    "EVO_API_KEY": "csc-bridge-2026",
    "EVO_INSTANCE": "csc",
}

# 1. find system_config table id via API
req = urllib.request.Request(f"{API}/data-tables?limit=100", headers=HDR)
tables = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())["data"]
tid = next(t["id"] for t in tables if t["name"] == "system_config")
ROW_TBL = f"data_table_user_{tid}"
print("system_config:", tid, "->", ROW_TBL)

# 2. update rows directly in sqlite
con = sqlite3.connect(DB, timeout=10)
con.execute("PRAGMA busy_timeout=8000")
cur = con.cursor()
for k, v in CFG.items():
    cur.execute(
        f"UPDATE {ROW_TBL} SET config_value=?, updated_at=? WHERE config_key=?",
        (v, "2026-10-03T05:30:00.000Z", k),
    )
    print(f"UPDATE {k}: {cur.rowcount} row(s)")
con.commit()
con.close()

# 3. verify via n8n API
req = urllib.request.Request(f"{API}/data-tables/{tid}/rows?limit=100", headers=HDR)
rows = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())["data"]
print("=== VERIFY ===")
for r in rows:
    if r["config_key"] in CFG or r["config_key"] == "WA_MODE":
        print(f"  {r['config_key']} = {r['config_value']}")
