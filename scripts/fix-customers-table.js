// Fix: add columns to customers data table
import { Database } from "bun:sqlite";
const db = new Database("/home/z/.n8n/database.sqlite");
const now = new Date().toISOString().replace("T", " ").replace("Z", "").slice(0, 23) + ".000";
const uuid = () => crypto.randomUUID();

const t = db.prepare("SELECT id FROM data_table WHERE name = 'customers'").get();
if (!t) { console.log("customers table not found!"); process.exit(1); }

const cols = [
  ["phone", "string"], ["full_name", "string"], ["email", "string"],
  ["state", "string"], ["district", "string"], ["address", "string"],
  ["consent_status", "string"], ["created_at", "string"], ["updated_at", "string"]
];

const existing = db.prepare("SELECT COUNT(*) as n FROM data_table_column WHERE dataTableId = ?").get(t.id);
if (existing.n === 0) {
  let idx = 0;
  for (const [cname, ctype] of cols) {
    db.prepare('INSERT INTO data_table_column (id, name, type, "index", dataTableId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run(uuid(), cname, ctype, idx++, t.id, now, now);
  }
  console.log(`✅ Added ${cols.length} columns to customers`);
} else {
  console.log(`⏭️ customers already has ${existing.n} columns`);
}

const check = db.prepare("SELECT d.name, COUNT(c.id) as cols FROM data_table d LEFT JOIN data_table_column c ON c.dataTableId = d.id GROUP BY d.id").all();
console.log("FINAL VERIFY:", JSON.stringify(check, null, 1));
db.close();
