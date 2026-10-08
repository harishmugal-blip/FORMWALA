#!/usr/bin/env python3
"""Point n8n system_config EVO_* keys at the local CSC WhatsApp bridge."""
import json
import sqlite3
import urllib.request
import urllib.error

BASE = "http://localhost:5678/api/v1"
KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4"
HDR = {"X-N8N-API-KEY": KEY, "Content-Type": "application/json"}

CONFIG = {
    "EVO_URL": "http://127.0.0.1:8080",
    "EVO_API_KEY": "csc-bridge-2026",
    "EVO_INSTANCE": "csc",
}
DB = "/home/z/.n8n/database.sqlite"


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=HDR, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def find_table_id():
    st, data = api("GET", "/data-tables?limit=100")
    if st != 200:
        print("list tables failed:", st, data)
        return None
    for t in data.get("data", []):
        if t.get("name") == "system_config":
            return t["id"]
    return None


def api_update(table_id, row_id, values):
    st, resp = api("PATCH", f"/data-tables/{table_id}/rows/{row_id}", values)
    return st, resp


def sqlite_update(table_id, updates):
    """Fallback: update rows directly in database.sqlite."""
    con = sqlite3.connect(DB, timeout=10)
    con.execute("PRAGMA busy_timeout=8000")
    cur = con.cursor()
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%data_table%'")]
    print("sqlite data tables:", tables)
    row_table = None
    for t in tables:
        cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})")]
        print(f"  {t}: {cols}")
        if t.endswith("_row") and "dataTableId" in "".join(cols).replace("data_table_id", "dataTableId"):
            row_table = t
    if not row_table:
        # pick the one that has a data/table id column and json payload
        for t in tables:
            cols = [c[1] for c in cur.execute(f"PRAGMA table_info({t})")]
            if any("data" in c.lower() for c in cols) and any("table" in c.lower() for c in cols):
                row_table = t
                break
    if not row_table:
        print("!! could not locate row storage table")
        con.close()
        return False
    cols = [c[1] for c in cur.execute(f"PRAGMA table_info({row_table})")]
    print("using row table:", row_table, cols)
    ok = True
    for row_id, values in updates.items():
        for colname, val in values.items():
            # try JSON data column style first
            try:
                cur.execute(
                    f"SELECT id FROM {row_table} WHERE id=? ", (row_id,))
                hit = cur.fetchone()
                if not hit:
                    ok = False
                    continue
                # generic: update json in 'data' column if exists, else named column
                if "data" in cols:
                    cur.execute(
                        f"UPDATE {row_table} SET data=json_set(data, '$.{colname}', ?) "
                        f"WHERE id=?", (val, row_id))
                    if cur.rowcount == 0:
                        ok = False
                elif colname in cols:
                    cur.execute(
                        f"UPDATE {row_table} SET {colname}=? WHERE id=?", (val, row_id))
                    if cur.rowcount == 0:
                        ok = False
            except Exception as e:
                print("sqlite update error:", e)
                ok = False
    con.commit()
    con.close()
    return ok


def main():
    tid = find_table_id()
    print("system_config table id:", tid)
    if not tid:
        return
    st, rows = api("GET", f"/data-tables/{tid}/rows?limit=100")
    print("rows fetch:", st)
    items = rows.get("data", []) if isinstance(rows, dict) else []
    if isinstance(rows, list):
        items = rows
    id_by_key = {}
    for r in items:
        id_by_key[r.get("config_key")] = r.get("id")
    print("EVO rows:", {k: id_by_key.get(k) for k in CONFIG})

    pending = {}
    for k, v in CONFIG.items():
        rid = id_by_key.get(k)
        if not rid:
            print(f"!! row for {k} not found — insert needed")
            st, resp = api("POST", f"/data-tables/{tid}/rows",
                           {"returnType": "all", "data": {
                               "config_key": k, "config_value": v,
                               "description": "CSC WhatsApp bridge (Baileys/Evolution-compatible)",
                               "updated_at": "2026-10-03T05:00:00.000Z"}})
            print(f"insert {k}:", st, str(resp)[:120])
            continue
        now = "2026-10-03T05:00:00.000Z"
        st, resp = api_update(tid, rid, {
            "config_value": v, "updated_at": now})
        if st == 200:
            print(f"PATCH {k} -> OK")
        else:
            print(f"PATCH {k} -> {st} {str(resp)[:150]} — fallback sqlite")
            pending[rid] = {"config_value": v}
    if pending:
        ok = sqlite_update(tid, pending)
        print("sqlite fallback result:", ok)

    # verify
    st, rows = api("GET", f"/data-tables/{tid}/rows?limit=100")
    items = rows.get("data", []) if isinstance(rows, dict) else (rows or [])
    print("\n=== VERIFY ===")
    for r in items:
        if r.get("config_key") in CONFIG or r.get("config_key") == "WA_MODE":
            print(f"  {r.get('config_key')} = {r.get('config_value')}")


if __name__ == "__main__":
    main()
