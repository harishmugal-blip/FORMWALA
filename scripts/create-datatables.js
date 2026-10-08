// Create CSC Data Tables via direct DB insert
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite");
const PROJECT = "VgFtFuDMIJpEbhPr";
const now = new Date().toISOString().replace("T", " ").replace("Z", "").slice(0, 23) + ".000";
const uuid = () => crypto.randomUUID();

function createTable(name, columns) {
  const exists = db.prepare("SELECT id FROM data_table WHERE name = ? AND projectId = ?").get(name, PROJECT);
  if (exists) { console.log(`⏭️ Table already exists: ${name}`); return; }
  const tid = uuid();
  db.prepare("INSERT INTO data_table (id, name, projectId, createdAt, updatedAt) VALUES (?,?,?,?,?)")
    .run(tid, name, PROJECT, now, now);
  let idx = 0;
  for (const [cname, ctype] of columns) {
    db.prepare('INSERT INTO data_table_column (id, name, type, "index", dataTableId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run(uuid(), cname, ctype, idx++, tid, now, now);
  }
  console.log(`✅ Table created: ${name} (${columns.length} cols)`);
}

createTable("customers", [
  ["phone", "string"], ["full_name", "string"], ["email", "string"],
  ["state", "string"], ["district", "string"], ["address", "string"],
  ["consent_status", "string"], ["created_at", "string"], ["updated_at", "string"]
]);

createTable("applications", [
  ["application_id", "string"], ["customer_phone", "string"], ["service_id", "string"],
  ["status", "string"], ["gov_fee", "number"], ["service_charge", "number"],
  ["gst", "number"], ["total_fee", "number"], ["form_data", "string"],
  ["application_number", "string"], ["created_at", "string"], ["updated_at", "string"]
]);

createTable("payments", [
  ["payment_id", "string"], ["application_id", "string"], ["customer_phone", "string"],
  ["amount", "number"], ["gateway", "string"], ["transaction_id", "string"],
  ["status", "string"], ["created_at", "string"], ["paid_at", "string"]
]);

createTable("conversation_state", [
  ["phone", "string"], ["state", "string"], ["service_id", "string"],
  ["context_data", "string"], ["handoff_active", "string"], ["updated_at", "string"]
]);

const check = db.prepare("SELECT d.name, COUNT(c.id) as cols FROM data_table d LEFT JOIN data_table_column c ON c.dataTableId = d.id GROUP BY d.id").all();
console.log("VERIFY:", JSON.stringify(check, null, 1));
db.close();
