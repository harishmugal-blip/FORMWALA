#!/bin/bash
# Live demo: FormBot form filling flow — auto uses latest demo session (or $SID)
# Usage: bash demo-formflow.sh "message 1" "message 2" ...
BASE=http://127.0.0.1:3000

if [ -z "$SID" ]; then
  SID=$(python3 -c "
import sqlite3
db = sqlite3.connect('/home/z/my-project/db/custom.db')
row = db.execute(\"SELECT session_id FROM web_chat_sessions WHERE session_id LIKE 'demo_%' ORDER BY rowid DESC LIMIT 1\").fetchone()
print(row[0] if row else 'NONE')")
  [ "$SID" = "NONE" ] && { echo "no demo session; ek naya banao: SID=demo_xxx bash $0 ..."; exit 1; }
fi

for MSG in "$@"; do
  echo "👤 CUSTOMER: $MSG"
  curl -s -m 30 -X POST $BASE/api/webchat -H "content-type: application/json" \
    -d "{\"sessionId\":\"$SID\",\"text\":\"$MSG\"}" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for m in d.get("messages",[]):
    if m.get("role")=="bot":
        print("BOT:", m.get("text","")[:230].replace(chr(10)," | "))
        c=m.get("card")
        if c: print("  [CARD]:", c.get("type","?"))
        chips=m.get("chips") or []
        if chips: print("  [OPTIONS]:", ", ".join(str(x) for x in chips[:8]))
print("---")
'
  sleep 1
done
echo "(session: $SID)"
