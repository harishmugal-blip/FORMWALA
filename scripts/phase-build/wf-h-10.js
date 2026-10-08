// Build CSC 10 - Document Validator (completeness + quality check)
import { buildWorkflow, writeJson, triggerSub, code, dtGet, exwf, link, mergeConn, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";
const nodes = [];
const C = {};

nodes.push(triggerSub("Trigger"));
nodes.push(dtGet("Get App", "applications", "application_id", "={{ $json.application_id }}"));
nodes.push(exwf("Load Config", WF[5], {
  parameters: { source: "database", workflowId: WF[5],
    workflowInputs: { mappingMode: "defineBelow", value: {
      action: "get_full_config",
      service_id: "={{ $json.service_id || '' }}"
    } } }
}));
nodes.push(dtGet("Get Saved Docs", "application_documents", "application_id", "={{ $('Get App').first().json.application_id }}", { returnAll: true }));
nodes.push(code("Validate Docs", `
const cfg = $('Load Config').first().json || {};
const app = $('Get App').first().json;
const required = cfg.documents || [];
let saved = [];
try { saved = $input.all().map(i => i.json); } catch (e) {}
const savedKeys = saved.map(d => d.doc_key);
const missing = required.filter(d => !savedKeys.includes(d.doc_key));
const received = required.filter(d => savedKeys.includes(d.doc_key));
const noOcr = saved.filter(d => savedKeys.includes(d.doc_key) && !d.ocr_text).map(d => d.doc_key);
let msg = '';
if (missing.length === 0) {
  msg = '\\u2705 Saare ' + required.length + ' documents mil gaye hain.';
  if (noOcr.length) msg += '\\n\\u2139\\ufe0f OCR pending: ' + noOcr.join(', ') + ' (operator verify karega)';
} else {
  msg = '\\ud83d\\udcc4 Documents: ' + received.length + '/' + required.length + ' mile.\\nMissing: ' + missing.map(m => m.label || m.doc_key).join(', ');
}
return [{ json: {
  ok: true, application_id: app.application_id, application_number: app.application_number,
  complete: missing.length === 0, received: received.map(r => r.doc_key),
  missing: missing.map(m => m.doc_key), missing_labels: missing.map(m => m.label || m.doc_key),
  ocr_pending: noOcr, message: msg
} }];`));

mergeConn(C, link("Trigger", "Get App"));
mergeConn(C, link("Get App", "Load Config"));
mergeConn(C, link("Load Config", "Get Saved Docs"));
mergeConn(C, link("Get Saved Docs", "Validate Docs"));
writeJson(DIR + "csc-10.json", buildWorkflow(WF[10], "CSC 10 - Document Validator", nodes, C));
console.log("BUILD CSC 10 DONE");
