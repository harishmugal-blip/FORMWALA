// Build CSC 06 - Field Collector (dynamic Q&A conversation engine)
import { buildWorkflow, writeJson, triggerSub, code, dtGet, dtInsert, dtUpdate, dtUpsert, dtDelete, ifNode, eq, exwf, link, mergeConn, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";
const nodes = [];
const C = {};

nodes.push(triggerSub("Trigger"));
nodes.push(dtGet("Get Conv State", "conversation_state", "phone", "={{ $json.phone }}"));
nodes.push(exwf("Load Config", WF[5], {
  parameters: {
    source: "database",
    workflowId: WF[5],
    workflowInputs: {
      mappingMode: "defineBelow",
      value: {
        action: "get_full_config",
        service_id: "={{ $('Get Conv State').first().json.service_id || $('Trigger').first().json.service_id || '' }}"
      }
    }
  }
}));

nodes.push(code("Compute Step", `
const state = $('Get Conv State').first().json || {};
const cfg = $json || {};
const input = $('Trigger').first().json;
const msg = String(input.message || '').trim();
const up = msg.toUpperCase();
const phone = input.phone;

const FIELDS = cfg.fields || [];
const DOCS = cfg.documents || [];
const service = cfg.service || {};
let ctx = {};
try { ctx = JSON.parse(state.context_data || '{}'); } catch (e) {}

if (up === 'CANCEL') return [{ json: { next: 'cancel', phone } }];

const activeState = state.state || '';
const validStates = ['FIELDS', 'DOCS', 'PAYMENT'];
if (!validStates.includes(activeState)) {
  if (!service.service_id) return [{ json: { next: 'no_config', phone } }];
  const application_id = 'APP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  return [{ json: { next: 'start', phone, application_id, service_id: service.service_id, fields: FIELDS, docs: DOCS, service } }];
}

if (activeState === 'PAYMENT') {
  return [{ json: { next: 'payment_note', phone, application_id: ctx.application_id, service } }];
}

if (activeState === 'DOCS') {
  return [{ json: { next: 'ask_doc_reminder', phone, application_id: ctx.application_id, docs: DOCS, ctx, service } }];
}

// FIELDS state
const idx = Number(ctx.field_index || 0);
const field = FIELDS[idx];
if (!field) {
  const application_id = ctx.application_id || ('APP' + Date.now().toString(36).toUpperCase());
  return [{ json: { next: 'all_fields_done', phone, application_id, fields: FIELDS, docs: DOCS, ctx, service } }];
}
return [{ json: { next: 'answer', phone, application_id: ctx.application_id, field, value: msg, fields: FIELDS, docs: DOCS, ctx, service, idx } }];`));

// ---------- Switch on next ----------
nodes.push({
  parameters: {
    rules: {
      values: [
        { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "r0", leftValue: "={{ $json.next }}", rightValue: "start", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "start" },
        { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "r1", leftValue: "={{ $json.next }}", rightValue: "answer", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "answer" },
        { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "r2", leftValue: "={{ $json.next }}", rightValue: "all_fields_done", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "done" },
        { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "r3", leftValue: "={{ $json.next }}", rightValue: "payment_note", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "payment" },
        { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "r4", leftValue: "={{ $json.next }}", rightValue: "cancel", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "cancel" },
        { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "r5", leftValue: "={{ $json.next }}", rightValue: "ask_doc_reminder", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "docsstatus" }
      ]
    },
    options: { fallbackOutput: "extra", renameFallbackOutput: "other" }
  },
  name: "Route Step", type: "n8n-nodes-base.switch", typeVersion: 3.2, position: [0, 0]
});

// ---------- START branch (output 0) ----------
nodes.push(dtInsert("Create Draft App", "applications", {
  application_id: "={{ $('Compute Step').first().json.application_id }}",
  customer_phone: "={{ $('Compute Step').first().json.phone }}",
  service_id: "={{ $('Compute Step').first().json.service_id }}",
  status: "DRAFT",
  form_data: "",
  application_number: "",
  created_at: "={{ $now.toISO() }}",
  updated_at: "={{ $now.toISO() }}"
}));
nodes.push(dtUpsert("Init State", "conversation_state", "phone", "={{ $('Compute Step').first().json.phone }}", {
  phone: "={{ $('Compute Step').first().json.phone }}",
  state: "FIELDS",
  service_id: "={{ $('Compute Step').first().json.service_id }}",
  context_data: "={{ JSON.stringify({ field_index: 0, application_id: $('Compute Step').first().json.application_id }) }}",
  handoff_active: "FALSE",
  updated_at: "={{ $now.toISO() }}"
}));
nodes.push(code("Ask First Question", `
const cs = $('Compute Step').first().json;
const fields = cs.fields || [];
const first = fields[0];
if (!first) return [{ json: { reply: 'Is service ke liye koi field configured nahi hai. Operator se baat karein - HUMAN likhein.', phone: cs.phone } }];
const svc = cs.service || {};
let msg = '\\u2705 Aapne \"' + (svc.service_name || cs.service_id) + '\" select kiya hai.\\n';
msg += 'Ab main aapse zaroori sawal puchunga. Har jawab ke baad next sawal aayega.\\nKabhi bhi CANCEL likhkar band kar sakte hain.\\n\\n';
msg += '\\ud83d\\udcdd Sawal 1/' + fields.length + ': ' + (first.question || first.label);
if ((first.options || '').trim()) msg += ' (' + first.options.split(',').join(' / ') + ')';
return [{ json: { reply: msg, phone: cs.phone } }];`));

// ---------- ANSWER branch (output 1) ----------
nodes.push(exwf("Validate Answer", WF[7], {
  parameters: {
    source: "database",
    workflowId: WF[7],
    workflowInputs: {
      mappingMode: "defineBelow",
      value: {
        field_key: "={{ $('Compute Step').first().json.field.field_key }}",
        field_label: "={{ $('Compute Step').first().json.field.label }}",
        field_type: "={{ $('Compute Step').first().json.field.field_type }}",
        options: "={{ $('Compute Step').first().json.field.options }}",
        error_hint: "={{ $('Compute Step').first().json.field.error_hint }}",
        value: "={{ $('Compute Step').first().json.value }}"
      }
    }
  }
}));
nodes.push(ifNode("Answer Valid?", [eq("={{ $json.valid }}", "true")]));
nodes.push(dtUpsert("Save Field Value", "application_field_values", "application_id", "={{ $('Compute Step').first().json.application_id }}", {
  application_id: "={{ $('Compute Step').first().json.application_id }}",
  phone: "={{ $('Compute Step').first().json.phone }}",
  field_key: "={{ $('Validate Answer').first().json.field_key }}",
  field_value: "={{ $('Validate Answer').first().json.normalized }}",
  validated: "TRUE",
  created_at: "={{ $now.toISO() }}",
  updated_at: "={{ $now.toISO() }}"
}));
nodes.push(code("Next Or Done", `
const cs = $('Compute Step').first().json;
const nextIdx = Number(cs.idx || 0) + 1;
const fields = cs.fields || [];
return [{ json: { done: nextIdx >= fields.length, nextIdx, fields } }];`));
nodes.push(ifNode("More Fields?", [eq("={{ $json.done }}", "false")]));
nodes.push(dtUpdate("Update Field Index", "conversation_state", "phone", "={{ $('Compute Step').first().json.phone }}", {
  context_data: "={{ JSON.stringify({ field_index: $('Next Or Done').first().json.nextIdx, application_id: $('Compute Step').first().json.application_id }) }}",
  updated_at: "={{ $now.toISO() }}"
}));
nodes.push(code("Ask Next Question", `
const cs = $('Compute Step').first().json;
const next = $('Next Or Done').first().json;
const f = (cs.fields || [])[next.nextIdx] || {};
let msg = '\\ud83d\\udcdd Sawal ' + (next.nextIdx + 1) + '/' + (cs.fields || []).length + ': ' + (f.question || f.label);
if ((f.options || '').trim()) msg += ' (' + f.options.split(',').join(' / ') + ')';
return [{ json: { reply: msg, phone: cs.phone } }];`));
nodes.push(code("Re-ask With Hint", `
const cs = $('Compute Step').first().json;
const v = $('Validate Answer').first().json;
const f = (cs.fields || [])[Number(cs.idx || 0)] || {};
let msg = '\\u26a0\\ufe0f ' + (v.error || 'Value sahi nahi hai.') + '\\n\\n\\ud83d\\udcdd Dobara likhein: ' + (f.question || f.label);
if ((f.options || '').trim()) msg += ' (' + f.options.split(',').join(' / ') + ')';
return [{ json: { reply: msg, phone: cs.phone } }];`));

// ---------- DONE (all fields complete) branch (output 2) ----------
nodes.push(dtUpdate("Set State Docs", "conversation_state", "phone", "={{ $('Compute Step').first().json.phone }}", {
  state: "DOCS",
  context_data: "={{ JSON.stringify({ field_index: 0, application_id: $('Compute Step').first().json.application_id, doc_index: 0 }) }}",
  updated_at: "={{ $now.toISO() }}"
}));
nodes.push(code("Build Doc Message", `
const cs = $('Compute Step').first().json;
const docs = cs.docs || [];
const svc = cs.service || {};
let msg = '\\u2705 Sari details mil gayi hain \\ud83d\\udcd1\\n\\n';
msg += 'Ab documents chahiye (' + docs.length + ' items) - \"' + (svc.service_name || '') + '\" ke liye:\\n';
docs.forEach((d, i) => { msg += '\\n' + (i + 1) + '. \\ud83d\\udcc4 ' + (d.label || d.doc_key) + ' - ' + (d.question || 'photo bhejein'); });
msg += '\\n\\nEk-ek karke photo/PDF bhejein. Sab mil jane ke baad payment link milega.\\nCANCEL likhein to band ho jayega.';
return [{ json: { reply: msg, phone: cs.phone } }];`));

// ---------- PAYMENT branch (output 3) ----------
nodes.push(code("Payment Wait Note", `
const cs = $('Compute Step').first().json;
let msg = '\\ud83d\\udcb3 Aapka payment pending hai.\\n';
msg += 'Payment link bheja ja chuka hai. Payment confirm hote hi application aage badhega.\\n';
msg += 'Status ke liye STATUS likhein. Sahayata ke liye HUMAN likhein.';
return [{ json: { reply: msg, phone: cs.phone } }];`));

// ---------- CANCEL branch (output 4) ----------
nodes.push(dtDelete("Clear State", "conversation_state", "phone", "={{ $json.phone }}"));
nodes.push(code("Cancel Msg", `
const input = $('Trigger').first().json;
return [{ json: { reply: '\\ud83d\\udd01 Aapka request cancel kar diya gaya. Naya kaam shuru karne ke liye service ka naam type karein.\\n\\nDhanyawad!', phone: input.phone } }];`));

// ---------- DOCS REMINDER branch (output 5) ----------
nodes.push(code("Ask Doc Reminder", `
const cs = $('Compute Step').first().json;
const docs = cs.docs || [];
let msg = '\\ud83d\\udcc4 Aapko abhi documents bhejne hain (' + docs.length + ' items).\\n';
docs.forEach((d, i) => { msg += '\\n' + (i + 1) + '. ' + (d.label || d.doc_key); });
msg += '\\n\\nPhoto/PDF bhejein, ya CANCEL likhein.';
return [{ json: { reply: msg, phone: cs.phone } }];`));

// ---------- fallback ----------
nodes.push(code("No Config Reply", `
const cs = $('Compute Step').first().json;
return [{ json: { reply: '\\ud83d\\ude45 Is service ki config nahi mili. Service ka naam dobara type karein ya HUMAN likhein.', phone: cs.phone } }];`));

// ---------- connections ----------
mergeConn(C, link("Trigger", "Get Conv State"));
mergeConn(C, link("Get Conv State", "Load Config"));
mergeConn(C, link("Load Config", "Compute Step"));
mergeConn(C, link("Compute Step", "Route Step"));

mergeConn(C, { "Route Step": { main: [
  [{ node: "Create Draft App", type: "main", index: 0 }],
  [{ node: "Validate Answer", type: "main", index: 0 }],
  [{ node: "Set State Docs", type: "main", index: 0 }],
  [{ node: "Payment Wait Note", type: "main", index: 0 }],
  [{ node: "Clear State", type: "main", index: 0 }],
  [{ node: "Ask Doc Reminder", type: "main", index: 0 }],
  [{ node: "No Config Reply", type: "main", index: 0 }]
] } });

mergeConn(C, link("Create Draft App", "Init State"));
mergeConn(C, link("Init State", "Ask First Question"));

mergeConn(C, link("Validate Answer", "Answer Valid?"));
mergeConn(C, { "Answer Valid?": { main: [[{ node: "Save Field Value", type: "main", index: 0 }], [{ node: "Re-ask With Hint", type: "main", index: 0 }]] } });
mergeConn(C, link("Save Field Value", "Next Or Done"));
mergeConn(C, link("Next Or Done", "More Fields?"));
mergeConn(C, { "More Fields?": { main: [[{ node: "Update Field Index", type: "main", index: 0 }], [{ node: "Set State Docs", type: "main", index: 0 }]] } });
mergeConn(C, link("Update Field Index", "Ask Next Question"));
mergeConn(C, link("Set State Docs", "Build Doc Message"));

writeJson(DIR + "csc-06.json", buildWorkflow(WF[6], "CSC 06 - Field Collector (Conversation Engine)", nodes, C));
console.log("BUILD CSC 06 DONE");
