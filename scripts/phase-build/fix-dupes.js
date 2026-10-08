// Fix per-item duplication: dedupe in aggregation Code nodes
import { readFileSync, writeFileSync } from "node:fs";

const dir = "/home/z/my-project/scripts/phase-build/json/";

const REPLACES = {
  "csc-05.json": [
    ["fields.sort((a, b) => (a.field_order || 0) - (b.field_order || 0));",
     "const seenF = new Set(); fields = fields.filter(f => f && f.field_key && !seenF.has(f.field_key) && seenF.add(f.field_key));\nfields.sort((a, b) => (a.field_order || 0) - (b.field_order || 0));"],
    ["docs.sort((a, b) => (a.doc_order || 0) - (b.doc_order || 0));",
     "const seenD = new Set(); docs = docs.filter(d => d && d.doc_key && !seenD.has(d.doc_key) && seenD.add(d.doc_key));\ndocs.sort((a, b) => (a.doc_order || 0) - (b.doc_order || 0));"]
  ],
  "csc-16.json": [
    ["let fields = [];\ntry { fields = $('Get Field Values').all().map(i => i.json); } catch (e) {}",
     "let fields = [];\ntry { const _tmp = $('Get Field Values').all().map(i => i.json).filter(f => f && f.field_key); const _seen = new Set(); fields = _tmp.filter(f => !_seen.has(f.field_key) && _seen.add(f.field_key)); } catch (e) {}"],
    ["let docs = [];\ntry { docs = $('Get Docs Count').all().map(i => i.json); } catch (e) {}",
     "let docs = [];\ntry { const _tmp2 = $('Get Docs Count').all().map(i => i.json).filter(d => d && d.doc_key); const _seen2 = new Set(); docs = _tmp2.filter(d => !_seen2.has(d.doc_key) && _seen2.add(d.doc_key)); } catch (e) {}"]
  ],
  "csc-21.json": [
    ["try { for (const i of $('Get PAYMENT Convos').all()) items.push({ phone: i.json.phone, type: 'PAYMENT', service_id: i.json.service_id, context_data: i.json.context_data || '{}' }); } catch (e) {}",
     "try { const _seenP = new Set(); for (const i of $('Get PAYMENT Convos').all()) { const it = i.json; if (!it || !it.phone || _seenP.has(it.phone)) continue; _seenP.add(it.phone); items.push({ phone: it.phone, type: 'PAYMENT', service_id: it.service_id, context_data: it.context_data || '{}' }); } } catch (e) {}"],
    ["try { for (const i of $('Get DOCS Convos').all()) items.push({ phone: i.json.phone, type: 'DOCS', service_id: i.json.service_id, context_data: i.json.context_data || '{}' }); } catch (e) {}",
     "try { const _seenC = new Set(); for (const i of $('Get DOCS Convos').all()) { const it = i.json; if (!it || !it.phone || _seenC.has(it.phone)) continue; _seenC.add(it.phone); items.push({ phone: it.phone, type: 'DOCS', service_id: it.service_id, context_data: it.context_data || '{}' }); } } catch (e) {}"]
  ],
  "csc-23.json": [
    ["try { apps = $('All Apps').all().map(i => i.json); } catch (e) {}",
     "try { const _tmpA = $('All Apps').all().map(i => i.json).filter(a => a && a.application_id); const _seenA = new Set(); apps = _tmpA.filter(a => !_seenA.has(a.application_id) && _seenA.add(a.application_id)); } catch (e) {}"],
    ["try { pays = $('All Payments').all().map(i => i.json); } catch (e) {}",
     "try { const _tmpP = $('All Payments').all().map(i => i.json).filter(p => p && p.payment_id); const _seenP = new Set(); pays = _tmpP.filter(p => !_seenP.has(p.payment_id) && _seenP.add(p.payment_id)); } catch (e) {}"]
  ]
};

let n = 0;
for (const [file, reps] of Object.entries(REPLACES)) {
  const wf = JSON.parse(readFileSync(dir + file, "utf8"));
  let changed = false;
  for (const node of wf.nodes) {
    if (node.type !== "n8n-nodes-base.code") continue;
    for (const [from, to] of reps) {
      if (node.parameters.jsCode.includes(from)) {
        node.parameters.jsCode = node.parameters.jsCode.split(from).join(to);
        n++; changed = true;
      }
    }
  }
  if (changed) writeFileSync(dir + file, JSON.stringify(wf, null, 1));
  console.log(file, changed ? "patched" : "no change");
}
console.log("replacements:", n);
