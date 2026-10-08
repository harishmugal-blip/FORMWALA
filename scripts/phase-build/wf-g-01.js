// Build CSC 01 v2 - WhatsApp Main Router (state-aware, media route, operator commands)
import { buildWorkflow, writeJson, code, dtGet, dtInsert, dtUpsert, dtUpdate, ifNode, eq, notEmpty, isEmpty, notEq, exwf, webhookNode, respond, http, link, mergeConn, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";
const nodes = [];
const C = {};

nodes.push(webhookNode("WhatsApp Webhook", "whatsapp", "POST", { parameters: { httpMethod: "POST", path: "whatsapp", responseMode: "responseNode", options: {} } }));
nodes.push(webhookNode("WhatsApp Verify", "whatsapp", "GET", { parameters: { httpMethod: "GET", path: "whatsapp", responseMode: "responseNode", options: {} } }));
nodes.push(respond("Return Challenge", { respondWith: "text", responseBody: "={{ $json.query['hub.challenge'] || 'ok' }}" }));
nodes.push(code("Normalize Message", `
const body = $json.body || $json;
let phone = '', name = '', text = '', msgType = 'unknown';
const media = null;
try {
  const entry = body.entry && body.entry[0];
  const change = entry && entry.changes && entry.changes[0];
  const value = change && change.value;
  const msg = value && value.messages && value.messages[0];
  if (msg) {
    phone = msg.from || '';
    msgType = msg.type || 'text';
    const contact = value.contacts && value.contacts[0];
    name = (contact && contact.profile && contact.profile.name) || 'Customer';
    if (msgType === 'text') text = msg.text && msg.text.body || '';
    else if (msgType === 'image') { media = { id: msg.image && msg.image.id, mime: msg.image && msg.image.mime_type, filename: '' }; }
    else if (msgType === 'document') { media = { id: msg.document && msg.document.id, mime: msg.document && msg.document.mime_type, filename: msg.document && msg.document.filename }; }
    else if (msgType === 'audio' || msgType === 'video' || msgType === 'sticker') { media = { id: (msg[msgType] || {}).id, mime: (msg[msgType] || {}).mime_type, filename: '' }; }
    else if (msgType === 'button') { text = (msg.button || {}).text || ''; }
    else if (msgType === 'interactive') {
      const it = msg.interactive || {};
      text = (it.button_reply && it.button_reply.title) || (it.list_reply && it.list_reply.title) || '';
    }
  }
} catch (e) {}
return [{ json: { phone: phone || 'unknown', name: name || 'Customer', message: text, media, msg_type: media ? 'media' : 'text', is_media: !!media, wa_id: $json.body ? 'meta' : 'test' } }];`));
nodes.push(dtInsert("Log Incoming Msg", "message_log", {
  phone: "={{ $json.phone }}",
  direction: "IN",
  message_type: "={{ $json.msg_type }}",
  body: "={{ ($json.message || ($json.media ? 'media:' + $json.media.id : '')).slice(0, 1000) }}",
  wa_message_id: "",
  status: "RECEIVED",
  created_at: "={{ $now.toISO() }}"
}));
nodes.push(dtGet("Get Conv State", "conversation_state", "phone", "={{ $('Normalize Message').first().json.phone }}"));
nodes.push(dtGet("Get Admin No", "system_config", "config_key", "=ADMIN_WHATSAPP_NUMBER"));
nodes.push(dtGet("Get Phone ID", "system_config", "config_key", "=WHATSAPP_PHONE_NUMBER_ID"));
nodes.push(dtGet("Get WA Token", "system_config", "config_key", "=WHATSAPP_ACCESS_TOKEN"));
nodes.push(code("Route Decision", `
const n = $('Normalize Message').first().json;
const state = $('Get Conv State').first().json || {};
const adminRow = $('Get Admin No').first().json || {};
const admin = adminRow.config_value || '';
const phone = n.phone;
const isAdmin = admin !== 'SET_ADMIN_NUMBER' && admin && phone === admin;
let ctx = {};
try { ctx = JSON.parse(state.context_data || '{}'); } catch (e) {}
const handoff = (state.handoff_active || 'FALSE') === 'TRUE';
const st = state.state || '';
const up = String(n.message || '').toUpperCase();

let route = 'ai';
if (isAdmin) route = 'operator_cmd';
else if (handoff) route = 'handoff_fwd';
else if (n.is_media) route = 'media';
else if (st === 'FIELDS') route = 'fields';
else if (st === 'DOCS') route = 'docs_text';
else if (st === 'PAYMENT') route = 'payment_wait';
else if (st === 'NEW' && ctx.pending_service && /^(CONFIRM|CONFIRM KARO|HAAN|HAANJI|YES|OK|OKAY|THEEK|THIK|SAHI|PAKKA|1)\\b/.test(up)) route = 'start_service';
return [{ json: { route, phone, name: n.name, message: n.message, media: n.media, state: st, pending_service: ctx.pending_service || '' } }];`));

nodes.push({
  parameters: {
    rules: {
      values: [
        ["operator_cmd", "Operator Commands"], ["handoff_fwd", "Handoff Forward"], ["media", "Media Intake"],
        ["fields", "Field Loop"], ["docs_text", "Docs Text"], ["payment_wait", "Payment Wait"],
        ["start_service", "Start Service"], ["ai", "AI Intent"]
      ].map(([key, label], i) => ({
        conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "rr" + i, leftValue: "={{ $json.route }}", rightValue: key, operator: { type: "string", operation: "equals" } }], combinator: "and" },
        renameOutput: true, outputKey: key
      }))
    },
    options: { fallbackOutput: "extra", renameFallbackOutput: "ai2" }
  },
  name: "Route", type: "n8n-nodes-base.switch", typeVersion: 3.2, position: [0, 0]
});

// ---- operator_cmd (0) ----
nodes.push(exwf("Run Operator Assistant", WF[17], {
  parameters: { source: "database", workflowId: WF[17],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "={{ $('Route Decision').first().json.message }}"
    } } }
}));
nodes.push(code("BR Operator", `
const r = $json;
return [{ json: { reply: r.reply || 'Command process ho gaya.', phone: $('Normalize Message').first().json.phone } }];`));

// ---- handoff_fwd (1) ----
nodes.push(exwf("Run Handoff Forward", WF[22], {
  parameters: { source: "database", workflowId: WF[22],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      mode: "customer_message",
      message: "={{ $('Route Decision').first().json.message }}"
    } } }
}));
nodes.push(code("BR Handoff", `
const r = $json;
return [{ json: { reply: r.reply || 'Operator ko forward ho gaya.', phone: $('Normalize Message').first().json.phone } }];`));

// ---- media (2) ----
nodes.push(exwf("Run Doc Collector (Media)", WF[8], {
  parameters: { source: "database", workflowId: WF[8],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "",
      media: "={{ JSON.stringify($('Normalize Message').first().json.media || {}) }}"
    } } }
}));
nodes.push(code("BR Media", `
const r = $json;
return [{ json: { reply: r.reply || 'Document process nahi hua. Dobara try karein ya HUMAN likhein.', phone: $('Normalize Message').first().json.phone } }];`));

// ---- fields (3) + payment_wait (5) + docs? all go to CSC 06 ----
nodes.push(exwf("Run Field Collector", WF[6], {
  parameters: { source: "database", workflowId: WF[6],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "={{ $('Route Decision').first().json.message }}",
      service_id: "={{ $('Get Conv State').first().json.service_id || '' }}"
    } } }
}));
nodes.push(code("BR Fields", `
const r = $json;
return [{ json: { reply: r.reply || 'Kuch galat ho gaya. Dobara try karein ya HUMAN likhein.', phone: $('Normalize Message').first().json.phone } }];`));

// ---- docs_text (4) ----
nodes.push(exwf("Run Doc Collector (Text)", WF[8], {
  parameters: { source: "database", workflowId: WF[8],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "={{ $('Route Decision').first().json.message }}",
      media: "={}"
    } } }
}));
nodes.push(code("BR Docs Text", `
const r = $json;
return [{ json: { reply: r.reply || 'Documents ka status check ho gaya.', phone: $('Normalize Message').first().json.phone } }];`));

// ---- start_service (6): CONFIRM path ----
nodes.push(exwf("Run Profile Engine", WF[4], {
  parameters: { source: "database", workflowId: WF[4],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      consent_given: true
    } } }
}));
nodes.push(exwf("Start Field Collection", WF[6], {
  parameters: { source: "database", workflowId: WF[6],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "={{ $('Route Decision').first().json.message }}",
      service_id: "={{ $('Route Decision').first().json.pending_service }}"
    } } }
}));
nodes.push(code("BR Start", `
const r = $json;
return [{ json: { reply: r.reply || 'Profile ban gaya. Aage badhte hain!', phone: $('Route Decision').first().json.phone } }];`));

// ---- ai (7 + fallback ai2) ----
nodes.push(exwf("AI Intent (CSC 02)", WF[2], {
  parameters: { source: "database", workflowId: WF[2],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "={{ $('Route Decision').first().json.message }}"
    } } }
}));
nodes.push(ifNode("Intent Status?", [eq("={{ $json.intent }}", "STATUS_CHECK")]));
nodes.push(exwf("Run Status Engine", WF[19], {
  parameters: { source: "database", workflowId: WF[19],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "={{ $('Route Decision').first().json.message }}"
    } } }
}));
nodes.push(code("BR Status", `
const r = $json;
return [{ json: { reply: r.reply || 'Status nahi mila.', phone: $('Route Decision').first().json.phone } }];`));
nodes.push(ifNode("Intent Human?", [eq("={{ $('AI Intent (CSC 02)').first().json.intent }}", "HUMAN_AGENT")]));
nodes.push(exwf("Run Handoff Takeover", WF[22], {
  parameters: { source: "database", workflowId: WF[22],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      mode: "takeover",
      message: "={{ $('Route Decision').first().json.message }}"
    } } }
}));
nodes.push(code("BR Human", `
const r = $json;
return [{ json: { reply: r.reply || 'Operator se connect ho rahe hain.', phone: $('Route Decision').first().json.phone } }];`));
nodes.push(ifNode("Service Matched?", [
  notEq("={{ $('AI Intent (CSC 02)').first().json.service_id }}", "UNKNOWN"),
  { leftValue: "={{ $('AI Intent (CSC 02)').first().json.confidence }}", rightValue: "0.6", operator: { type: "number", operation: "gte" } }
], "and"));
nodes.push(dtUpsert("Save Pending Service", "conversation_state", "phone", "={{ $('Route Decision').first().json.phone }}", {
  phone: "={{ $('Route Decision').first().json.phone }}",
  state: "NEW",
  service_id: "={{ $('AI Intent (CSC 02)').first().json.service_id }}",
  context_data: "={{ JSON.stringify({ pending_service: $('AI Intent (CSC 02)').first().json.service_id }) }}",
  handoff_active: "FALSE",
  updated_at: "={{ $now.toISO() }}"
}));
nodes.push(code("BR Service Confirm", `
const r = $('AI Intent (CSC 02)').first().json;
return [{ json: { reply: r.reply, phone: $('Route Decision').first().json.phone } }];`));
// unmatched: UNKNOWN/GREETING/GENERAL -> research
nodes.push(exwf("Run Researcher", WF[25], {
  parameters: { source: "database", workflowId: WF[25],
    workflowInputs: { mappingMode: "defineBelow", value: {
      phone: "={{ $('Route Decision').first().json.phone }}",
      name: "={{ $('Route Decision').first().json.name }}",
      message: "={{ $('Route Decision').first().json.message }}"
    } } }
}));
nodes.push(code("BR Research", `
const r = $json;
return [{ json: { reply: r.reply || 'Service list bhej raha hoon...', phone: $('Route Decision').first().json.phone } }];`));

// ---- send ----
nodes.push(code("Build Send Payload", `
const pid = $('Get Phone ID').first().json.config_value || '';
const token = $('Get WA Token').first().json.config_value || '';
const ready = pid && token && !pid.startsWith('SET_') && !token.startsWith('SET_');
return [{ json: { ready, pid, token, to: $json.phone, reply: String($json.reply || '').slice(0, 4096) } }];`));
nodes.push(http("Send WhatsApp Reply", {
  method: "POST",
  url: "=https://graph.facebook.com/v21.0/{{ $('Build Send Payload').first().json.pid }}/messages",
  sendHeaders: true,
  headerParameters: { parameters: [
    { name: "Authorization", value: "=Bearer {{ $('Build Send Payload').first().json.token }}" },
    { name: "Content-Type", value: "application/json" }
  ] },
  sendBody: true, specifyBody: "json",
  jsonBody: `={{ JSON.stringify({ messaging_product: 'whatsapp', to: $('Build Send Payload').first().json.to, type: 'text', text: { body: $('Build Send Payload').first().json.reply } }) }}`,
  options: { response: { response: { neverError: true } }, timeout: 30000 }
}, { onError: "continueRegularOutput", alwaysOutputData: true }));
nodes.push(respond("Respond 200", { respondWith: "json", responseBody: "={{ JSON.stringify({ ok: true, sent_via: $('Build Send Payload').first().json.ready ? 'meta' : 'MOCK(creds-not-set)', reply: $('Build Send Payload').first().json.reply }) }}" }));

// ---- connections ----
mergeConn(C, link("WhatsApp Webhook", "Normalize Message"));
mergeConn(C, link("WhatsApp Verify", "Return Challenge"));
mergeConn(C, link("Normalize Message", "Log Incoming Msg"));
mergeConn(C, link("Log Incoming Msg", "Get Conv State"));
mergeConn(C, link("Get Conv State", "Get Admin No"));
mergeConn(C, link("Get Admin No", "Get Phone ID"));
mergeConn(C, link("Get Phone ID", "Get WA Token"));
mergeConn(C, link("Get WA Token", "Route Decision"));
mergeConn(C, link("Route Decision", "Route"));
mergeConn(C, { "Route": { main: [
  [{ node: "Run Operator Assistant", type: "main", index: 0 }],
  [{ node: "Run Handoff Forward", type: "main", index: 0 }],
  [{ node: "Run Doc Collector (Media)", type: "main", index: 0 }],
  [{ node: "Run Field Collector", type: "main", index: 0 }],
  [{ node: "Run Doc Collector (Text)", type: "main", index: 0 }],
  [{ node: "Run Field Collector", type: "main", index: 0 }],
  [{ node: "Run Profile Engine", type: "main", index: 0 }],
  [{ node: "AI Intent (CSC 02)", type: "main", index: 0 }],
  [{ node: "AI Intent (CSC 02)", type: "main", index: 0 }]
] } });

mergeConn(C, link("Run Operator Assistant", "BR Operator"));
mergeConn(C, link("Run Handoff Forward", "BR Handoff"));
mergeConn(C, link("Run Doc Collector (Media)", "BR Media"));
mergeConn(C, link("Run Field Collector", "BR Fields"));
mergeConn(C, link("Run Doc Collector (Text)", "BR Docs Text"));
mergeConn(C, link("Run Profile Engine", "Start Field Collection"));
mergeConn(C, link("Start Field Collection", "BR Start"));

mergeConn(C, link("AI Intent (CSC 02)", "Intent Status?"));
mergeConn(C, { "Intent Status?": { main: [[{ node: "Run Status Engine", type: "main", index: 0 }], [{ node: "Intent Human?", type: "main", index: 0 }]] } });
mergeConn(C, link("Run Status Engine", "BR Status"));
mergeConn(C, { "Intent Human?": { main: [[{ node: "Run Handoff Takeover", type: "main", index: 0 }], [{ node: "Service Matched?", type: "main", index: 0 }]] } });
mergeConn(C, link("Run Handoff Takeover", "BR Human"));
mergeConn(C, { "Service Matched?": { main: [[{ node: "Save Pending Service", type: "main", index: 0 }], [{ node: "Run Researcher", type: "main", index: 0 }]] } });
mergeConn(C, link("Save Pending Service", "BR Service Confirm"));
mergeConn(C, link("Run Researcher", "BR Research"));

  const brSend = "Build Send Payload";
  for (const br of ["BR Operator", "BR Handoff", "BR Media", "BR Fields", "BR Docs Text", "BR Start", "BR Status", "BR Human", "BR Service Confirm", "BR Research"]) {
    mergeConn(C, link(br, brSend));
  }
mergeConn(C, link("Build Send Payload", "Send WhatsApp Reply"));
mergeConn(C, link("Send WhatsApp Reply", "Respond 200"));

writeJson(DIR + "csc-01-v2.json", buildWorkflow(WF[1], "CSC 01 - WhatsApp Main Router v2", nodes, C));
console.log("BUILD CSC 01 v2 DONE");
