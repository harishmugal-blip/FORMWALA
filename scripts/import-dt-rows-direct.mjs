// Import data table rows DIRECTLY into sqlite (REST API 403 workaround)
// NOTE: run import-datatables.js FIRST (creates table metadata via REST API)
import { Database } from "bun:sqlite";

const DB = "/home/z/.n8n/database.sqlite";
const BAK = "/home/z/my-project/download/supabase-migration/datatables-backup.json";

const db = new Database(DB);
const dump = await Bun.file(BAK).json();
console.log("backup tables:", dump.length);

const metas = db.prepare("SELECT id, name FROM data_table").all();
const idByName = Object.fromEntries(metas.map(m => [m.name, m.id]));

let totalOk = 0, totalFail = 0;
for (const t of dump) {
  const tid = idByName[t.name];
  if (!tid) { console.log("  X no table:", t.name); totalFail += t.rows.length; continue; }
  const phys = `data_table_user_${tid}`;
  const cols = db.prepare(`PRAGMA table_info(${phys})`).all().map(c => c.name);
  const rowCols = cols.filter(c => c !== "id" && !["createdAt", "updatedAt"].includes(c));
  let ok = 0, fail = 0;
  for (const r of t.rows) {
    const { id, createdAt, updatedAt, ...rest } = r;
    const vals = rowCols.map(c => {
      let v = rest[c];
      if (v === undefined || v === null) return null;
      if (typeof v === "object") v = JSON.stringify(v);
      if (typeof v === "boolean") v = v ? 1 : 0;
      return v;
    });
    const placeholders = rowCols.map(() => "?").join(",");
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    try {
      db.prepare(`INSERT INTO ${phys} (${rowCols.join(",")}, createdAt, updatedAt) VALUES (${placeholders},?,?)`).run(...vals, now, now);
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 2) console.log(`    err ${t.name}:`, String(e).slice(0, 120));
    }
  }
  totalOk += ok; totalFail += fail;
  console.log(`  ${t.name}: +${ok}/${t.rows.length}${fail ? ` FAIL:${fail}` : ""}`);
}
console.log(`\nTOTAL: ok=${totalOk} fail=${totalFail}`);
db.close();
