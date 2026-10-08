// CSC Phase 1 - Part 2: AI Intent Engine (B) + WhatsApp Main Router (A)
import { writeFileSync } from "node:fs";

const CRED_ID = "f480f6ea-d1b8-420c-980c-f0b6ad8ba865";
const WF_C = "3c5c0001-0000-4000-8000-000000000003";
const WF_B = "3c5c0003-0000-4000-8000-000000000002";
const WF_A = "3c5c0004-0000-4000-8000-000000000001";

const conn = (node, type = "main", index = 0) => ({ node, type, index });
const wrap = (from, to, type = "main") => ({ [from]: { [type]: [[conn(to, type)]] } });
const mergeConn = (obj, add) => {
  for (const [k, v] of Object.entries(add)) {
    if (!obj[k]) obj[k] = v;
    else for (const t of Object.keys(v)) obj[k][t] = [...(obj[k][t] || []), ...v[t]];
  }
  return obj;
};
const aiConn = (from, to) => ({ [from]: { ai_languageModel: [[conn(to, "ai_languageModel")]] } });

// ============================================================
// WF B: AI INTENT ENGINE
// ============================================================
const buildPromptCode = `// Build classification prompt with live catalog (spec section 2)
const catalog = $json.catalog || [];
const t = $('Trigger').first().json;
const message = (t.message || '').toString().slice(0, 500);
const list = catalog.map(s => s.service_id + ' | ' + s.service_name).join('\\n');

const prompt = 'You are the intent classifier of CSC Smart Seva, an Indian government services (CSC) WhatsApp assistant.\\n'
+ 'Customer message: "' + message + '"\\n\\n'
+ 'Available services:\\n' + list + '\\n\\n'
+ 'Classify the request. Respond ONLY with strict JSON (no markdown, no explanation):\\n'
+ '{"service":"<SERVICE_ID or UNKNOWN>","intent":"NEW_APPLICATION|STATUS_CHECK|HUMAN_AGENT|GREETING|GENERAL_QUESTION","confidence":0.0}\\n\\n'
+ 'Rules:\\n'
+ '- NEVER invent a service. If not in the list above, use UNKNOWN.\\n'
+ '- Keywords human/agent/operator/help -> intent HUMAN_AGENT.\\n'
+ '- Keywords status/track -> intent STATUS_CHECK.\\n'
+ '- Greeting only (hi/hello/namaste) -> intent GREETING, service UNKNOWN.\\n'
+ '- Confidence below 0.6 -> service UNKNOWN.\\n'
+ '- Examples: "pan card banana hai" -> PAN_CARD; "itr bharni hai" -> ITR_FILING; "gst registration" -> GST_REG; "mool niwas banwana hai" -> DOMICILE; "job ka form bharna hai" -> GOV_JOB_FORM.';

return [{ json: { prompt, phone: t.phone, name: t.name } }];`;

const validateReplyCode = `// Validate AI output + build Hinglish reply (spec sections 1, 2, 24)
const raw = ($json.text || '').replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, '').trim();
let ai;
try { ai = JSON.parse(raw); } catch (e) { ai = { service: 'UNKNOWN', intent: 'GREETING', confidence: 0 }; }

const { catalog } = $('Get Service Catalog').first().json;
const t = $('Trigger').first().json;
const phone = t.phone || '';
const name = t.name || 'Customer';

const svcList = catalog.map((s, i) => (i + 1) + '. ' + s.service_name).join('\\n');
const greeting = '\\ud83d\\ude4f Namaste ' + name + '!\\n\\nCSC Smart Seva mein aapka swagat hai.\\nAap kis service ke liye sahayata chahte hain?\\n\\n' + svcList + '\\n\\nYa apna kaam seedha type karein.';

let reply, service_id = ai.service || 'UNKNOWN', intent = ai.intent || 'GREETING', confidence = Number(ai.confidence) || 0;

if (intent === 'HUMAN_AGENT') {
  reply = '\\ud83d\\udc64\\u200d\\ud83d\\udcbc Aapki chat CSC operator ko transfer ki ja rahi hai.\\nKripya thodi der pratiyeksha karein.';
} else if (intent === 'STATUS_CHECK') {
  reply = '\\ud83d\\udccb Aapki applications jald hi yahan dikhengi.\\n(Status tracking engine Phase 9 mein enable hoga.)\\n\\nAbhi ke liye service select karein ya operator se baat karein - HUMAN likhein.';
} else if (service_id !== 'UNKNOWN' && catalog.find(s => s.service_id === service_id) && confidence >= 0.6) {
  const svc = catalog.find(s => s.service_id === service_id);
  reply = '\\u2705 Samajh gaya! Aapko \\"' + svc.service_name + '\\" chahiye.\\n\\n\\ud83d\\udcb5 Approx fee: Rs ' + svc.total_fee + ' (Govt: ' + svc.government_fee + ' + Service: ' + svc.service_charge + ' + GST: ' + svc.gst + ')\\n\\nAgar sahi hai to CONFIRM likhein, ya service badalni ho to dobara type karein.';
} else if (confidence >= 0.6 && intent === 'GENERAL_QUESTION') {
  reply = 'Aapka sawal note kar liya hai. Iski verified jaankari ke liye main aapki request CSC operator ko forward kar raha hoon.\\ud83d\\udc64\\u200d\\ud83d\\udcbc\\n\\nFilhaal available services:\\n' + svcList;
} else {
  reply = greeting;
}

return [{ json: { reply, phone, name, service_id, intent, confidence } }];`;

const wfB = {
  id: WF_B,
  name: "CSC 02 - AI Intent Engine",
  settings: { executionOrder: "v1" },
  active: false,
  pinData: {},
  nodes: [
    { id: "b-t", name: "Trigger", type: "n8n-nodes-base.executeWorkflowTrigger", typeVersion: 1, position: [200, 300], parameters: {} },
    {
      id: "b-catalog", name: "Get Service Catalog", type: "n8n-nodes-base.executeWorkflow", typeVersion: 1, position: [420, 300],
      parameters: { source: "database", workflowId: WF_C }
    },
    { id: "b-prompt", name: "Build Prompt", type: "n8n-nodes-base.code", typeVersion: 2, position: [640, 300], parameters: { mode: "runOnceForAllItems", jsCode: buildPromptCode } },
    {
      id: "b-llm", name: "AI Intent Detection", type: "@n8n/n8n-nodes-langchain.chainLlm", typeVersion: 1.4, position: [860, 300],
      parameters: { promptType: "define", text: "={{ $json.prompt }}", options: {} }
    },
    {
      id: "b-gemini", name: "Gemini Model", type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini", typeVersion: 1, position: [800, 500],
      parameters: { modelName: "models/gemini-3.8-flash", options: { temperature: 0.1 } },
      credentials: { googlePalmApi: { id: CRED_ID, name: "Google Gemini API (CSC)" } }
    },
    { id: "b-val", name: "Validate & Reply", type: "n8n-nodes-base.code", typeVersion: 2, position: [1080, 300], parameters: { mode: "runOnceForAllItems", jsCode: validateReplyCode } }
  ],
  connections: mergeConn(
    wrap("Trigger", "Get Service Catalog"),
    wrap("Get Service Catalog", "Build Prompt"),
    wrap("Build Prompt", "AI Intent Detection"),
    wrap("AI Intent Detection", "Validate & Reply"),
    aiConn("Gemini Model", "AI Intent Detection")
  )
};

// ============================================================
// WF A: WHATSAPP MAIN ROUTER
// ============================================================
const normalizeCode = `// Normalize Meta WhatsApp Cloud API payload + route (spec section 1, 19, 24)
const body = $json.body || {};
const value = (body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value) || {};
const msg = (value.messages && value.messages[0]) || null;

if (!msg) return [{ json: { route: 'IGNORE', reply: null, phone: '', name: '', text: '' } }];

const name = (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) || 'Customer';
const phone = msg.from || '';
const type = msg.type || 'unknown';

let text = '';
if (type === 'text') text = (msg.text && msg.text.body) || '';
else if (type === 'interactive') {
  const it = msg.interactive || {};
  text = (it.button_reply && it.button_reply.title) || (it.list_reply && it.list_reply.title) || '';
}

const t = text.toLowerCase().trim();
let route = 'PHASE2';
if (type === 'text' || type === 'interactive') {
  if (['human', 'agent', 'operator', 'help'].includes(t)) route = 'HUMAN';
  else if (t === 'status' || t.startsWith('status') || t === 'track') route = 'STATUS';
  else route = 'AI';
}
return [{ json: { route, phone, name, text, type } }];`;

const statusStubCode = `const t = $json;
return [{ json: { reply: '\\ud83d\\udccb ' + t.name + ', status tracking Phase 9 mein activate hoga.\\n\\nFilhaal aap operator se baat kar sakte hain - HUMAN likhein.', phone: t.phone } }];`;

const handoffStubCode = `const t = $json;
return [{ json: { reply: '\\ud83d\\udc64\\u200d\\ud83d\\udcbc Aapki chat CSC operator ko transfer ki ja rahi hai.\\nKripya thodi der pratiyeksha karein.', phone: t.phone } }];`;

const phase2StubCode = `const t = $json;
return [{ json: { reply: '\\ud83d\\udcc4 Document/media upload Phase 2 mein enable hoga.\\nFilhaal text mein apni service batayein (jaise: PAN card banana hai).', phone: t.phone } }];`;

const buildReplyCode = `// Build WhatsApp Cloud API send payload
// NOTE: Production credentials yahan ya n8n Credentials se configure karein (spec section 25)
const CONFIG = {
  graphVersion: 'v22.0',
  phoneNumberId: 'REPLACE_WITH_WABA_PHONE_NUMBER_ID',
  wabaToken: 'REPLACE_WITH_WABA_ACCESS_TOKEN'
};
const { reply, phone } = $json;
if (!reply || !phone) return [];
const payload = { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: reply } };
return [{ json: { config: CONFIG, payload } }];`;

const wfA = {
  id: WF_A,
  name: "CSC 01 - WhatsApp Main Router",
  settings: { executionOrder: "v1" },
  active: false,
  pinData: {},
  nodes: [
    { id: "a-w1", name: "WhatsApp Webhook", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [200, 300], webhookId: "wa-hook-0001", parameters: { httpMethod: "POST", path: "csc-whatsapp", responseMode: "onReceived", options: {} } },
    { id: "a-w2", name: "WhatsApp Verify", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [200, 520], webhookId: "wa-hook-0002", parameters: { httpMethod: "GET", path: "csc-whatsapp", responseMode: "responseNode", options: {} } },
    { id: "a-r1", name: "Return Challenge", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [420, 520], parameters: { respondWith: "text", responseBody: "={{ $json.query['hub.challenge'] }}", options: {} } },
    { id: "a-n", name: "Normalize Message", type: "n8n-nodes-base.code", typeVersion: 2, position: [420, 300], parameters: { mode: "runOnceForAllItems", jsCode: normalizeCode } },
    {
      id: "a-if1", name: "Route STATUS?", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [640, 300],
      parameters: {
        conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
          conditions: [{ id: "c-s", leftValue: "={{ $json.route }}", rightValue: "STATUS", operator: { type: "string", operation: "equals" } }], combinator: "and" },
        options: {}
      }
    },
    {
      id: "a-if2", name: "Route HUMAN?", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [860, 300],
      parameters: {
        conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
          conditions: [{ id: "c-h", leftValue: "={{ $json.route }}", rightValue: "HUMAN", operator: { type: "string", operation: "equals" } }], combinator: "and" },
        options: {}
      }
    },
    {
      id: "a-if3", name: "Route AI?", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [1080, 300],
      parameters: {
        conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
          conditions: [{ id: "c-a", leftValue: "={{ $json.route }}", rightValue: "AI", operator: { type: "string", operation: "equals" } }], combinator: "and" },
        options: {}
      }
    },
    { id: "a-st", name: "Status Stub", type: "n8n-nodes-base.code", typeVersion: 2, position: [1300, 100], parameters: { mode: "runOnceForAllItems", jsCode: statusStubCode } },
    { id: "a-ho", name: "Handoff Stub", type: "n8n-nodes-base.code", typeVersion: 2, position: [1300, 300], parameters: { mode: "runOnceForAllItems", jsCode: handoffStubCode } },
    { id: "a-p2", name: "Phase 2 Stub", type: "n8n-nodes-base.code", typeVersion: 2, position: [1300, 520], parameters: { mode: "runOnceForAllItems", jsCode: phase2StubCode } },
    {
      id: "a-ai", name: "AI Intent (CSC 02)", type: "n8n-nodes-base.executeWorkflow", typeVersion: 1, position: [1300, 720],
      parameters: { source: "database", workflowId: WF_B }
    },
    { id: "a-br", name: "Build WhatsApp Reply", type: "n8n-nodes-base.code", typeVersion: 2, position: [1520, 300], parameters: { mode: "runOnceForAllItems", jsCode: buildReplyCode } },
    {
      id: "a-send", name: "Send WhatsApp Message", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [1740, 300],
      parameters: {
        method: "POST",
        url: "=https://graph.facebook.com/{{ $json.config.graphVersion }}/{{ $json.config.phoneNumberId }}/messages",
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "Authorization", value: "=Bearer {{ $json.config.wabaToken }}" }] },
        sendBody: true, specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.payload) }}",
        options: {}
      }
    }
  ],
  connections: mergeConn(
    { "WhatsApp Webhook": { main: [[conn("Normalize Message")]] } },
    { "WhatsApp Verify": { main: [[conn("Return Challenge")]] } },
    wrap("Normalize Message", "Route STATUS?"),
    { "Route STATUS?": { main: [[conn("Status Stub")], [conn("Route HUMAN?")]] } },
    { "Route HUMAN?": { main: [[conn("Handoff Stub")], [conn("Route AI?")]] } },
    { "Route AI?": { main: [[conn("AI Intent (CSC 02)")], [conn("Phase 2 Stub")]] } },
    { "Status Stub": { main: [[conn("Build WhatsApp Reply")]] } },
    { "Handoff Stub": { main: [[conn("Build WhatsApp Reply")]] } },
    { "Phase 2 Stub": { main: [[conn("Build WhatsApp Reply")]] } },
    { "AI Intent (CSC 02)": { main: [[conn("Build WhatsApp Reply")]] } },
    wrap("Build WhatsApp Reply", "Send WhatsApp Message")
  )
};

writeFileSync("/home/z/my-project/scripts/csc-wf-B-intent.json", JSON.stringify(wfB, null, 1));
writeFileSync("/home/z/my-project/scripts/csc-wf-A-router.json", JSON.stringify(wfA, null, 1));
console.log("✅ WF B & A built");
