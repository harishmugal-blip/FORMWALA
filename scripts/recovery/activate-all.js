// Activate all workflows: sub-workflows first, CSC 01 Router last
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const BASE = "http://127.0.0.1:4000/api/v1";
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };

async function main() {
  const list = await fetch(`${BASE}/workflows?limit=100`, { headers: H }).then(r => r.json());
  const wfs = list.data.filter(w => w.name.startsWith("CSC"));
  // sub-workflows (called by others) first; CSC 01 router absolutely last
  const order = wfs.filter(w => !w.name.startsWith("CSC 01")).map(w => w.id)
    .concat(wfs.filter(w => w.name.startsWith("CSC 01")).map(w => w.id));
  let ok = 0, fail = 0;
  for (const id of order) {
    const r = await fetch(`${BASE}/workflows/${id}/activate`, { method: "POST", headers: H });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { ok++; console.log(`  + active: ${j.name || id}`); }
    else { fail++; console.error(`  X ${id}: ${r.status} ${JSON.stringify(j).slice(0, 120)}`); }
  }
  console.log(`\nACTIVATED ${ok}, FAILED ${fail}`);
}
main().catch(e => { console.error(e); process.exit(1); });
