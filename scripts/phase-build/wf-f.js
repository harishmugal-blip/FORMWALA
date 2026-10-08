// Build CSC 22 Human Handoff, CSC 23 Admin Dashboard, CSC 24 Audit Logger, CSC 25 Unknown Service Researcher
import { buildWorkflow, writeJson, triggerSub, code, dtGet, dtInsert, dtUpdate, dtUpsert, ifNode, eq, notEmpty, isEmpty, exwf, link, mergeConn, webhookNode, respond, http, scheduleNode, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";

// ============ CSC 22 - HUMAN HANDOFF ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(code("Route Mode", `
const j = $json;
return [{ json: { mode: j.mode || 'takeover', phone: j.phone, name: j.name || 'Customer', message: j.message || '' } }];`));
  nodes.push({
    parameters: {
      rules: {
        values: [
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "m0", leftValue: "={{ $json.mode }}", rightValue: "takeover", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "takeover" },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "m1", leftValue: "={{ $json.mode }}", rightValue: "customer_message", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "fwd" }
        ]
      },
      options: { fallbackOutput: "extra", renameFallbackOutput: "resume" }
    },
    name: "Route Mode?", type: "n8n-nodes-base.switch", typeVersion: 3.2, position: [0, 0]
  });
  // takeover
  nodes.push(dtUpsert("Set Handoff State", "conversation_state", "phone", "={{ $('Route Mode').first().json.phone }}", {
    phone: "={{ $('Route Mode').first().json.phone }}",
    handoff_active: "TRUE",
    updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtInsert("Queue Handoff", "handoff_queue", {
    phone: "={{ $('Route Mode').first().json.phone }}",
    name: "={{ $('Route Mode').first().json.name }}",
    reason: "={{ $('Route Mode').first().json.message.slice(0, 200) }}",
    status: "WAITING",
    taken_by: "",
    created_at: "={{ $now.toISO() }}",
    resolved_at: ""
  }));
  nodes.push(dtGet("Get Admin2", "system_config", "config_key", "=ADMIN_WHATSAPP_NUMBER"));
  nodes.push(exwf("Alert Operator", WF[20], {
    parameters: { source: "database", workflowId: WF[20],
      workflowInputs: { mappingMode: "defineBelow", value: {
        action: "send_whatsapp",
        phone: "={{ $json.config_value || '' }}",
        message: "=\ud83d\udea8 *HUMAN HANDOFF REQUEST*\n\nCustomer: {{ $('Route Mode').first().json.name }} ({{ $('Route Mode').first().json.phone }})\nMessage: {{ $('Route Mode').first().json.message.slice(0, 300) }}\n\nBot is PAUSED for this customer. Aap khud WhatsApp par reply kar sakte hain.\nBot resume karne ke liye: RESUME {{ $('Route Mode').first().json.phone }}",
        template: "HANDOFF_ALERT",
        related_id: "={{ $('Route Mode').first().json.phone }}"
      } } }
  }, { onError: "continueRegularOutput" }));
  nodes.push(code("Takeover Reply", `
const p = $('Route Mode').first().json;
return [{ json: { reply: '\ud83d\udc64\u200d\ud83d\udcbc Aapki chat CSC operator ko transfer kar di gayi hai.\nBot abhi PAUSE hai - operator khud aapse baat karega.\nKripya thodi der pratiyeksha karein. \ud83d\ude4f', phone: p.phone } }];`));
  // customer_message (forward while handoff active)
  nodes.push(dtGet("Get Admin3", "system_config", "config_key", "=ADMIN_WHATSAPP_NUMBER"));
  nodes.push(exwf("Forward To Operator", WF[20], {
    parameters: { source: "database", workflowId: WF[20],
      workflowInputs: { mappingMode: "defineBelow", value: {
        action: "send_whatsapp",
        phone: "={{ $json.config_value || '' }}",
        message: "=\ud83d\udce8 *Customer message (handoff mode)*\n\n{{ $('Route Mode').first().json.name }} ({{ $('Route Mode').first().json.phone }}):\n{{ $('Route Mode').first().json.message.slice(0, 500) }}",
        template: "HANDOFF_FORWARD",
        related_id: "={{ $('Route Mode').first().json.phone }}"
      } } }
  }, { onError: "continueRegularOutput" }));
  nodes.push(code("Fwd Reply", `
const p = $('Route Mode').first().json;
return [{ json: { reply: '\ud83d\udce4 Aapka message operator ko forward kar diya gaya hai. Wo jaldi reply karenge.', phone: p.phone } }];`));
  // resume
  nodes.push(dtUpsert("Clear Handoff State", "conversation_state", "phone", "={{ $('Route Mode').first().json.phone }}", {
    phone: "={{ $('Route Mode').first().json.phone }}",
    handoff_active: "FALSE",
    updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtUpdate("Resolve Queue", "handoff_queue", "phone", "={{ $('Route Mode').first().json.phone }}", {
    status: "RESOLVED",
    resolved_at: "={{ $now.toISO() }}"
  }));
  nodes.push(code("Resume Output", `
return [{ json: { ok: true, phone: $('Route Mode').first().json.phone, handoff: false } }];`));
  mergeConn(C, link("Trigger", "Route Mode"));
  mergeConn(C, link("Route Mode", "Route Mode?"));
  mergeConn(C, { "Route Mode?": { main: [
    [{ node: "Set Handoff State", type: "main", index: 0 }],
    [{ node: "Get Admin3", type: "main", index: 0 }],
    [{ node: "Clear Handoff State", type: "main", index: 0 }]
  ] } });
  mergeConn(C, link("Set Handoff State", "Queue Handoff"));
  mergeConn(C, link("Queue Handoff", "Get Admin2"));
  mergeConn(C, link("Get Admin2", "Alert Operator"));
  mergeConn(C, link("Alert Operator", "Takeover Reply"));
  mergeConn(C, link("Get Admin3", "Forward To Operator"));
  mergeConn(C, link("Forward To Operator", "Fwd Reply"));
  mergeConn(C, link("Clear Handoff State", "Resolve Queue"));
  mergeConn(C, link("Resolve Queue", "Resume Output"));
  writeJson(DIR + "csc-22.json", buildWorkflow(WF[22], "CSC 22 - Human Handoff (Bot Pause/Resume)", nodes, C));
}

// ============ CSC 23 - ADMIN DASHBOARD (HTTP API + daily digest) ============
{
  const nodes = [];
  const C = {};
  nodes.push(webhookNode("Admin API", "csc-admin", "GET"));
  nodes.push(scheduleNode("Daily Digest 8PM", { field: "cronExpression", expression: "0 20 * * *" }));
  nodes.push(dtGet("All Apps", "applications", "application_id", "=%%all%%", { returnAll: true }));
  // no-op get-all trick: filter on application_id != impossible value with returnAll gets everything? get requires eq match.
  // Better: use "rowExists"? Simplest: get all via operation get + matchType allConditions on status eq? status varies.
  // Use anyConditions matchType with two conditions on same key? Instead: query by created_at notEmpty isn't supported in filters.
  // Practical: fetch by status for main buckets.
  nodes.pop();
  const getAllApps = {
    parameters: {
      resource: "row", operation: "get",
      dataTableId: { __rl: true, mode: "name", value: "applications" },
      matchType: "anyConditions",
      filters: { conditions: [
        { keyName: "status", condition: "eq", keyValue: "DRAFT" },
        { keyName: "status", condition: "eq", keyValue: "DOCS" },
        { keyName: "status", condition: "eq", keyValue: "PAID" },
        { keyName: "status", condition: "eq", keyValue: "SUBMITTED" },
        { keyName: "status", condition: "eq", keyValue: "ISSUE_REPORTED" },
        { keyName: "status", condition: "eq", keyValue: "DONE" },
        { keyName: "status", condition: "eq", keyValue: "PAYMENT" }
      ] },
      returnAll: true
    },
    name: "All Apps", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: [0, 0]
  };
  nodes.push(getAllApps);
  nodes.push(dtGet("All Payments", "payments", "status", "=PAID", { returnAll: true }));
  nodes.push(code("Aggregate Stats", `
let apps = [], pays = [];
try { apps = $('All Apps').all().map(i => i.json); } catch (e) {}
try { pays = $('All Payments').all().map(i => i.json); } catch (e) {}
const byStatus = {};
for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const todayApps = apps.filter(a => String(a.created_at || '').slice(0, 10) === today).length;
const revenue = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
const todayRevenue = pays.filter(p => String(p.paid_at || '').slice(0, 10) === today).reduce((s, p) => s + Number(p.amount || 0), 0);
const stats = { total_applications: apps.length, today_applications: todayApps, by_status: byStatus, total_revenue: revenue, today_revenue: todayRevenue, generated_at: new Date().toISOString() };
return [{ json: { stats, mode: 'aggregate' } }];`));
  nodes.push(respond("Respond Stats", { respondWith: "json", responseBody: "={{ JSON.stringify($json.stats) }}" }, { onError: "continueRegularOutput" }));
  // digest path: build message + send via CSC 20 (schedule path joins after aggregate? respondToWebhook only in webhook path)
  nodes.push(code("Build Digest", `
const s = $json.stats;
let msg = '\ud83d\udcca *CSC Daily Digest* (' + new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) + ')\\n\\n';
msg += '\ud83d\udccb Total applications: ' + s.total_applications + '\\n';
msg += '\ud83c\udf1f Aaj ke applications: ' + s.today_applications + '\\n';
msg += '\ud83d\udcb0 Aaj ki revenue: Rs ' + s.today_revenue + '\\n';
msg += '\ud83d\udcb0 Total revenue: Rs ' + s.total_revenue + '\\n\\n';
msg += 'Status breakdown:\\n';
for (const [k, v] of Object.entries(s.by_status || {})) msg += '  ' + k + ': ' + v + '\\n';
return [{ json: { phone: 'ADMIN', message: msg, template: 'DAILY_DIGEST', related_id: 'digest' } }];`));
  nodes.push(dtGet("Get Admin4", "system_config", "config_key", "=ADMIN_WHATSAPP_NUMBER"));
  nodes.push(exwf("Send Digest", WF[20], {
    parameters: { source: "database", workflowId: WF[20],
      workflowInputs: { mappingMode: "defineBelow", value: {
        action: "send_whatsapp",
        phone: "={{ $json.config_value || '' }}",
        message: "={{ $('Build Digest').first().json.message }}",
        template: "DAILY_DIGEST",
        related_id: "digest"
      } } }
  }, { onError: "continueRegularOutput" }));
  mergeConn(C, link("Admin API", "All Apps"));
  mergeConn(C, link("All Apps", "All Payments"));
  mergeConn(C, link("All Payments", "Aggregate Stats"));
  mergeConn(C, link("Aggregate Stats", "Respond Stats"));
  mergeConn(C, link("Aggregate Stats", "Build Digest"));
  mergeConn(C, link("Build Digest", "Get Admin4"));
  mergeConn(C, link("Get Admin4", "Send Digest"));
  writeJson(DIR + "csc-23.json", buildWorkflow(WF[23], "CSC 23 - Admin Dashboard (Stats API + Daily Digest)", nodes, C));
}

// ============ CSC 24 - AUDIT LOGGER ============
{
  const nodes = [
    triggerSub("Trigger"),
    code("Prepare Audit", `
const j = $json;
return [{ json: {
  event_id: 'AUD' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
  event_type: j.event_type || 'GENERIC',
  actor: j.actor || 'SYSTEM',
  phone: j.phone || '',
  application_id: j.application_id || '',
  payload: typeof j.payload === 'string' ? j.payload : JSON.stringify(j.payload || {}),
  is_consent: j.event_type === 'LOG_CONSENT',
  consent_type: j.consent_type || 'SERVICE_REQUEST',
  consent_text: j.consent_text || 'Main CSC Smart Seva ko apni details process karne ki permission deti/deta hoon.',
  granted: j.granted || 'TRUE',
  source: j.source || 'WHATSAPP'
} }];`),
    dtInsert("Write Audit", "audit_log", {
      event_id: "={{ $json.event_id }}",
      event_type: "={{ $json.event_type }}",
      actor: "={{ $json.actor }}",
      phone: "={{ $json.phone }}",
      application_id: "={{ $json.application_id }}",
      payload: "={{ $json.payload }}",
      created_at: "={{ $now.toISO() }}"
    }),
    ifNode("Consent?", [eq("={{ $json.is_consent }}", "true")]),
    dtInsert("Write Consent", "consent_log", {
      phone: "={{ $('Prepare Audit').first().json.phone }}",
      consent_type: "={{ $('Prepare Audit').first().json.consent_type }}",
      consent_text: "={{ $('Prepare Audit').first().json.consent_text }}",
      granted: "={{ $('Prepare Audit').first().json.granted }}",
      source: "={{ $('Prepare Audit').first().json.source }}",
      created_at: "={{ $now.toISO() }}"
    }),
    code("Audit Output", `
return [{ json: { ok: true, event_id: $('Prepare Audit').first().json.event_id } }];`)
  ];
  const C = {};
  mergeConn(C, link("Trigger", "Prepare Audit"));
  mergeConn(C, link("Prepare Audit", "Write Audit"));
  mergeConn(C, link("Write Audit", "Consent?"));
  mergeConn(C, { "Consent?": { main: [[{ node: "Write Consent", type: "main", index: 0 }], [{ node: "Audit Output", type: "main", index: 0 }]] } });
  mergeConn(C, link("Write Consent", "Audit Output"));
  writeJson(DIR + "csc-24.json", buildWorkflow(WF[24], "CSC 24 - Audit Logger (Compliance Trail)", nodes, C));
}

// ============ CSC 25 - UNKNOWN SERVICE RESEARCHER ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(code("Build Research Prompt", `
const j = $json;
const msg = String(j.message || '').slice(0, 400);
const prompt = 'User ne India ke CSC (Common Service Center) WhatsApp assistant se ye request ki: "' + msg + '"\\n\\n'
+ 'Ye request 14 standard services (PAN, ITR, GST, income/caste/domicile certificate, Voter ID, Ayushman, E-Shram, scholarship, govt job form) mein fit nahi hui.\\n'
+ 'Analyze karo: ye kaunsi government/private service ho sakti hai? CSC ecosystem mein available hai ya nahi?\\n\\n'
+ 'Sirf strict JSON return karo (no markdown):\\n'
+ '{"detected_service":"<short name>","likely_available":"YES|NO|MAYBE","how_to_do":"<1 line Hinglish guidance>","confidence":0.0}';
return [{ json: { prompt, phone: j.phone, message: msg } }];`));
  nodes.push(http("Ask AI", {
    method: "POST",
    url: "https://openrouter.ai/api/v1/chat/completions",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "openRouterApi",
    sendBody: true, specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ model: 'inclusionai/ling-3.0-flash-sante:free', max_tokens: 700, temperature: 0.3, messages: [{ role: 'user', content: $json.prompt }] }) }}`,
    options: { response: { response: { neverError: true } }, timeout: 90000 }
  }, { onError: "continueRegularOutput" }));
  nodes.push(code("Parse Research", `
const r = $json;
const t = $('Build Research Prompt').first().json;
let ai = { detected_service: 'unknown', likely_available: 'MAYBE', how_to_do: '', confidence: 0 };
try {
  const raw = (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content || '').replace(/\`\`\`json|\`\`\`/g, '').trim();
  const m = raw.match(/\\{[\\s\\S]*\\}/);
  if (m) ai = { ...ai, ...JSON.parse(m[0]) };
} catch (e) {}
let msg = '\ud83e\udd14 Aapki request ("' + t.message.slice(0, 80) + '") humari 14 services mein nahi hai.\\n\\n';
if (ai.detected_service && ai.detected_service !== 'unknown') {
  msg += '\ud83d\udd0d AI analysis: "' + ai.detected_service + '" lag rahi hai.\\n';
  msg += 'Available: ' + ai.likely_available + '\\n';
  if (ai.how_to_do) msg += '\ud83d\udca1 ' + ai.how_to_do + '\\n\\n';
}
msg += 'Aapki request team ko note kar li gayi hai - wo is service add karne ke baare mein sochenge.\\n\\n';
msg += 'Filhaal ye services available hain: PAN Card, ITR Filing, GST Reg, Income/Caste/Domicile Certificate, Voter ID, Ayushman, E-Shram, Scholarship, Govt Job Form.\\nInme se koi chahiye to naam type karein. Ya HUMAN likhkar operator se baat karein.';
return [{ json: { phone: t.phone, reply: msg, ai, user_message: t.message, research_id: 'RES' + Date.now().toString(36).toUpperCase() } }];`));
  nodes.push(dtInsert("Save Research", "service_research", {
    research_id: "={{ $json.research_id }}",
    phone: "={{ $json.phone }}",
    user_message: "={{ $json.user_message }}",
    ai_analysis: "={{ JSON.stringify($json.ai) }}",
    proposed_service: "={{ $json.ai.detected_service || 'unknown' }}",
    status: "NEW",
    created_at: "={{ $now.toISO() }}"
  }));
  nodes.push(exwf("Audit Research", WF[24], {
    parameters: { source: "database", workflowId: WF[24],
      workflowInputs: { mappingMode: "defineBelow", value: {
        event_type: "UNKNOWN_SERVICE_RESEARCH",
        actor: "AI",
        phone: "={{ $json.phone }}",
        payload: "={{ JSON.stringify({ message: $json.user_message, detected: $json.ai.detected_service }) }}"
      } } }
  }, { onError: "continueRegularOutput" }));
  mergeConn(C, link("Trigger", "Build Research Prompt"));
  mergeConn(C, link("Build Research Prompt", "Ask AI"));
  mergeConn(C, link("Ask AI", "Parse Research"));
  mergeConn(C, link("Parse Research", "Save Research"));
  mergeConn(C, link("Save Research", "Audit Research"));
  writeJson(DIR + "csc-25.json", buildWorkflow(WF[25], "CSC 25 - Unknown Service Researcher", nodes, C));
}

console.log("BUILD GROUP 5 DONE (22, 23, 24, 25)");
