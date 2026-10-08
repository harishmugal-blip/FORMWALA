const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const BASE = "http://localhost:3000/api/v1";

async function main() {
  const allTables = await fetch(`${BASE}/data-tables?limit=50`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
  const rows = allTables.data || [];
  const targets = ["service_catalog", "service_fields", "service_documents", "service_pricing", "system_config", "customers", "applications", "audit_log"];

  for (const name of targets) {
    const t = rows.find(x => x.name === name);
    if (!t) { console.log(`${name}: NOT FOUND`); continue; }
    const r = await fetch(`${BASE}/data-tables/${t.id}/rows?limit=1`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
    const total = r.data?.totalRows ?? r.data?.count ?? "?";
    console.log(`${name}: ${total} rows`);
  }

  // sample service catalog entry
  const cat = rows.find(x => x.name === "service_catalog");
  if (cat) {
    const r = await fetch(`${BASE}/data-tables/${cat.id}/rows?limit=3`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
    const sample = (r.data?.rows || [])[0];
    console.log("\nSample catalog row:", JSON.stringify(sample, null, 1).slice(0, 400));
  }
}
main().catch(e => console.error(e.message));
