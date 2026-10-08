// Re-apply post-backup fixes (workflows-backup.json was stale from Task 8):
// A) CSC 03 -> table-driven rebuild (Task 12)
// B) CSC 02 -> Build Prompt add RATION_CARD/PASSPORT examples (Task 12)
// C) CSC 08 -> Prep Get Pricing / Prep Init Payment try-catch fix (Task 9)
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const BASE = "http://127.0.0.1:4000/api/v1";
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };

async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: H, ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
async function getWf(prefix) {
  const list = await api("/workflows?limit=100");
  const w = list.data.find(x => x.name.startsWith(prefix));
  return { ...w, full: await api(`/workflows/${w.id}`) };
}
async function saveAndActivate(wf, nodes, connections) {
  await api(`/workflows/${wf.id}`, { method: "PUT", body: JSON.stringify({ name: wf.name, nodes, connections: connections || wf.full.connections, settings: wf.full.settings }) });
  await api(`/workflows/${wf.id}/activate`, { method: "POST" });
  console.log(`  ${wf.name}: patched + activated`);
}

// ---- A) CSC 03 table-driven rebuild (same graph as Task 12 script) ----
async function fixCSC03() {
  const wf = await getWf("CSC 03");
  const trigger = wf.full.nodes.find(n => n.name === "Trigger");
  const dtNode = (name, table, conditions) => ({
    parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "name", value: table }, matchType: "allConditions", filters: { conditions }, returnAll: true },
    id: "dt-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name, type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: [0, 0], alwaysOutputData: true, executeOnce: true,
  });
  const buildCatalogCode = `// Build catalog from Data Tables (single source of truth - NO hardcoding)
const toBool = (v, d) => (v === undefined || v === null || v === '') ? d : String(v).toUpperCase() === 'TRUE';
const catRows = $('Get Catalog Rows').all().map(i => i.json);
const fieldRows = $('Get Field Rows').all().map(i => i.json);
const docRows = $('Get Doc Rows').all().map(i => i.json);

const catalog = {};
for (const r of catRows) {
  const gov = Number(r.government_fee) || 0;
  const sc = Number(r.service_charge) || 0;
  const pct = (r.gst_percent === null || r.gst_percent === undefined || r.gst_percent === '') ? 18 : Number(r.gst_percent);
  const gst = pct === 0 ? 0 : Math.round(sc * pct / 100);
  let steps = [];
  try { steps = JSON.parse(r.processing_steps || '[]'); } catch (e) {}
  catalog[r.service_id] = {
    service_id: r.service_id,
    service_name: r.service_name,
    category: r.category,
    description: r.description,
    government_fee: gov,
    service_charge: sc,
    gst: gst,
    total_fee: gov + sc + gst,
    portal_url: r.portal_url || 'STATE_PORTAL',
    portal_type: r.portal_type || 'PORTAL_OPERATOR',
    operator_required: toBool(r.operator_required, true),
    otp_required: toBool(r.otp_required, false),
    captcha_required: toBool(r.captcha_required, false),
    status_tracking: true,
    receipt_required: toBool(r.receipt_required, true),
    processing_steps: steps,
    active: true,
    required_fields: fieldRows.filter(f => f.service_id === r.service_id).sort((a, b) => (Number(a.field_order) || 0) - (Number(b.field_order) || 0)).map(f => f.field_key),
    required_documents: docRows.filter(d => d.service_id === r.service_id).sort((a, b) => (Number(a.doc_order) || 0) - (Number(b.doc_order) || 0)).map(d => d.doc_key)
  };
}
return [{ json: { catalog } }];`;

  const selectServiceCode = `// Select & validate service from catalog
const { catalog } = $('Build Catalog').first().json;
const serviceId = ($('Trigger').first().json.service_id || '').toString().toUpperCase().trim();
const active = Object.values(catalog).filter(s => s.active);

if (!serviceId) {
  return [{ json: { ok: true, catalog: active } }];
}
const svc = catalog[serviceId];
if (!svc || !svc.active) {
  return [{ json: { ok: false, error: 'SERVICE_NOT_FOUND', message: 'Main aapki request ko clearly samajh nahi paaya. Kripya niche diye gaye services mein se select karein.', available: active.map(s => s.service_id) } }];
}
return [{ json: { ok: true, service: svc } }];`;

  const nodes = [
    trigger,
    dtNode("Get Catalog Rows", "service_catalog", [{ keyName: "active", condition: "eq", keyValue: "TRUE" }]),
    dtNode("Get Field Rows", "service_fields", [{ keyName: "service_id", condition: "neq", keyValue: "__none__" }]),
    dtNode("Get Doc Rows", "service_documents", [{ keyName: "service_id", condition: "neq", keyValue: "__none__" }]),
    { parameters: { jsCode: buildCatalogCode }, id: "code-build-catalog", name: "Build Catalog", type: "n8n-nodes-base.code", typeVersion: 2, position: [360, 0] },
    { parameters: { jsCode: selectServiceCode }, id: "code-select-service", name: "Select Service", type: "n8n-nodes-base.code", typeVersion: 2, position: [580, 0] },
  ];
  const connections = {
    Trigger: { main: [[{ node: "Get Catalog Rows", type: "main", index: 0 }]] },
    "Get Catalog Rows": { main: [[{ node: "Get Field Rows", type: "main", index: 0 }]] },
    "Get Field Rows": { main: [[{ node: "Get Doc Rows", type: "main", index: 0 }]] },
    "Get Doc Rows": { main: [[{ node: "Build Catalog", type: "main", index: 0 }]] },
    "Build Catalog": { main: [[{ node: "Select Service", type: "main", index: 0 }]] },
  };
  await saveAndActivate(wf, nodes, connections);
}

// ---- B) CSC 02 prompt examples ----
async function fixCSC02() {
  const wf = await getWf("CSC 02");
  const bp = wf.full.nodes.find(n => n.name === "Build Prompt");
  const js = bp.parameters.jsCode;
  if (!js.includes("RATION_CARD ->") && !js.includes('-> RATION_CARD')) {
    bp.parameters.jsCode = js.replace(
      '"job ka form bharna hai" -> GOV_JOB_FORM.',
      '"job ka form bharna hai" -> GOV_JOB_FORM; "ration card banana hai" -> RATION_CARD; "passport banwana hai" -> PASSPORT.'
    );
    if (bp.parameters.jsCode === js) throw new Error("CSC 02 example anchor not found");
  }
  await saveAndActivate(wf, wf.full.nodes);
}

// ---- C) CSC 08 try/catch fix ----
async function fixCSC08() {
  const wf = await getWf("CSC 08");
  const nodes = wf.full.nodes.map(n => {
    const c = { ...n };
    delete c.returnAll;  // stray node-level key - belongs inside parameters only
    return c;
  });
  const pgp = nodes.find(n => n.name === "Prep Get Pricing");
  pgp.parameters.jsCode = `let gp = {};
try { gp = $('Go Payment').first().json || {}; } catch (e) {}
const mn = $('Match Next Doc').first().json;
return [{ json: { service_id: gp.service_id || (mn.service && mn.service.service_id) || '' } }];`;

  const pip = nodes.find(n => n.name === "Prep Init Payment");
  pip.parameters.jsCode = `const pr = $('Get Pricing').first().json;
let gp = {};
try { gp = $('Go Payment').first().json || {}; } catch (e) {}
const mn = $('Match Next Doc').first().json;
return [{ json: { application_id: gp.application_id || mn.application_id, phone: gp.phone || mn.phone, service_id: pr.service_id, total: pr.total, gov_fee: pr.gov_fee, service_charge: pr.service_charge, gst: pr.gst } }];`;

  await saveAndActivate(wf, nodes);
}

(async () => {
  console.log("A) CSC 03 table-driven rebuild");
  await fixCSC03();
  console.log("B) CSC 02 prompt examples");
  await fixCSC02();
  console.log("C) CSC 08 try/catch fix");
  await fixCSC08();
  console.log("\nALL POST-BACKUP FIXES APPLIED ✓");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
