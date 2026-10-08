#!/bin/bash
# Phase 1c: import credentials + share + final verify
set -e
N8N_DIR=/home/z/my-project/n8n
BAK=/home/z/my-project/download/supabase-migration

echo "=== import credentials (plural command) ==="
pkill -f "n8n start" 2>/dev/null || true
sleep 3
export N8N_ENCRYPTION_KEY="csc-n8n-encryption-2026"
unset N8N_USER_FOLDER
cd "$N8N_DIR"
./node_modules/.bin/n8n import:credentials --input="$BAK/credentials-backup.json" 2>&1 | tail -3

echo "=== share credentials with owner project ==="
cd /home/z/my-project
bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const p = db.prepare("SELECT id FROM project WHERE type = ?").get("personal");
const creds = db.prepare("SELECT id, name FROM credentials_entity").all();
let s = 0;
for (const c of creds) {
  const ex = db.prepare("SELECT 1 FROM shared_credentials WHERE credentialsId = ? AND projectId = ?").get(c.id, p.id);
  if (!ex) {
    db.prepare("INSERT INTO shared_credentials (credentialsId, projectId, role, createdAt, updatedAt) VALUES (?,?,?,?,?)")
      .run(c.id, p.id, "credential:owner", new Date().toISOString().slice(0,19).replace("T"," "), new Date().toISOString().slice(0,19).replace("T"," "));
    s++;
  }
}
console.log("creds:", creds.length, "newly shared:", s);
db.close();
'

echo "=== start n8n ==="
unset N8N_ENCRYPTION_KEY
bash /home/z/my-project/scripts/start-n8n.sh

echo "=== wait for public API + final verify ==="
KEY="n8n_api_csc-build-2026-a7f3d9e2b8c4"
for i in $(seq 1 20); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 -H "X-N8N-API-KEY: $KEY" "http://localhost:5678/api/v1/workflows?limit=1")
  [ "$CODE" = "200" ] && break
  sleep 3
done
echo "public API: HTTP $CODE"
curl -s -m 10 -H "X-N8N-API-KEY: $KEY" "http://localhost:5678/api/v1/workflows?limit=100" | python3 -c "
import json,sys
d=json.load(sys.stdin)
wfs=d.get('data',[])
print('WORKFLOWS:', len(wfs))
"
curl -s -m 10 -H "X-N8N-API-KEY: $KEY" "http://localhost:5678/api/v1/credentials?limit=100" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('CREDENTIALS:', len(d.get('data',[])))
" 2>/dev/null || echo "credentials endpoint check skipped"
echo "PHASE1C DONE"
