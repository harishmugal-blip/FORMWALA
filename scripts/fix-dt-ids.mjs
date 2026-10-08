// Fix: data_table ids with dashes break unquoted SQL everywhere.
// Rename to n8n-style nanoid ids (16 alnum) + rename physical tables to match.
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite");
db.exec("PRAGMA busy_timeout = 10000");

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const nanoid = (n = 16) =>
  Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");

const rows = db.prepare("SELECT id, name FROM data_table").all();
let fixed = 0;
for (const r of rows) {
  if (!r.id.includes("-")) continue;
  const newId = nanoid(16);
  console.log(`${r.name}: ${r.id} -> ${newId}`);
  db.prepare("UPDATE data_table SET id=? WHERE id=?").run(newId, r.id);
  db.prepare("UPDATE data_table_column SET dataTableId=? WHERE dataTableId=?").run(newId, r.id);
  const oldPhys = `data_table_user_${r.id}`;
  const newPhys = `data_table_user_${newId}`;
  const tbls = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(oldPhys);
  if (tbls) db.exec(`ALTER TABLE "${oldPhys}" RENAME TO "${newPhys}"`);
  fixed++;
}
console.log("fixed:", fixed, "of", rows.length);
db.close();
