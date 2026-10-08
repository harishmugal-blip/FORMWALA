#!/usr/bin/env bash
# FormBot E2E test-data cleanup — E2E runs + browser tests ke FB-* applications
# aur e2e_* sessions hataata he (production WhatsApp data untouched).
set -e
cd /home/z/my-project

echo "== Prisma cleanup =="
python3 << 'PYEOF'
import sqlite3
con = sqlite3.connect('db/custom.db')
cur = con.cursor()
ids = [r[0] for r in cur.execute("SELECT application_id FROM applications WHERE application_number LIKE 'FB-%'").fetchall()]
for aid in ids:
    for tbl in ('application_field_values','application_documents','application_status_history','payments','operator_tasks','receipts','payment_events'):
        cur.execute(f"DELETE FROM {tbl} WHERE application_id = ?", (aid,))
cur.execute("DELETE FROM applications WHERE application_number LIKE 'FB-%'")
n_apps = len(ids)
# e2e / browser-test sessions
cur.execute("DELETE FROM web_chat_messages WHERE session_id LIKE 'e2e_%' OR session_id LIKE '%_e2e%' OR session_id LIKE 'browser%' OR session_id LIKE 'verify_dedup%' OR session_id LIKE 'final%' OR session_id LIKE 'dedup_probe%' OR session_id LIKE 'claim_test%' OR session_id LIKE 'gen_test%' OR session_id LIKE 'trace_resp%'")
cur.execute("DELETE FROM web_chat_sessions WHERE session_id LIKE 'e2e_%' OR session_id LIKE '%_e2e%' OR session_id LIKE 'browser%' OR session_id LIKE 'verify_dedup%' OR session_id LIKE 'final%' OR session_id LIKE 'dedup_probe%' OR session_id LIKE 'claim_test%' OR session_id LIKE 'gen_test%' OR session_id LIKE 'trace_resp%'")
cur.execute("DELETE FROM chat_events WHERE phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234') OR session_id LIKE 'e2e_%'")
cur.execute("DELETE FROM chat_handoffs WHERE phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234')")
cur.execute("DELETE FROM customers WHERE phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234')")
con.commit()
print(f"prisma: {n_apps} FB applications + test sessions cleaned")
PYEOF

echo "== n8n mirror cleanup =="
python3 << 'PYEOF'
import sqlite3
con = sqlite3.connect('/home/z/.n8n/database.sqlite')
cur = con.cursor()
tabs = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'data_table%'").fetchall()]
def find(marker):
    for t in tabs:
        cols = [c[1] for c in cur.execute(f'PRAGMA table_info({t})').fetchall()]
        if marker in cols: return t
    return None
at = find('application_number'); ft = find('field_key'); dt = find('doc_key')
ht = find('old_status'); pt = find('payment_id'); ot = find('task_id'); ct = find('consent_type')
def cols(t): return [c[1] for c in cur.execute(f'PRAGMA table_info({t})').fetchall()]
n = 0
if at:
    cur.execute(f"DELETE FROM {at} WHERE application_number LIKE 'FB-%'"); n += cur.rowcount
if ft:
    cur.execute(f"DELETE FROM {ft} WHERE phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234')")
if dt:
    cur.execute(f"DELETE FROM {dt} WHERE phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234')")
if ht:
    cur.execute(f"DELETE FROM {ht} WHERE application_number LIKE 'FB-%'")
if pt:
    cur.execute(f"DELETE FROM {pt} WHERE customer_phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234')")
if ot:
    cur.execute(f"DELETE FROM {ot} WHERE application_number LIKE 'FB-%'")
if ct:
    cur.execute(f"DELETE FROM {ct} WHERE phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234')")
# test customers (full_name quoted/unquoted dono)
cust = find('consent_status')
if cust:
    cur.execute(f"DELETE FROM {cust} WHERE phone IN ('9876500012','9876500999','9876500777','9876500555','9876501234')")
con.commit()
print(f"n8n: {n} FB application mirrors + tasks/payments cleaned")
PYEOF

echo "== WhatsApp AI memory (test phones) =="
python3 << 'PYEOF'
import json, os
p = '/home/z/my-project/ai-agent/memory.json'
if os.path.exists(p):
    try:
        m = json.load(open(p))
        before = len(m)
        m = {k: v for k, v in m.items() if not any(t in k for t in ('9876500012','9876500999','9876500777','9876500555','9876501234')) and not k.startswith('web_e2e')}
        json.dump(m, open(p, 'w'))
        print(f"ai memory: {before} -> {len(m)} sessions")
    except Exception as e:
        print('memory skip:', e)
PYEOF

echo "CLEANUP DONE ✅"
