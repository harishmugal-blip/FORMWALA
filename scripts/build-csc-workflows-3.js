// CSC 02 - AI Intent Engine (OpenRouter Edition) - works from HK sandbox AND India
import { writeFileSync } from "node:fs";

const OR_CRED = "5356ff4e-f739-4f0a-80dd-48fc3b8018b2"; // openRouterApi credential id
const WF_C = "3c5c0001-0000-4000-8000-000000000003";
const WF_B = "3c5c0003-0000-4000-8000-000000000002";

const MODEL = "inclusionai/ling-3.0-flash-sante:free";

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

const buildPromptCode = `// Build classification prompt with live catalog (spec section 2)
const catalog = $json.catalog || [];
const t = $('Trigger').first().json;
const message = (t.message || '').toString().slice(0, 500);
const list = catalog.map(s => s.service_id + ' | ' + s.service_name).join('\\n');

const prompt = 'You are the intent classifier of CSC Smart Seva, an Indian government services (CSC) WhatsApp assistant.\\n'
+ 'Customer message: "' + message + '"\\n\\n'
+ 'Available services:\\n' + list + '\\n\\n'
+ 'Classify the request. Respond ONLY with strict JSON (no markdown, no explanation, no thinking):\\n'
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
      id: "b-or", name: "OpenRouter Model", type: "@n8n/n8n-nodes-langchain.lmChatOpenRouter", typeVersion: 1, position: [800, 500],
      parameters: { modelName: MODEL, options: { temperature: 0.1, maxTokens: 800 } },
      credentials: { openRouterApi: { id: OR_CRED, name: "OpenRouter CSC" } }
    },
    { id: "b-val", name: "Validate & Reply", type: "n8n-nodes-base.code", typeVersion: 2, position: [1080, 300], parameters: { mode: "runOnceForAllItems", jsCode: validateReplyCode } }
  ],
  connections: mergeConn(
    wrap("Trigger", "Get Service Catalog"),
    wrap("Get Service Catalog", "Build Prompt"),
    wrap("Build Prompt", "AI Intent Detection"),
    wrap("AI Intent Detection", "Validate & Reply"),
    aiConn("OpenRouter Model", "AI Intent Detection")
  )
};

writeFileSync("/home/z/my-project/scripts/csc-wf-B-intent-v2.json", JSON.stringify(wfB, null, 1));
console.log("✅ WF B v2 built (OpenRouter edition)");
