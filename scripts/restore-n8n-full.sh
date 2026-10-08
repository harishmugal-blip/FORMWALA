#!/bin/bash
# CSC full restore after sandbox reset — phase1: n8n + workflows + creds + api key
set -e
N8N_DIR=/home/z/my-project/n8n
BAK=/home/z/my-project/download/supabase-migration
KEY_ENC="csc-n8n-encryption-2026"

echo "=== STEP 1: reinstall n8n (bun.lock exact restore) ==="
cd "$N8N_DIR"
bun install 2>&1 | tail -2
ls node_modules/.bin/n8n >/dev/null && echo "n8n binary OK"

echo "=== STEP 2: start n8n (fresh DB) ==="
bash /home/z/my-project/scripts/start-n8n.sh

echo "=== STEP 3: complete owner directly in DB (v2.41 creates placeholder user) ==="
pkill -f "n8n start" 2>/dev/null || true
sleep 3
bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const bcrypt = require("/home/z/my-project/n8n/node_modules/bcryptjs");
const hash = bcrypt.hashSync("CscAdmin#2026", 10);
const u = db.prepare("SELECT id FROM user WHERE roleSlug = ?").get("global:owner");
if (!u) { console.error("NO OWNER ROW"); process.exit(1); }
db.prepare("UPDATE user SET email=?, firstName=?, lastName=?, password=? WHERE id=?")
  .run("admin@csc.local", "CSC", "Admin", hash, u.id);
console.log("owner completed:", u.id, "->", "admin@csc.local / CscAdmin#2026");
db.close();
'

echo "=== STEP 4: stop n8n for DB surgery ==="
pkill -f "n8n start" 2>/dev/null || true
sleep 3

echo "=== STEP 4a: insert API key with owner scopes ==="
bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const owner = db.prepare("SELECT id FROM user WHERE email = ?").get("admin@csc.local");
if (!owner) { console.error("NO OWNER"); process.exit(1); }
console.log("ownerId:", owner.id);
const scopes = db.prepare("SELECT s.slug FROM role_scope rs JOIN scope s ON s.slug=rs.scopeSlug JOIN role r ON r.slug=rs.roleSlug WHERE r.slug=?").all("global:owner").map(r=>r.slug);
console.log("scopes:", scopes.length);
db.prepare("DELETE FROM user_api_keys").run();
const now = new Date().toISOString().slice(0,19).replace("T"," ") + ".000";
db.prepare("INSERT OR REPLACE INTO user_api_keys (id,userId,label,scopes,apiKey,audience,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)")
  .run(crypto.randomUUID(), owner.id, "CSC Builder Key", JSON.stringify(scopes), "n8n_api_csc-build-2026-a7f3d9e2b8c4", "public-api", now, now);
console.log("api key inserted (n8n_api_csc-build-2026-a7f3d9e2b8c4)");
db.close();
'

echo "=== STEP 4a2: resolve owner projectId (for CLI import + sharing) ==="
PROJ=$(bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const p = db.prepare("SELECT id FROM project WHERE type = ?").get("personal");
console.log(p.id);
db.close();
')
echo "using projectId: $PROJ"

echo "=== STEP 4b: import credentials + 25 workflows (CLI) ==="
export N8N_ENCRYPTION_KEY="$KEY_ENC"
unset N8N_USER_FOLDER
N8N="$N8N_DIR/node_modules/.bin/n8n"
"$N8N" import:credential --input="$BAK/credentials-backup.json" 2>&1 | tail -2
"$N8N" import:workflow --input="$BAK/workflows-backup.json" --projectId="$PROJ" 2>&1 | tail -3 || true

echo "=== STEP 4c: share workflows & creds with owner project ==="
bun -e "
import { Database } from \"bun:sqlite\";
const db = new Database(\"/home/z/.n8n/database.sqlite\");
const PROJ = \"$PROJ\";
const wfs = db.prepare(\"SELECT id, name FROM workflow_entity WHERE name LIKE ?\").all(\"CSC%\");
let s1 = 0;
for (const w of wfs) {
  const ex = db.prepare(\"SELECT 1 FROM shared_workflow WHERE workflowId = ? AND projectId = ?\").get(w.id, PROJ);
  if (!ex) {
    db.prepare(\"INSERT INTO shared_workflow (workflowId, projectId, role, createdAt, updatedAt) VALUES (?,?,?,?,?)\")
      .run(w.id, PROJ, \"workflow:owner\", new Date().toISOString().slice(0,19).replace(\"T\",\" \"), new Date().toISOString().slice(0,19).replace(\"T\",\" \"));
    s1++;
  }
}
console.log(\"CSC workflows:\", wfs.length, \"shared:\", s1);
const creds = db.prepare(\"SELECT id, name FROM credentials_entity\").all();
let s2 = 0;
for (const c of creds) {
  try {
    db.prepare(\"INSERT INTO shared_credentials (credentialsId, projectId, role, createdAt, updatedAt) VALUES (?,?,?,?,?)\")
      .run(c.id, PROJ, \"credential:owner\", new Date().toISOString().slice(0,19).replace(\"T\",\" \"), new Date().toISOString().slice(0,19).replace(\"T\",\" \"));
    s2++;
  } catch (e) { console.log(\"cred share skip:\", c.name, String(e).slice(0,80)); }
}
console.log(\"creds:\", creds.length, \"shared:\", s2);
db.close();
"

echo "=== STEP 5: start n8n again ==="
unset N8N_ENCRYPTION_KEY
bash /home/z/my-project/scripts/start-n8n.sh

echo "=== STEP 6: verify API key + workflows count ==="
curl -s -m 10 -H "X-N8N-API-KEY: n8n_api_csc-build-2026-a7f3d9e2b8c4" "http://localhost:5678/api/v1/workflows?limit=100" -o /tmp/wfs.json -w "HTTP %{http_code}\n"
python3 -c "
import json
d = json.load(open('/tmp/wfs.json'))
wfs = d.get('data', [])
print('workflows restored:', len(wfs))
"
echo "PHASE1 DONE"
