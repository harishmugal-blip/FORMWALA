// Verify end-to-end state: application, payment, receipt, operator task, notifications
const BASE = "http://localhost:3000/api/v1";
const H = { "X-N8N-API-KEY": "n8n_api_csc-build-2026-a7f3d9e2b8c4" };

async function rows(table) {
  const r = await fetch(`${BASE}/data-tables/${table.id}/rows?limit=50`, { headers: H });
  const d = await r.json();
  return d.data || [];
}
async function tableId(name) {
  const r = await fetch(`${BASE}/data-tables?limit=100`, { headers: H });
  const d = await r.json();
  return d.data.find(t => t.name === name);
}

for (const name of ["applications", "payments", "receipts", "operator_tasks", "notifications_log", "application_status_history", "audit_log"]) {
  const t = await tableId(name);
  const data = await rows(t);
  console.log(`\n=== ${name} (${data.length} rows) ===`);
  for (const r of data.slice(0, 3)) {
    const brief = {};
    for (const k of Object.keys(r)) {
      if (["id", "createdAt", "updatedAt"].includes(k)) continue;
      const v = String(r[k] ?? "");
      brief[k] = v.length > 90 ? v.slice(0, 90) + "…" : v;
    }
    console.log(JSON.stringify(brief));
  }
}
