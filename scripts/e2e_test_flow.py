#!/usr/bin/env python3
"""E2E test: fake phone -> CSC 01 webhook -> full flow. Then read replies from n8n sqlite."""
import json, sqlite3, subprocess, sys, time

WH = "http://127.0.0.1:5678/webhook/whatsapp"
FAKE = "9999990001"

def send(text, pause=6):
    payload = json.dumps({"from": FAKE, "text": text, "name": "E2E Test"})
    r = subprocess.run(["curl", "-s", "-m", "90", "-X", "POST", WH,
                        "-H", "content-type: application/json", "-d", payload],
                       capture_output=True, text=True)
    print(f">>> SENT: {text!r}  (webhook resp: {r.stdout[:60]})")
    time.sleep(pause)

steps = sys.argv[1:] or ["mool niwas banana he", "CONFIRM", "Ye kitne din me ban jata hai?", "Mohd Test Singh", "CANCEL"]
for s in steps:
    send(s)

# read replies sent for this fake phone from latest executions
con = sqlite3.connect("file:/home/z/.n8n/database.sqlite?mode=ro", uri=True)
cur = con.cursor()
rows = cur.execute("""
    SELECT e.id, d.workflowData, d.data
    FROM execution_entity e JOIN execution_data d ON d.executionId = e.id
    WHERE e.mode='webhook' ORDER BY e.id DESC LIMIT 12
""").fetchall()

print("\n===== REPLIES SENT (last 12 webhook executions) =====")
for eid, wfd, rd in rows:
    try:
        rundata = json.loads(rd)
    except Exception:
        continue
    replies = []
    for node, runs in (rundata or {}).items():
        if node not in ("Build Send Payload", "Prep Sender Payload", "BR Fields", "BR Start", "BR Service Confirm", "BR Docs Text", "AI Reply Out"):
            continue
        for run in runs:
            for branch in run.get("data", {}).get("main", []):
                for item in (branch or []):
                    j = item.get("json", {})
                    if j.get("reply"):
                        replies.append((node, j["reply"]))
    if replies:
        print(f"\n--- exec {eid} ---")
        for node, rep in replies:
            print(f"[{node}] {rep}")
