// Full direct-sqlite import of ALL 22 data tables from datatables-backup.json
// (n8n data-tables REST API returns empty on this build — so sqlite it is.)
// Creates: data_table metadata + data_table_column + physical data_table_user_<id>
// then inserts every row. Idempotent: skips tables that already exist.
import { Database } from "bun:sqlite";

const DB = "/home/z/.n8n/database.sqlite";
const BAK = "/home/z/my-project/download/supabase-migration/datatables-backup.json";

const db = new Database(DB);
db.exec("PRAGMA busy_timeout = 10000");
db.exec("PRAGMA journal_mode = WAL");

const dump = await Bun.file(BAK).json();
console.log("backup tables:", dump.length, "| rows:", dump.reduce((a, t) => a + t.rows.length, 0));

// current project id (workflows live here)
const proj = db.prepare("SELECT projectId FROM shared_workflow LIMIT 1").get();
const PROJECT = proj?.projectId || "9pJdjj7uwSeulaYm";
console.log("project:", PROJECT);

const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const uuid = () => crypto.randomUUID();

const TYPE_SQL = { string: "TEXT", number: "NUMERIC", boolean: "NUMERIC", date: "TEXT" };

let tablesMade = 0, rowsOk = 0, rowsFail = 0;

for (const t of dump) {
  const exists = db
    .prepare("SELECT id FROM data_table WHERE name = ?")
    .get(t.name);
  let tid;
  if (exists) {
    tid = exists.id;
    console.log(`  = ${t.name} exists`);
  } else {
    tid = uuid();
    db.prepare(
      "INSERT INTO data_table (id, name, projectId, createdAt, updatedAt) VALUES (?,?,?,?,?)"
    ).run(tid, t.name, PROJECT, now, now);
    let idx = 0;
    for (const c of t.columns) {
      db.prepare(
        'INSERT INTO data_table_column (id, name, type, "index", dataTableId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)'
      ).run(uuid(), c.name, c.type || "string", idx++, tid, now, now);
    }
    const phys = `data_table_user_${tid}`;
    const colDefs = t.columns.map((c) => `"${c.name}" ${TYPE_SQL[c.type] || "TEXT"}`);
    db.exec(
      `CREATE TABLE IF NOT EXISTS "${phys}" ("id" TEXT PRIMARY KEY, ${colDefs.join(", ")}, "createdAt" TEXT, "updatedAt" TEXT)`
    );
    tablesMade++;
    console.log(`  + ${t.name} (${t.columns.length} cols)`);
  }

  // rows
  const phys = `data_table_user_${tid}`;
  const cnt = db.prepare(`SELECT COUNT(*) c FROM "${phys}"`).get().c;
  if (cnt > 0) {
    console.log(`    rows already: ${cnt} — skip`);
    continue;
  }
  const colNames = t.columns.map((c) => c.name);
  const placeholders = colNames.map(() => "?").join(",");
  const insert = db.prepare(
    `INSERT INTO "${phys}" (id, ${colNames.map((c) => `"${c}"`).join(",")}, createdAt, updatedAt) VALUES (?,${placeholders},?,?)`
  );
  for (const r of t.rows) {
    const vals = colNames.map((c) => {
      let v = r[c];
      if (v === undefined || v === null) return null;
      if (typeof v === "object") v = JSON.stringify(v);
      if (typeof v === "boolean") v = v ? 1 : 0;
      return v;
    });
    try {
      insert.run(uuid(), ...vals, now, now);
      rowsOk++;
    } catch (e) {
      rowsFail++;
      if (rowsFail <= 3) console.log(`    row err ${t.name}:`, String(e).slice(0, 100));
    }
  }
}

console.log(`DONE: tables created=${tablesMade}, rows ok=${rowsOk}, fail=${rowsFail}`);
db.close();
