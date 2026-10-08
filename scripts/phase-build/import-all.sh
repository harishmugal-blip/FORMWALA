#!/bin/bash
# Import all CSC workflows into n8n (correct DB!), share with owner project, verify
set -e
export N8N_ENCRYPTION_KEY=local-dev-n8n-key-2026
unset N8N_USER_FOLDER   # CRITICAL: setting this makes CLI create nested .n8n/.n8n DB
N8N="/home/z/my-project/n8n/node_modules/.bin/n8n"
JSONDIR="/home/z/my-project/scripts/phase-build/json"
PROJECT="VgFtFuDMIJpEbhPr"

echo "=== Stopping n8n ==="
pkill -f "n8n start" 2>/dev/null || true
sleep 3

echo "=== Pre-clean: remove CSC 01 old row (v2 replaces it) + stale CSC imports ==="
bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const ids = db.prepare("SELECT id FROM workflow_entity WHERE name LIKE ? AND name != ?").all("CSC 01%", "CSC 01 - WhatsApp Main Router").map(r => r.id);
ids.push("3c5c0004-0000-4000-8000-000000000001"); // old router row -> replaced by v2
const unique = [...new Set(ids)];
for (const id of unique) {
  db.prepare("DELETE FROM shared_workflow WHERE workflowId = ?").run(id);
  db.prepare("DELETE FROM workflow_history WHERE workflowId = ?").run(id);
  db.prepare("DELETE FROM workflow_statistics WHERE workflowId = ?").run(id);
  db.prepare("DELETE FROM workflow_entity WHERE id = ?").run(id);
  console.log("removed:", id);
}
db.close();'

cd /home/z/my-project
for f in "$JSONDIR"/*.json; do
  echo "--- Importing $(basename "$f")"
  "$N8N" import:workflow --input="$f" --projectId="$PROJECT" 2>&1 | tail -1
done

echo "=== Ensure sharing with owner project ==="
bun -e '
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const PROJECT = "VgFtFuDMIJpEbhPr";
const wfs = db.prepare("SELECT id, name FROM workflow_entity WHERE name LIKE ?").all("CSC%");
let shared = 0;
for (const w of wfs) {
  const ex = db.prepare("SELECT workflowId FROM shared_workflow WHERE workflowId = ? AND projectId = ?").get(w.id, PROJECT);
  if (!ex) {
    db.prepare("INSERT INTO shared_workflow (workflowId, projectId, role, createdAt, updatedAt) VALUES (?,?,?,?,?)")
      .run(w.id, PROJECT, "workflow:owner", new Date().toISOString().slice(0, 19).replace("T", " "), new Date().toISOString().slice(0, 19).replace("T", " "));
    shared++;
  }
}
console.log("CSC workflows in DB:", wfs.length, "| newly shared:", shared);
db.close();'

echo "=== Cleanup stray nested DB (from earlier wrong-env import) ==="
rm -rf /home/z/.n8n/.n8n 2>/dev/null || true

echo "=== Starting n8n ==="
bash /home/z/my-project/scripts/start-n8n.sh > /dev/null 2>&1
sleep 12
curl -s localhost:3000/healthz && echo " <- healthz OK"
