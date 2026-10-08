// Build CSC 19 Status Engine, CSC 20 Notification Engine, CSC 21 Reminder Engine
import { buildWorkflow, writeJson, triggerSub, code, dtGet, dtInsert, dtUpdate, ifNode, eq, notEmpty, exwf, link, mergeConn, scheduleNode, http, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";

// ============ CSC 19 - STATUS ENGINE ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(code("Parse Status Query", `
const j = $json;
const msg = String(j.message || '').trim();
const m = msg.toUpperCase().match(/CSC-\\d{4}-[A-Z0-9]{4,8}/);
return [{ json: { phone: j.phone, name: j.name || '', specific: m ? m[0] : '' } }];`));
  nodes.push(ifNode("Specific App?", [notEmpty("={{ $json.specific }}")]));
  nodes.push(dtGet("Get One App", "applications", "application_number", "={{ $('Parse Status Query').first().json.specific }}"));
  nodes.push(code("One App Reply", `
const STATUS_EMOJI = { DRAFT: '\\u23f3', FIELDS: '\\u270d\\ufe0f', DOCS: '\\ud83d\\udcc4', PAYMENT: '\\ud83d\\udcb0', PAID: '\\u2705', OPERATOR: '\\ud83d\\udc64\\u200d\\ud83d\\udcbc', SUBMITTED: '\\ud83c\\udf89', ISSUE_REPORTED: '\\u26a0\\ufe0f', DONE: '\\ud83c\\udfc1' };
const app = $json;
const p = $('Parse Status Query').first().json;
if (!app.application_id) return [{ json: { reply: '\\u26a0\\ufe0f Application ' + p.specific + ' nahi mila. Number check karein.', phone: p.phone } }];
const emo = STATUS_EMOJI[app.status] || '\\u2139\\ufe0f';
let msg = '\\ud83d\\udccb *' + app.application_number + '*\\n';
msg += '\\ud83d\\udee0\\ufe0f Service: ' + app.service_id + '\\n';
msg += emo + ' Status: *' + app.status + '*\\n';
if (app.total_fee) msg += '\\ud83d\\udcb0 Total: Rs ' + app.total_fee + '\\n';
msg += '\\ud83d\\udcc5 Updated: ' + String(app.updated_at || '').slice(0, 10);
return [{ json: { reply: msg, phone: p.phone } }];`));
  nodes.push(dtGet("Get My Apps", "applications", "customer_phone", "={{ $('Parse Status Query').first().json.phone }}", { returnAll: true }));
  nodes.push(code("List Apps Reply", `
const STATUS_EMOJI = { DRAFT: '\\u23f3', FIELDS: '\\u270d\\ufe0f', DOCS: '\\ud83d\\udcc4', PAYMENT: '\\ud83d\\udcb0', PAID: '\\u2705', OPERATOR: '\\ud83d\\udc64\\u200d\\ud83d\\udcbc', SUBMITTED: '\\ud83c\\udf89', ISSUE_REPORTED: '\\u26a0\\ufe0f', DONE: '\\ud83c\\udfc1' };
const p = $('Parse Status Query').first().json;
let apps = [];
try { apps = $input.all().map(i => i.json); } catch (e) {}
if (!apps.length) {
  return [{ json: { reply: '\\ud83d\\udccb Aapki koi application nahi mili.\\nNaya kaam shuru karne ke liye service ka naam type karein (jaise: PAN card banana hai).', phone: p.phone } }];
}
let msg = '\\ud83d\\udccb *Aapki Applications (' + apps.length + ')*\\n';
apps.slice(0, 5).forEach((a, i) => {
  const emo = STATUS_EMOJI[a.status] || '\\u2139\\ufe0f';
  msg += '\\n' + (i + 1) + '. ' + (a.application_number || a.application_id) + '\\n   ' + a.service_id + ' - ' + emo + ' ' + a.status;
});
if (apps.length > 5) msg += '\\n... aur ' + (apps.length - 5) + ' applications';
msg += '\\n\\nDetail ke liye: STATUS CSC-2026-XXXXXX likhein';
return [{ json: { reply: msg, phone: p.phone } }];`));
  mergeConn(C, link("Trigger", "Parse Status Query"));
  mergeConn(C, link("Parse Status Query", "Specific App?"));
  mergeConn(C, { "Specific App?": { main: [[{ node: "Get One App", type: "main", index: 0 }], [{ node: "Get My Apps", type: "main", index: 0 }]] } });
  mergeConn(C, link("Get One App", "One App Reply"));
  mergeConn(C, link("Get My Apps", "List Apps Reply"));
  writeJson(DIR + "csc-19.json", buildWorkflow(WF[19], "CSC 19 - Status Engine", nodes, C));
}

// ============ CSC 20 - NOTIFICATION ENGINE (central WhatsApp sender) ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(dtInsert("Log Notification", "notifications_log", {
    phone: "={{ $json.phone }}",
    template: "={{ $json.template || 'GENERIC' }}",
    message: "={{ ($json.message || '').slice(0, 2000) }}",
    status: "QUEUED",
    related_id: "={{ $json.related_id || $json.phone }}",
    error: "",
    created_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtGet("Get Phone ID", "system_config", "config_key", "=WHATSAPP_PHONE_NUMBER_ID"));
  nodes.push(dtGet("Get Token", "system_config", "config_key", "=WHATSAPP_ACCESS_TOKEN"));
  nodes.push(dtGet("Get API Ver", "system_config", "config_key", "=WHATSAPP_API_VERSION"));
  nodes.push(code("Check WA Creds", `
const pid = $('Get Phone ID').first().json.config_value || '';
const token = $('Get Token').first().json.config_value || '';
const ver = $('Get API Ver').first().json.config_value || 'v21.0';
const t = $('Trigger').first().json;
const ready = pid && token && !pid.startsWith('SET_') && !token.startsWith('SET_');
return [{ json: { ready, pid, token, ver, phone: t.phone, message: t.message, template: t.template || 'GENERIC', related_id: t.related_id || t.phone } }];`));
  nodes.push(ifNode("Creds Ready?", [eq("={{ $json.ready }}", "true")]));
  nodes.push(http("Send WhatsApp", {
    method: "POST",
    url: "=https://graph.facebook.com/{{ $json.ver }}/{{ $json.pid }}/messages",
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: "Authorization", value: "=Bearer {{ $('Check WA Creds').first().json.token }}" },
      { name: "Content-Type", value: "application/json" }
    ] },
    sendBody: true, specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ messaging_product: 'whatsapp', to: $('Check WA Creds').first().json.phone, type: 'text', text: { body: $('Check WA Creds').first().json.message } }) }}`,
    options: { response: { response: { neverError: true } }, timeout: 30000 }
  }, { onError: "continueRegularOutput" }));
  nodes.push(code("Update Sent Status", `
const r = $json;
const waMsgId = r.messages && r.messages[0] && r.messages[0].id || '';
const err = r.error ? String(r.error.message || JSON.stringify(r.error)).slice(0, 500) : '';
return [{ json: { waMsgId, err, phone: $('Check WA Creds').first().json.phone, related_id: $('Check WA Creds').first().json.related_id } }];`));
  nodes.push(dtUpdate("Mark Log Sent", "notifications_log", "related_id", "={{ $json.related_id }}", {
    status: "SENT",
    error: "={{ $json.err }}"
  }));
  nodes.push(code("Sent Output", `
return [{ json: { ok: true, mock: false, wa_message_id: $json.waMsgId, error: $json.err } }];`));
  nodes.push(code("Mock Send", `
const c = $('Check WA Creds').first().json;
return [{ json: { ok: true, mock: true, phone: c.phone, message: c.message, related_id: c.related_id, note: 'WhatsApp credentials set nahi hain - message log only. Meta token set karte hi real send hoga.' } }];`));
  nodes.push(dtUpdate("Mark Log Mock", "notifications_log", "related_id", "={{ $('Check WA Creds').first().json.related_id }}", {
    status: "MOCK_LOGGED",
    error: "credentials not set"
  }));
  nodes.push(code("Mock Output", `
return [{ json: { ok: true, mock: true } }];`));
  mergeConn(C, link("Trigger", "Log Notification"));
  mergeConn(C, link("Log Notification", "Get Phone ID"));
  mergeConn(C, link("Get Phone ID", "Get Token"));
  mergeConn(C, link("Get Token", "Get API Ver"));
  mergeConn(C, link("Get API Ver", "Check WA Creds"));
  mergeConn(C, link("Check WA Creds", "Creds Ready?"));
  mergeConn(C, { "Creds Ready?": { main: [[{ node: "Send WhatsApp", type: "main", index: 0 }], [{ node: "Mock Send", type: "main", index: 0 }]] } });
  mergeConn(C, link("Send WhatsApp", "Update Sent Status"));
  mergeConn(C, link("Update Sent Status", "Mark Log Sent"));
  mergeConn(C, link("Mark Log Sent", "Sent Output"));
  mergeConn(C, link("Mock Send", "Mark Log Mock"));
  mergeConn(C, link("Mark Log Mock", "Mock Output"));
  writeJson(DIR + "csc-20.json", buildWorkflow(WF[20], "CSC 20 - Notification Engine (WhatsApp Sender)", nodes, C));
}

// ============ CSC 21 - REMINDER ENGINE (cron, anti-harassment) ============
{
  const nodes = [];
  const C = {};
  nodes.push(scheduleNode("Every 6 Hours", { field: "cronExpression", expression: "0 9,15,21 * * *" }));
  nodes.push(dtGet("Get Reminder Cfg", "system_config", "config_key", "=REMINDER_MAX_PER_APP"));
  nodes.push(dtGet("Get Quiet Start", "system_config", "config_key", "=REMINDER_QUIET_START"));
  nodes.push(dtGet("Get Quiet End", "system_config", "config_key", "=REMINDER_QUIET_END"));
  nodes.push(code("Quiet Hours Check", `
const qs = $('Get Quiet Start').first().json.config_value || '21:00';
const qe = $('Get Quiet End').first().json.config_value || '09:00';
const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
const hhmm = String(nowIst.getUTCHours()).padStart(2, '0') + ':' + String(nowIst.getUTCMinutes()).padStart(2, '0');
const quiet = (hhmm >= qs) || (hhmm < qe);
return [{ json: { quiet, hhmm, maxReminders: Number($('Get Reminder Cfg').first().json.config_value || 3) } }];`));
  nodes.push(ifNode("In Quiet Hours?", [eq("={{ $json.quiet }}", "true")]));
  nodes.push(code("Skip Quiet", `
return [{ json: { skipped: true, reason: 'quiet hours - anti-harassment rule' } }];`));
  nodes.push(dtGet("Get DOCS Convos", "conversation_state", "state", "=DOCS", { returnAll: true }));
  nodes.push(dtGet("Get PAYMENT Convos", "conversation_state", "state", "=PAYMENT", { returnAll: true }));
  nodes.push(code("Build Reminder Items", `
const items = [];
try { for (const i of $('Get DOCS Convos').all()) items.push({ phone: i.json.phone, type: 'DOCS', service_id: i.json.service_id, context_data: i.json.context_data || '{}' }); } catch (e) {}
try { for (const i of $('Get PAYMENT Convos').all()) items.push({ phone: i.json.phone, type: 'PAYMENT', service_id: i.json.service_id, context_data: i.json.context_data || '{}' }); } catch (e) {}
return items.length ? items.map(i => ({ json: i })) : [{ json: { none: true } }];`));
  nodes.push(code("Compute Reminder", `
const item = $json;
if (item.none) return [{ json: { skip: true, phone: '', reason: 'no pending conversations' } }];
let ctx = {};
try { ctx = JSON.parse(item.context_data || '{}'); } catch (e) {}
const count = Number(ctx.reminder_count || 0);
const maxR = Number($('Quiet Hours Check').first().json.maxReminders || 3);
if (count >= maxR) return [{ json: { skip: true, phone: item.phone, reason: 'max reminders reached (' + count + ')' } }];
let msg;
if (item.type === 'DOCS') msg = '\\ud83d\\udcc4 Yaad dilayein: aapke application ke documents pending hain. Photo/PDF bhejein taaki kaam aage badhe.';
else msg = '\\ud83d\\udcb3 Yaad dilayein: aapka payment pending hai. Payment confirm hote hi kaam aage badhega.';
msg += '\\n\\n(Ye reminder ' + (count + 1) + '/' + maxR + ' hai. CANCEL se band kar sakte hain.)';
const newCtx = JSON.stringify({ ...ctx, reminder_count: count + 1 });
return [{ json: { skip: false, phone: item.phone, message: msg, type: item.type, application_id: ctx.application_id || '', newCount: count + 1, newCtx } }];`));
  nodes.push(ifNode("Should Remind?", [eq("={{ $json.skip }}", "false")]));
  nodes.push(exwf("Send Reminder", WF[20], {
    parameters: { source: "database", workflowId: WF[20],
      workflowInputs: { mappingMode: "defineBelow", value: {
        action: "send_whatsapp",
        phone: "={{ $json.phone }}",
        message: "={{ $json.message }}",
        template: "=REMINDER_{{ $json.type }}",
        related_id: "={{ $json.application_id || $json.phone }}"
      } } }
  }, { onError: "continueRegularOutput" }));
  nodes.push(dtUpdate("Bump Reminder Count", "conversation_state", "phone", "={{ $('Compute Reminder').item.json.phone }}", {
    context_data: "={{ $('Compute Reminder').item.json.newCtx }}",
    updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtInsert("Log Reminder", "reminders_log", {
    phone: "={{ $('Compute Reminder').first().json.phone }}",
    application_id: "={{ $('Compute Reminder').first().json.application_id }}",
    reminder_type: "={{ $('Compute Reminder').first().json.type }}",
    count: "={{ $('Compute Reminder').first().json.newCount }}",
    sent_at: "={{ $now.toISO() }}",
    status: "SENT"
  }));
  mergeConn(C, link("Every 6 Hours", "Get Reminder Cfg"));
  mergeConn(C, link("Get Reminder Cfg", "Get Quiet Start"));
  mergeConn(C, link("Get Quiet Start", "Get Quiet End"));
  mergeConn(C, link("Get Quiet End", "Quiet Hours Check"));
  mergeConn(C, link("Quiet Hours Check", "In Quiet Hours?"));
  mergeConn(C, { "In Quiet Hours?": { main: [[{ node: "Get DOCS Convos", type: "main", index: 0 }], [{ node: "Skip Quiet", type: "main", index: 0 }]] } });
  mergeConn(C, link("Get DOCS Convos", "Get PAYMENT Convos"));
  mergeConn(C, link("Get PAYMENT Convos", "Build Reminder Items"));
  mergeConn(C, link("Build Reminder Items", "Compute Reminder"));
  mergeConn(C, link("Compute Reminder", "Should Remind?"));
  mergeConn(C, { "Should Remind?": { main: [[{ node: "Send Reminder", type: "main", index: 0 }], []] } });
  mergeConn(C, link("Send Reminder", "Bump Reminder Count"));
  mergeConn(C, link("Bump Reminder Count", "Log Reminder"));
  writeJson(DIR + "csc-21.json", buildWorkflow(WF[21], "CSC 21 - Reminder Engine (Anti-Harassment)", nodes, C));
}

console.log("BUILD GROUP 4 DONE (19, 20, 21)");
