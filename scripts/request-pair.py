#!/usr/bin/env python3
"""Wait for fresh bridge socket cycle, then request pairing code."""
import json
import time
import urllib.request

PHONE = "917668483205"
BASE = "http://127.0.0.1:8080"


def get(path, timeout=35):
    with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
        return json.loads(r.read().decode())


def fresh_socket():
    """Return True if socket is in a fresh QR cycle (qrAge < 15s)."""
    try:
        s = get("/status", timeout=5)
        return (
            not s.get("connected")
            and s.get("hasQr")
            and isinstance(s.get("qrAgeSec"), (int, float))
            and s["qrAgeSec"] < 15
        )
    except Exception:
        return False


print("Waiting for fresh WhatsApp connection cycle...")
deadline = time.time() + 90
ok = False
while time.time() < deadline:
    if fresh_socket():
        ok = True
        break
    time.sleep(2)

if not ok:
    print("NO_FRESH_CYCLE")
    raise SystemExit(1)

print("Fresh cycle detected -> requesting pairing code...")
for attempt in range(3):
    try:
        r = get(f"/pair/{PHONE}")
        print(json.dumps(r, indent=2))
        break
    except Exception as e:
        print(f"attempt {attempt+1} failed: {e}")
        time.sleep(4)
else:
    print("PAIR_FAILED")
    raise SystemExit(1)
