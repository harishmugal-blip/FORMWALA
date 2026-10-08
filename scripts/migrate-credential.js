// Replace old Gemini credential with new key + inspect data_table schema
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite");

// 1. Delete old credential
const old = db.prepare("SELECT id, name FROM credentials_entity").all();
console.log("BEFORE:", JSON.stringify(old));
db.prepare("DELETE FROM shared_credentials").run();
db.prepare("DELETE FROM credentials_entity").run();
console.log("Old credentials deleted");

// 2. Inspect data_table schema
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%data_table%' OR name LIKE '%data_%')").all();
console.log("DATA TABLES meta:", JSON.stringify(tables));

for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\n${t.name} columns:`, cols.map(c => `${c.name}(${c.type})${c.notnull ? " NOTNULL" : ""}`).join(", "));
}

db.close();
