/**
 * Export all n8n Data Tables (schema + rows) to a single JSON file.
 * Output: /home/z/my-project/download/supabase-migration/datatables-backup.json
 * Used for Supabase migration (import script reads this file).
 */
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const BASE = "http://localhost:3000/api/v1";
const H = { "X-N8N-API-KEY": KEY };
const OUT = "/home/z/my-project/download/supabase-migration/datatables-backup.json";

async function main() {
  const tRes = await fetch(`${BASE}/data-tables?limit=100`, { headers: H }).then(r => r.json());
  const tables = tRes.data || [];
  console.log(`Found ${tables.length} data tables`);

  const dump = [];
  for (const t of tables) {
    // schema
    const cols = (t.columns || []).map(c => ({ name: c.name, type: c.type }));
    // rows (paginate)
    let rows = [], cursor = null;
    do {
      const url = `${BASE}/data-tables/${t.id}/rows?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
      const r = await fetch(url, { headers: H }).then(r => r.json());
      const data = r.data || [];
      rows = rows.concat(data);
      cursor = r.nextCursor || null;
    } while (cursor);

    dump.push({ name: t.name, columns: cols, rows });
    console.log(`  ${t.name}: ${cols.length} cols, ${rows.length} rows`);
  }

  await Bun.write(OUT, JSON.stringify(dump, null, 1));
  const total = dump.reduce((a, d) => a + d.rows.length, 0);
  console.log(`\nSaved ${dump.length} tables / ${total} rows -> ${OUT}`);
}
main().catch(e => { console.error("EXPORT FAILED:", e.message); process.exit(1); });
