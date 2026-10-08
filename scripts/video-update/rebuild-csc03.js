// Rebuild CSC 03 - Service Catalog Engine: HARDCODED catalog -> DATA TABLE driven
// Single source of truth = service_catalog / service_fields / service_documents tables.
// Contract kept: output { catalog } object keyed by service_id (same shape as before).
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const db = new DatabaseSync(process.env.HOME + '/.n8n/database.sqlite', { readOnly: true });
const row = db.prepare("SELECT nodes FROM workflow_entity WHERE id='3c5c0001-0000-4000-8000-000000000003'").get();
const wf = { nodes: JSON.parse(row.nodes) };

const trigger = wf.nodes.find(n => n.name === 'Trigger');

const dtNode = (name, table, conditions) => ({
  parameters: {
    resource: 'row',
    operation: 'get',
    dataTableId: { __rl: true, mode: 'name', value: table },
    matchType: 'allConditions',
    filters: { conditions },
    returnAll: true,
  },
  id: 'dt-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  type: 'n8n-nodes-base.dataTable',
  typeVersion: 1.1,
  position: [0, 0],
  alwaysOutputData: true,
  executeOnce: true,
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
return [{ json: { catalog } };`;

// fix: proper return statement
buildCatalogCode.replace('};`;', '');

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

const newNodes = [
  trigger,
  dtNode('Get Catalog Rows', 'service_catalog', [{ keyName: 'active', condition: 'eq', keyValue: 'TRUE' }]),
  dtNode('Get Field Rows', 'service_fields', [{ keyName: 'service_id', condition: 'neq', keyValue: '__none__' }]),
  dtNode('Get Doc Rows', 'service_documents', [{ keyName: 'service_id', condition: 'neq', keyValue: '__none__' }]),
  {
    parameters: { jsCode: buildCatalogCode },
    id: 'code-build-catalog',
    name: 'Build Catalog',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 0],
  },
  {
    parameters: { jsCode: selectServiceCode },
    id: 'code-select-service',
    name: 'Select Service',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 0],
  },
];

// fix the stray return in buildCatalogCode (safety)
for (const n of newNodes) {
  if (n.name === 'Build Catalog') {
    n.parameters.jsCode = n.parameters.jsCode.replace('return [{ json: { catalog } };', 'return [{ json: { catalog } }];');
  }
  n.position = undefined;
}

// positions (serial)
newNodes[0].position = [-520, 0];
newNodes[1].position = [-300, 0];
newNodes[2].position = [-80, 0];
newNodes[3].position = [140, 0];
newNodes[4].position = [360, 0];
newNodes[5].position = [580, 0];

// SERIAL chain (fan-out from executeWorkflowTrigger proved unreliable): each get runs once (executeOnce)
const connections = {
  Trigger: { main: [[{ node: 'Get Catalog Rows', type: 'main', index: 0 }]] },
  'Get Catalog Rows': { main: [[{ node: 'Get Field Rows', type: 'main', index: 0 }]] },
  'Get Field Rows': { main: [[{ node: 'Get Doc Rows', type: 'main', index: 0 }]] },
  'Get Doc Rows': { main: [[{ node: 'Build Catalog', type: 'main', index: 0 }]] },
  'Build Catalog': { main: [[{ node: 'Select Service', type: 'main', index: 0 }]] },
};

// get workflow settings from existing export via DB columns
const meta = db.prepare("SELECT name, settings, connections FROM workflow_entity WHERE id='3c5c0001-0000-4000-8000-000000000003'").get();
const out = {
  id: '3c5c0001-0000-4000-8000-000000000003',
  name: meta.name,
  nodes: newNodes,
  connections,
  settings: JSON.parse(meta.settings || '{}'),
};
fs.writeFileSync('/tmp/csc03-new.json', JSON.stringify(out, null, 2));
console.log('written /tmp/csc03-new.json (' + newNodes.length + ' nodes)');
