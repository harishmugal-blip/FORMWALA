// Re-extract guide data from DB (now 16 services) in the guide-extract.json shape
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.HOME + '/.n8n/database.sqlite', { readOnly: true });
const T = {};
for (const n of ['service_catalog','service_fields','service_documents']) {
  T[n] = db.prepare('SELECT id FROM data_table WHERE name=?').get(n).id;
}
const tb = n => 'data_table_user_' + T[n];
const cats = db.prepare(`SELECT * FROM ${tb('service_catalog')} ORDER BY id`).all();
const fields = db.prepare(`SELECT * FROM ${tb('service_fields')} ORDER BY service_id, CAST(field_order AS INTEGER)`).all();
const docs = db.prepare(`SELECT * FROM ${tb('service_documents')} ORDER BY service_id, CAST(doc_order AS INTEGER)`).all();

const out = [];
for (const c of cats) {
  out.push({
    service: c.service_id,
    name: c.service_name,
    cat: c.category,
    desc: c.description,
    portal: c.portal_url,
    fields: fields.filter(f => f.service_id === c.service_id).map(f => ({
      key: f.field_key, label: f.label, type: f.field_type, req: f.required, opts: f.options || '', q: f.question
    })),
    docs: docs.filter(d => d.service_id === c.service_id).map(d => ({
      key: d.doc_key, label: d.label, req: d.required
    })),
    steps: c.processing_steps,
  });
}
require('fs').writeFileSync('/home/z/my-project/scripts/guide-extract.json', JSON.stringify(out, null, 1));
console.log('extracted ' + out.length + ' services, ' +
  out.reduce((a, s) => a + s.fields.length, 0) + ' fields, ' +
  out.reduce((a, s) => a + s.docs.length, 0) + ' docs');
