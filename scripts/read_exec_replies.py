#!/usr/bin/env python3
"""Read replies from n8n execution_data (reference-format JSON) — full ref resolution."""
import sqlite3, json, sys

con = sqlite3.connect("file:/home/z/.n8n/database.sqlite?mode=ro", uri=True)
cur = con.cursor()

def decode_all(blob):
    d = json.loads(blob)

    def deref(x, depth=0):
        """Follow string/int index refs into d, including single-element list wrappers."""
        while depth < 30:
            if isinstance(x, list) and len(x) == 1:
                x = x[0]; depth += 1; continue
            if isinstance(x, (str, int)) and not isinstance(x, bool) and str(x).lstrip('-').isdigit() and 0 <= int(x) < len(d):
                nx = d[int(x)]
                if nx == x:
                    break
                x = nx; depth += 1; continue
            break
        return x

    # find dicts having 'reply'; resolve reply refs
    found = []  # (node_hint, reply)
    def walk(obj, hint):
        if isinstance(obj, dict):
            if 'reply' in obj:
                r = deref(obj['reply'])
                if isinstance(r, str) and r.strip():
                    found.append((hint, r))
            if 'jsCode' in obj:
                return  # skip node source blobs (perf + noise)
            for k, v in obj.items():
                walk(v, k if hint == '' else hint)
        elif isinstance(obj, list):
            for v in obj:
                walk(v, hint)

    walk(d, '')
    return found

limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
rows = cur.execute("""SELECT e.id, e.status, d.data FROM execution_data d
    JOIN execution_entity e ON d.executionId = e.id
    WHERE e.mode='webhook' ORDER BY e.id DESC LIMIT ?""", (limit,)).fetchall()

for eid, status, blob in rows:
    try:
        reps = decode_all(blob)
    except Exception as ex:
        print(f"--- exec {eid} [{status}] decode-fail: {ex}")
        continue
    # dedupe keep order
    seen = set()
    uniq = [r for r in reps if not (r[1] in seen or seen.add(r[1]))]
    print(f"--- exec {eid} [{status}]")
    for hint, r in uniq:
        print(f"    [{hint}] {r[:300]}")
