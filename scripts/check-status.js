// Final status check: workflows, data tables, credentials
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite", { readonly: true });

console.log("=== CSC WORKFLOWS ===");
const wfs = db.prepare("SELECT name, active FROM workflow_entity WHERE name LIKE 'CSC%' ORDER BY name").all();
for (const w of wfs) console.log(`${w.active ? "✅ ACTIVE" : "⬜ INACTIVE"}  ${w.name}`);
console.log(`\nTotal: ${wfs.length} | Active: ${wfs.filter(w=>w.active).length}`);

console.log("\n=== DATA TABLES ===");
const tables = db.prepare("SELECT COUNT(*) as c FROM data_table").get();
console.log(`Data tables: ${tables.c}`);
const cols = db.prepare("PRAGMA table_info(data_table)").all().map(c=>c.name);
console.log("cols:", cols.join(","));
const nameCol = cols.find(c=>/name/i.test(c));
const rows = db.prepare(`SELECT ${nameCol} as nm FROM data_table ORDER BY ${nameCol}`).all();
console.log(rows.map(r=>r.nm).join(", "));
try {
  const sc = db.prepare("SELECT COUNT(*) as c FROM data_table_row WHERE dataTableId IN (SELECT id FROM data_table)").get();
  console.log(`\nTotal seeded rows (all tables): ${sc.c}`);
} catch(e) { console.log("row count err:", e.message); }

console.log("\n=== CREDENTIALS ===");
const creds = db.prepare("SELECT name, type FROM credentials_entity").all();
for (const c of creds) console.log(`- ${c.name} (${c.type})`);

console.log("\n=== WEBHOOKS REGISTERED ===");
const hcols = db.prepare("PRAGMA table_info(webhook_entity)").all().map(c=>c.name);
const hooks = db.prepare(`SELECT method, ${hcols.find(c=>/path/i.test(c))} as p, workflowId FROM webhook_entity`).all();
for (const h of hooks) console.log(`- ${h.method} /${h.p}`);

db.close();
