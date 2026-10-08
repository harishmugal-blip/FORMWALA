/**
 * IMPORT script — run on the NEW n8n instance (after it's connected to Supabase Postgres).
 * Restores all 22 data tables + rows from datatables-backup.json.
 *
 * Usage:
 *   1. Edit KEY + BASE below to match the NEW n8n instance (its API key + URL)
 *   2. bun import-datatables.js
 */
const KEY = process.env.N8N_API_KEY || "REPLACE_WITH_NEW_INSTANCE_API_KEY";
const BASE = process.env.N8N_BASE_URL || "http://localhost:3000/api/v1";
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };
const SRC = import.meta.dir.endsWith("supabase")
  ? "/home/z/my-project/download/supabase-migration/datatables-backup.json"
  : "./datatables-backup.json";

async function main() {
  const dump = await Bun.file(SRC).json();
  console.log(`Loaded ${dump.length} tables from backup`);

  // 1. find existing tables (skip already-present ones)
  const existing = await fetch(`${BASE}/data-tables?limit=100`, { headers: H }).then(r => r.json());
  const existingNames = new Set((existing.data || []).map(t => t.name));

  const map = {};
  for (const t of dump) {
    if (existingNames.has(t.name)) {
      const found = (existing.data || []).find(x => x.name === t.name);
      map[t.name] = found.id;
      console.log(`  = ${t.name} already exists (${found.id}) - will reuse`);
      continue;
    }
    // create with columns
    const body = {
      name: t.name,
      columns: t.columns.map(c => ({ name: c.name, type: c.type }))
    };
    const created = await fetch(`${BASE}/data-tables`, { method: "POST", headers: H, body: JSON.stringify(body) }).then(r => r.json());
    if (created.error || created.message) {
      console.error(`  X create ${t.name} failed:`, JSON.stringify(created).slice(0, 200));
      continue;
    }
    map[t.name] = created.data?.id || created.id;
    console.log(`  + created ${t.name} -> ${map[t.name]}`);
  }

  // 2. insert rows in chunks
  let ok = 0, fail = 0;
  for (const t of dump) {
    const id = map[t.name];
    if (!id) { fail += t.rows.length; continue; }
    for (let i = 0; i < t.rows.length; i += 50) {
      const chunk = t.rows.slice(i, i + 50).map(r => {
        const { id: _drop, createdAt: _c, updatedAt: _u, ...clean } = r;
        return clean;
      });
      if (!chunk.length) continue;
      const res = await fetch(`${BASE}/data-tables/${id}/rows`, { method: "POST", headers: H, body: JSON.stringify(chunk) });
      if (res.ok) { ok += chunk.length; }
      else {
        const err = await res.text();
        console.error(`  X rows ${t.name} chunk@${i}: ${res.status} ${err.slice(0, 150)}`);
        fail += chunk.length;
      }
    }
    console.log(`  rows ${t.name}: ${t.rows.length} processed`);
  }

  console.log(`\nDONE. rows inserted=${ok} failed=${fail}`);
  // 3. summary check
  const after = await fetch(`${BASE}/data-tables?limit=100`, { headers: H }).then(r => r.json());
  console.log(`Tables in new instance: ${(after.data || []).length}`);
}
main().catch(e => { console.error("IMPORT FAILED:", e.message); process.exit(1); });
