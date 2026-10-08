#!/bin/bash
# CSC Smart Seva — ONE COMMAND full restore after sandbox wipe
# Usage: bash /home/z/my-project/scripts/restore-everything.sh
set -e
P=/home/z/my-project
N8N_DIR=$P/n8n
BAK=$P/download/supabase-migration
KEY_ENC="csc-n8n-encryption-2026"
export N8N_ENCRYPTION_KEY="$KEY_ENC"

log(){ echo "[$(date +%H:%M:%S)] $*"; }

# ============ 1. DEPENDENCIES ============
log "STEP 1: dependencies reinstall"
cd $N8N_DIR
[ -x node_modules/.bin/n8n ] || npm install n8n --no-audit --no-fund 2>&1 | tail -1
[ -d node_modules/sqlite3 ] || npm install sqlite3 --no-audit --no-fund 2>&1 | tail -1
cd $P/whatsapp-bridge
[ -d node_modules/@whiskeysockets/baileys ] || { [ -f package.json ] || npm init -y >/dev/null 2>&1; npm install @whiskeysockets/baileys qrcode-terminal --no-audit --no-fund 2>&1 | tail -1; }
cd $P/ai-agent
[ -d node_modules/z-ai-web-dev-sdk ] || { [ -f package.json ] || npm init -y >/dev/null 2>&1; npm install z-ai-web-dev-sdk express --no-audit --no-fund 2>&1 | tail -1; }
log "deps done"

# ============ 2. START N8N FRESH ============
log "STEP 2: start n8n (fresh db)"
bash $P/scripts/start-n8n.sh >/dev/null 2>&1
sleep 2
curl -s -m 5 http://127.0.0.1:5678/healthz >/dev/null || { log "n8n failed to start"; exit 1; }
log "n8n healthy"

# ============ 3. DB SURGERY: owner + api key + ============
log "STEP 3: owner + api key"
pkill -f "n8n start" 2>/dev/null || true; sleep 3
bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const bcrypt = require("/home/z/my-project/n8n/node_modules/bcryptjs");
const hash = bcrypt.hashSync("CscAdmin#2026", 10);
const u = db.prepare("SELECT id FROM user WHERE roleSlug = ?").get("global:owner");
db.prepare("UPDATE user SET email=?, firstName=?, lastName=?, password=? WHERE id=?").run("admin@csc.local","CSC","Admin",hash,u.id);
console.log("owner:", u.id);
const all = db.prepare("SELECT slug FROM scope").all().map(s=>s.slug);
db.prepare("DELETE FROM user_api_keys").run();
const now = new Date().toISOString().slice(0,19).replace("T"," ") + ".000";
db.prepare("INSERT OR REPLACE INTO user_api_keys (id,userId,label,scopes,apiKey,audience,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)")
  .run(crypto.randomUUID(), u.id, "CSC Builder Key", JSON.stringify(all), "n8n_api_csc-build-2026-a7f3d9e2b8c4", "public-api", now, now);
console.log("api key: 199 scopes");
db.close();'

# ============ 4. IMPORT CREDENTIALS + WORKFLOWS ============
log "STEP 4: import creds + 25 workflows"
N8N="$N8N_DIR/node_modules/.bin/n8n"
"$N8N" import:credentials --input="$BAK/credentials-backup.json" 2>&1 | tail -1
PROJ=$(bun -e 'import {Database} from "bun:sqlite"; const db=new Database("/home/z/.n8n/database.sqlite"); console.log(db.prepare("SELECT id FROM project WHERE type=?").get("personal").id); db.close();')
"$N8N" import:workflow --input="$BAK/workflows-backup.json" --projectId="$PROJ" 2>&1 | tail -1

# ============ 5. SHARE + DATA TABLES + ROWS ============
log "STEP 5: share + data tables + rows"
bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('/home/z/.n8n/database.sqlite');
const now = new Date().toISOString().slice(0,19).replace('T',' ');
const wfs = db.prepare(\"SELECT id FROM workflow_entity WHERE name LIKE 'CSC%'\").all();
for (const w of wfs) db.prepare('INSERT OR IGNORE INTO shared_workflow (workflowId, projectId, role, createdAt, updatedAt) VALUES (?,?,?,?,?)').run(w.id, '$PROJ', 'workflow:owner', now, now);
const creds = db.prepare('SELECT id FROM credentials_entity').all();
for (const c of creds) { try { db.prepare('INSERT OR IGNORE INTO shared_credentials (credentialsId, projectId, role, createdAt, updatedAt) VALUES (?,?,?,?,?)').run(c.id, '$PROJ', 'credential:owner', now, now); } catch(e){} }
console.log('shared:', wfs.length, 'workflows,', creds.length, 'creds');
db.close();"
pkill -f "n8n start" 2>/dev/null || true; sleep 3
# STEP 5 (FIXED): direct-sqlite import hi default — REST API path is build me
# row inserts 403/parse-fail deta he (Task 13/15/16 me verify). import-dt-full
# idempotent he (existing tables/rows skip) + fix-dt-ids dashed uuid ko nanoid me rename
bun $P/scripts/import-dt-full.mjs 2>&1 | tail -3
bun $P/scripts/fix-dt-ids.mjs 2>&1 | tail -2

# ============ 6. SYSTEM_CONFIG: bridge send path ============
log "STEP 6: system_config -> bridge"
bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const scid = db.prepare("SELECT id FROM data_table WHERE name=?").get("system_config").id;
const now = new Date().toISOString().slice(0,19).replace("T"," ");
const upd = [["WHATSAPP_PHONE_NUMBER_ID","csc-bridge"],["WHATSAPP_ACCESS_TOKEN","csc-bridge-2026"]];
for (const [k,v] of upd) db.prepare(`UPDATE data_table_user_${scid} SET config_value=?, updatedAt=? WHERE config_key=?`).run(v, now, k);
if (!db.prepare(`SELECT 1 FROM data_table_user_${scid} WHERE config_key=?`).get("WHATSAPP_API_BASE"))
  db.prepare(`INSERT INTO data_table_user_${scid} (config_key, config_value, createdAt, updatedAt) VALUES (?,?,?,?)`).run("WHATSAPP_API_BASE","http://127.0.0.1:8080",now,now);
console.log("bridge send config set");
db.close();'

# ============ 7. START N8N + ACTIVATE ALL ============
log "STEP 7: start + activate all workflows"
bash $P/scripts/start-n8n.sh >/dev/null 2>&1
sleep 2
sed 's|127.0.0.1:4000|127.0.0.1:5678|' $P/scripts/recovery/activate-all.js > /tmp/activate-fix.js
for i in 1 2 3; do bun /tmp/activate-fix.js 2>&1 | tail -1; sleep 1; done

# ============ 8. POST-BACKUP FIXES (AI layer) ============
log "STEP 8: post-backup AI fixes"
sed 's|127.0.0.1:4000|127.0.0.1:5678|g' $P/scripts/recovery/apply-post-backup-fixes.js > /tmp/postfix.js
bun /tmp/postfix.js 2>&1 | tail -1
# CSC 01: backup version stale (Meta-only parser) -> import Oct3 live version first
python3 << 'PYEOF'
import json, urllib.request
API="http://127.0.0.1:5678"; KEY="n8n_api_csc-build-2026-a7f3d9e2b8c4"
HDR={"X-N8N-API-KEY":KEY,"content-type":"application/json"}
def api(p,m="GET",b=None):
    r=urllib.request.Request(API+p,method=m,data=json.dumps(b).encode() if b else None,headers=HDR)
    return json.loads(urllib.request.urlopen(r,timeout=60).read().decode())
live=json.load(open("/home/z/my-project/scripts/wf-edit/csc01-live.json"))
api("/api/v1/workflows/3c5c0004-0000-4000-8000-000000000001",m="PUT",b={"name":live["name"],"nodes":live["nodes"],"connections":live["connections"],"settings":live.get("settings",{})})
print("csc01 live imported")
PYEOF
python3 $P/scripts/update-csc01-brresearch.py 2>&1 | tail -1
python3 $P/scripts/update-csc02-v3.py 2>&1 | tail -1
python3 $P/scripts/update-csc02-final.py 2>&1 | tail -1
python3 $P/scripts/update_csc06_ai_gate.py 2>&1 | tail -1
python3 $P/scripts/add-csc08-ai-gate.py 2>&1 | tail -1

# CSC 06 Route Step wiring swap (ai_reply rule idx6 -> AI Reply Out, fallback -> No Config Reply)
python3 << 'PYEOF'
import json, urllib.request
API="http://127.0.0.1:5678"; KEY="n8n_api_csc-build-2026-a7f3d9e2b8c4"
HDR={"X-N8N-API-KEY":KEY,"content-type":"application/json"}
def api(p,m="GET",b=None):
    r=urllib.request.Request(API+p,method=m,data=json.dumps(b).encode() if b else None,headers=HDR)
    return json.loads(urllib.request.urlopen(r,timeout=30).read().decode())
w=api("/api/v1/workflows/3c5c0606-0000-4000-8000-000000000006")
m=w["connections"]["Route Step"]["main"]
if m[6][0]["node"]!="AI Reply Out":
    m[6],m[7]=m[7],m[6]
    api("/api/v1/workflows/3c5c0606-0000-4000-8000-000000000006",m="PUT",b={"name":w["name"],"nodes":w["nodes"],"connections":w["connections"],"settings":w.get("settings",{})})
    try: api("/api/v1/workflows/3c5c0606-0000-4000-8000-000000000006/activate",m="POST")
    except: pass
print("csc06 wiring:",m[6][0]["node"],"|",m[7][0]["node"])
PYEOF

# re-activate everything after fix PUTs (PUT deactivates)
for i in 1 2 3; do bun /tmp/activate-fix.js 2>&1 | tail -1; sleep 1; done

# ============ 9. BRIDGE + AI AGENT ============
log "STEP 9: bridge meta-endpoint patch + restart"
# bridge.mjs ka wipe ke baad OLD version aa sakta he — Meta Cloud API compat endpoint
# (POST /v21.0/:phoneId/messages) zaroori he kyunki n8n ka Send WhatsApp Reply isi ko call karta he
python3 << 'PYEOF'
import re
p = "/home/z/my-project/whatsapp-bridge/bridge.mjs"
src = open(p).read()
if "sent(meta-compat)" in src:
    print("meta endpoint already present")
else:
    marker = "    if (p.startsWith('/instance/connectionState')) {"
    patch = '''    // ---- Meta Cloud API compatible send (n8n Send WhatsApp Reply node) ----
    // POST /v21.0/:phoneId/messages  body {messaging_product, to, type:'text', text:{body}}
    const mm = p.match(/^\\/v\\d+\\.\\d+\\/[^/]+\\/messages$/);
    if (mm && req.method === 'POST') {
      const auth = req.headers['authorization'] || '';
      if (!auth.startsWith('Bearer ') || auth.slice(7) !== API_KEY)
        return json(res, 401, { error: { message: 'unauthorized' } });
      if (!sock || !state.connected)
        return json(res, 503, { error: { message: 'WhatsApp not connected' } });
      const body = await readBody(req);
      const text = String(body?.text?.body ?? body?.text ?? '');
      const jid = toJid(body?.to ?? body?.number ?? '');
      if (!jid || !text)
        return json(res, 400, { error: { message: 'to and text.body are required' } });
      const r = await sock.sendMessage(jid, { text }, { linkPreview: false });
      state.sendCount += 1;
      info('sent(meta-compat) to', jid, 'id=', r?.key?.id);
      return json(res, 200, {
        messaging_product: 'whatsapp',
        contacts: [{ wa_id: String(body?.to || '').replace(/\\D/g, '') }],
        messages: [{ id: r?.key?.id || 'BRIDGE-' + Date.now(), message_status: 'accepted' }],
      });
    }

'''
    assert marker in src, "marker not found in bridge.mjs"
    src = src.replace(marker, patch + marker, 1)
    open(p, "w").write(src)
    print("meta endpoint PATCHED into bridge.mjs")
PYEOF
bash $P/scripts/start-ai-agent.sh >/dev/null 2>&1
bash $P/scripts/start-bridge.sh >/dev/null 2>&1
sleep 8

# ============ 10. VERIFY ============
log "STEP 9b: watchdog endpoints patch (bridge + agent)"
# FormBot self-heal: bridge + agent par /admin/services-check endpoints
# (n8n watchdog inhe call karta he jab Next.js dead ho)
python3 << 'PYEOF2'
p1 = "/home/z/my-project/whatsapp-bridge/bridge.mjs"
src = open(p1).read()
if "admin/services-check" in src:
    print("bridge watchdog endpoint already present")
else:
    if "from 'node:child_process'" not in src:
        src = src.replace("import http from 'node:http';", "import http from 'node:http';\nimport { execFile } from 'node:child_process';")
    marker1 = "    if (p === '/qr') {"
    patch1 = """    if (p === '/admin/services-check') {
      const u = new URL(req.url, 'http://localhost');
      if ((u.searchParams.get('key') || '') !== 'csc-bridge-2026') return json(res, 401, { error: 'bad key' });
      execFile('bash', ['/home/z/my-project/scripts/services-check.sh'], { timeout: 30000 }, (err, stdout, stderr) => {
        try { json(res, 200, { ok: !err, out: String(stdout || '').slice(0, 300) }); } catch {}
      });
      return undefined;
    }
"""
    src = src.replace(marker1, patch1 + marker1, 1)
    open(p1, "w").write(src)
    print("bridge watchdog endpoint patched")

p2 = "/home/z/my-project/ai-agent/agent.mjs"
src2 = open(p2).read()
if "admin/services-check" in src2:
    print("agent watchdog endpoint already present")
else:
    if "from 'node:child_process'" not in src2:
        src2 = src2.replace("import http from 'node:http';", "import http from 'node:http';\nimport { execFile } from 'node:child_process';")
    marker2 = "    if (p === '/compose' && req.method === 'POST') {"
    patch2 = """    if (p === '/admin/services-check') {
      const u = new URL(req.url, 'http://localhost');
      if ((u.searchParams.get('key') || '') !== 'csc-bridge-2026') return json(res, 401, { error: 'bad key' });
      execFile('bash', ['/home/z/my-project/scripts/services-check.sh'], { timeout: 30000 }, (err, stdout, stderr) => {
        try { json(res, 200, { ok: !err, out: String(stdout || '').slice(0, 300) }); } catch {}
      });
      return undefined;
    }
"""
    src2 = src2.replace(marker2, patch2 + marker2, 1)
    open(p2, "w").write(src2)
    print("agent watchdog endpoint patched")
PYEOF2

log "STEP 10: verify"
BS=$(curl -s -m 5 http://127.0.0.1:8080/status)
AC=$(curl -s -m 15 -H "X-N8N-API-KEY: n8n_api_csc-build-2026-a7f3d9e2b8c4" "http://127.0.0.1:5678/api/v1/workflows?limit=100" | python3 -c "import json,sys; d=json.load(sys.stdin); print(str(sum(1 for w in d['data'] if w['active']))+'/'+str(len(d['data'])))")
echo "bridge  : $BS" | head -c 150; echo
echo "ai-agent: $(curl -s -m 5 http://127.0.0.1:8090/health)"
echo "n8n     : $AC active"
log "RESTORE COMPLETE"

# ============ 10. SERVICES WATCHDOG (self-healing) ============
log "STEP 10: watchdog start (bridge + agent auto-restart)"
pkill -f "keep-services.sh" 2>/dev/null || true
sleep 1
setsid nohup bash $P/scripts/keep-services.sh > /dev/null 2>&1 < /dev/null &
log "watchdog active"
