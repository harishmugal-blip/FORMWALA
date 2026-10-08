// Build CSC 14, 15, 16, 17, 18 (application lifecycle + operator flow)
import { buildWorkflow, writeJson, triggerSub, code, dtGet, dtInsert, dtUpdate, dtUpsert, ifNode, eq, notEmpty, isEmpty, exwf, link, mergeConn, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";

// ============ CSC 14 - APPLICATION ENGINE ============
{
  const nodes = [
    triggerSub("Trigger"),
    code("Route Action", `
const j = $json;
return [{ json: { action: j.action || 'finalize', application_id: j.application_id || '', phone: j.phone || '', service_id: j.service_id || '' } }];`),
    ifNode("Finalize?", [eq("={{ $json.action }}", "finalize")]),
    // finalize: generate app number + update
    dtGet("Get App", "applications", "application_id", "={{ $('Route Action').first().json.application_id }}"),
    code("Gen App Number", `
const app = $('Get App').first().json;
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
let num = '';
for (let i = 0; i < 6; i++) num += chars[Math.floor(Math.random() * chars.length)];
const prefix = 'CSC-2026-';
const existing = app.application_number || '';
const final = existing || (prefix + num);
return [{ json: { application_number: final, application_id: app.application_id, status: app.status } }];`),
    dtUpdate("Update App Final", "applications", "application_id", "={{ $json.application_id }}", {
      application_number: "={{ $json.application_number }}",
      status: "PAID",
      updated_at: "={{ $now.toISO() }}"
    }),
    dtInsert("History Finalize", "application_status_history", {
      application_id: "={{ $('Gen App Number').first().json.application_id }}",
      application_number: "={{ $('Gen App Number').first().json.application_number }}",
      old_status: "PAYMENT_PENDING",
      new_status: "PAID",
      note: "Application number generated after payment verification",
      created_at: "={{ $now.toISO() }}"
    }),
    code("Finalize Output", `
const u = $('Update App Final').first().json;
return [{ json: { ok: true, application_id: u.application_id || $('Gen App Number').first().json.application_id, application_number: $('Gen App Number').first().json.application_number, status: 'PAID' } }];`),
    // create_draft path
    dtInsert("Create Draft", "applications", {
      application_id: "={{ 'APP' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase() }}",
      customer_phone: "={{ $('Route Action').first().json.phone }}",
      service_id: "={{ $('Route Action').first().json.service_id }}",
      status: "DRAFT",
      form_data: "",
      application_number: "",
      created_at: "={{ $now.toISO() }}",
      updated_at: "={{ $now.toISO() }}"
    })
  ];
  const C = {};
  mergeConn(C, link("Trigger", "Route Action"));
  mergeConn(C, link("Route Action", "Finalize?"));
  mergeConn(C, { "Finalize?": { main: [[{ node: "Get App", type: "main", index: 0 }], [{ node: "Create Draft", type: "main", index: 0 }]] } });
  mergeConn(C, link("Get App", "Gen App Number"));
  mergeConn(C, link("Gen App Number", "Update App Final"));
  mergeConn(C, link("Update App Final", "History Finalize"));
  mergeConn(C, link("History Finalize", "Finalize Output"));
  writeJson(DIR + "csc-14.json", buildWorkflow(WF[14], "CSC 14 - Application Engine", nodes, C));
}

// ============ CSC 15 - RECEIPT SENDER ============
{
  const nodes = [
    triggerSub("Trigger"),
    code("Build Receipt", `
const t = $json;
const num = t.application_number || 'CSC-2026-PENDING';
const total = Number(t.total || 0);
let msg = '\\u2705 *Payment Verify Ho Gaya!* \\ud83c\\udf89\\n\\n';
msg += '\\ud83d\\udccb Application Number: *' + num + '*\\n';
msg += '\\ud83e\\uddfe Payment Receipt:\\n';
msg += '   Govt Fee: Rs ' + Number(t.gov_fee || 0) + '\\n';
msg += '   Service Charge: Rs ' + Number(t.service_charge || 0) + '\\n';
msg += '   GST: Rs ' + Number(t.gst || 0) + '\\n';
msg += '   *Total: Rs ' + total + '*\\n';
if (t.transaction_id) msg += '\\ud83d\\udcb3 Txn ID: ' + t.transaction_id + '\\n';
msg += '\\n\\ud83d\\udcc5 Date: ' + new Date().toISOString().slice(0, 10) + '\\n';
msg += '\\nAb aapka application CSC operator ko assign ho gaya hai.\\n';
msg += 'Portal par submit hone ke baad aapko confirmation milega.\\n\\n';
msg += 'Status dekhne ke liye STATUS likhein. \\ud83d\\ude4f Dhanyawad!';
return [{ json: { phone: t.phone, message: msg, template: 'RECEIPT', related_id: t.application_id || num } }];`),
    exwf("Send Via Notif", WF[20], {
      parameters: { source: "database", workflowId: WF[20],
        workflowInputs: { mappingMode: "defineBelow", value: {
          action: "send_whatsapp",
          phone: "={{ $json.phone }}",
          message: "={{ $json.message }}",
          template: "={{ $json.template }}",
          related_id: "={{ $json.related_id }}"
        } } }
    }),
    dtInsert("Save Receipt", "receipts", {
      receipt_id: "={{ 'RCPT' + Date.now().toString(36).toUpperCase() }}",
      application_id: "={{ $('Build Receipt').first().json.related_id }}",
      application_number: "={{ $('Build Receipt').first().json.phone ? ($('Trigger').first().json.application_number || '') : '' }}",
      amount: "={{ $('Trigger').first().json.total || 0 }}",
      payload: "={{ JSON.stringify($('Build Receipt').first().json) }}",
      created_at: "={{ $now.toISO() }}"
    })
  ];
  const C = mergeConn(link("Trigger", "Build Receipt"), link("Build Receipt", "Send Via Notif"));
  mergeConn(C, link("Send Via Notif", "Save Receipt"));
  writeJson(DIR + "csc-15.json", buildWorkflow(WF[15], "CSC 15 - Receipt Sender", nodes, C));
}

// ============ CSC 16 - OPERATOR DISPATCHER ============
{
  const nodes = [
    triggerSub("Trigger"),
    dtGet("Get Admin Number", "system_config", "config_key", "=ADMIN_WHATSAPP_NUMBER"),
    dtGet("Get Docs Count", "application_documents", "application_id", "={{ $json.application_id }}", { returnAll: true }),
    dtGet("Get Field Values", "application_field_values", "application_id", "={{ $('Get Admin Number').first().json && $json.application_id ? $json.application_id : '' }}", { returnAll: true }),
    dtInsert("Create Operator Task", "operator_tasks", {
      task_id: "={{ 'TASK' + Date.now().toString(36).toUpperCase() }}",
      application_id: "={{ $('Get Admin Number').first().json && 1 ? $('Trigger').first().json.application_id : $('Trigger').first().json.application_id }}",
      application_number: "={{ $('Trigger').first().json.application_number }}",
      operator_phone: "={{ $('Get Admin Number').first().json.config_value || 'SET_ADMIN_NUMBER' }}",
      status: "PENDING",
      note: "",
      created_at: "={{ $now.toISO() }}",
      updated_at: "={{ $now.toISO() }}"
    }),
    code("Build Operator Msg", `
const t = $('Trigger').first().json;
const admin = $('Get Admin Number').first().json || {};
let fields = [];
try { fields = $('Get Field Values').all().map(i => i.json); } catch (e) {}
let docs = [];
try { docs = $('Get Docs Count').all().map(i => i.json); } catch (e) {}
let msg = '\\ud83d\\udc64\\u200d\\ud83d\\udcbc *NAYA CSC TASK* \\ud83d\\udea8\\n\\n';
msg += '\\ud83d\\udccb Application: *' + (t.application_number || t.application_id) + '*\\n';
msg += '\\ud83d\\udcf1 Customer: ' + (t.customer_phone || '') + '\\n';
msg += '\\ud83d\\udee0\\ufe0f Service: ' + (t.service_id || '') + '\\n';
msg += '\\ud83d\\udcb0 Paid: Rs ' + (t.total || 0) + '\\n\\n';
msg += '\\ud83d\\udcdd *Form Data:*\\n';
fields.forEach(f => {
  let v = f.field_value || '';
  if (f.field_key.includes('aadhaar') || f.field_key === 'aadhaar_number') v = 'XXXX XXXX ' + String(v).slice(-4);
  msg += '  ' + f.field_key + ': ' + v + '\\n';
});
msg += '\\n\\ud83d\\udcc4 Documents: ' + docs.length + ' received\\n';
msg += '\\n\\ud83d\\udd17 Portal par login karke form bharo. OTP/CAPTCHA khud se daalo (kabhi customer se OTP na maango).\\n\\n';
msg += '*Commands:*\\n';
msg += '  DONE ' + (t.application_number || '') + ' \\u2192 portal par submit ho gaya\\n';
msg += '  ISSUE ' + (t.application_number || '') + ' [note] \\u2192 problem report karo\\n';
msg += '  QUEUE \\u2192 pending tasks dekho';
return [{ json: { phone: admin.config_value || '', message: msg, template: 'OPERATOR_TASK', related_id: t.application_id } }];`),
    exwf("Notify Operator", WF[20], {
      parameters: { source: "database", workflowId: WF[20],
        workflowInputs: { mappingMode: "defineBelow", value: {
          action: "send_whatsapp",
          phone: "={{ $json.phone }}",
          message: "={{ $json.message }}",
          template: "={{ $json.template }}",
          related_id: "={{ $json.related_id }}"
        } } }
    })
  ];
  const C = {};
  mergeConn(C, link("Trigger", "Get Admin Number"));
  mergeConn(C, link("Get Admin Number", "Get Docs Count"));
  mergeConn(C, link("Get Docs Count", "Get Field Values"));
  mergeConn(C, link("Get Field Values", "Create Operator Task"));
  mergeConn(C, link("Create Operator Task", "Build Operator Msg"));
  mergeConn(C, link("Build Operator Msg", "Notify Operator"));
  writeJson(DIR + "csc-16.json", buildWorkflow(WF[16], "CSC 16 - Operator Dispatcher", nodes, C));
}

// ============ CSC 17 - OPERATOR PORTAL ASSISTANT ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(code("Parse Command", `
const j = $json;
const msg = String(j.message || '').trim();
const up = msg.toUpperCase();
let cmd = 'HELP', arg = '', note = '';
if (/^DONE\\s+\\S+/.test(up)) { cmd = 'DONE'; arg = up.replace(/^DONE\\s+/, '').split('\\s')[0]; }
else if (/^ISSUE\\s+\\S+/.test(up)) { const parts = msg.split(/\\s+/); cmd = 'ISSUE'; arg = (parts[1] || '').toUpperCase(); note = parts.slice(2).join(' '); }
else if (/^PAID\\s+\\S+/.test(up)) { cmd = 'PAID'; arg = up.replace(/^PAID\\s+/, '').split('\\s')[0]; }
else if (/^QUEUE$/.test(up)) cmd = 'QUEUE';
else if (/^RESUME\\s+\\S+/.test(up)) { cmd = 'RESUME'; arg = msg.replace(/^RESUME\\s+/i, '').trim(); }
else if (/^HELP$/.test(up)) cmd = 'HELP';
return [{ json: { cmd, arg, note, phone: j.phone, message: msg } }];`));

  nodes.push({
    parameters: {
      rules: {
        values: [
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "k0", leftValue: "={{ $json.cmd }}", rightValue: "DONE", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "done" },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "k1", leftValue: "={{ $json.cmd }}", rightValue: "ISSUE", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "issue" },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "k2", leftValue: "={{ $json.cmd }}", rightValue: "QUEUE", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "queue" },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "k3", leftValue: "={{ $json.cmd }}", rightValue: "PAID", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "paid" },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 }, conditions: [{ id: "k4", leftValue: "={{ $json.cmd }}", rightValue: "RESUME", operator: { type: "string", operation: "equals" } }], combinator: "and" }, renameOutput: true, outputKey: "resume" }
        ]
      },
      options: { fallbackOutput: "extra", renameFallbackOutput: "help" }
    },
    name: "Route Command", type: "n8n-nodes-base.switch", typeVersion: 3.2, position: [0, 0]
  });

  // DONE -> CSC 18
  nodes.push(exwf("Mark Submitted", WF[18], {
    parameters: { source: "database", workflowId: WF[18],
      workflowInputs: { mappingMode: "defineBelow", value: {
        application_number: "={{ $('Parse Command').first().json.arg }}",
        note: "Portal submission confirmed by operator"
      } } }
  }));
  nodes.push(code("Done Reply", `
const r = $('Mark Submitted').first().json;
const p = $('Parse Command').first().json;
return [{ json: { reply: r.ok ? ('\\u2705 ' + r.application_number + ' SUBMITTED mark kiya gaya. Customer ko notification chala gaya.') : ('\\u26a0\\ufe0f Application ' + p.arg + ' nahi mila. Queue dekhne ke liye QUEUE likhein.'), phone: p.phone } }];`));

  // ISSUE
  nodes.push(code("Issue Reply", `
const p = $json;
return [{ json: { cmd: 'ISSUE', arg: p.arg, note: p.note || 'Issue reported', phone: p.phone } }];`));
  nodes.push(dtGet("Get Issue App", "applications", "application_number", "={{ $('Issue Reply').first().json.arg }}"));
  nodes.push(dtUpdate("Update Task Issue", "operator_tasks", "application_id", "={{ $('Get Issue App').first().json.application_id || 'none' }}", {
    status: "ISSUE",
    note: "={{ $('Issue Reply').first().json.note }}",
    updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtUpdate("Mark App Issue", "applications", "application_id", "={{ $('Get Issue App').first().json.application_id || 'none' }}", {
    status: "ISSUE_REPORTED",
    updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(exwf("Notify Customer Issue", WF[20], {
    parameters: { source: "database", workflowId: WF[20],
      workflowInputs: { mappingMode: "defineBelow", value: {
        action: "send_whatsapp",
        phone: "={{ $('Get Issue App').first().json.customer_phone || '' }}",
        message: "=\u26a0\ufe0f Aapke application {{ $('Issue Reply').first().json.arg }} mein thodi dikkat aayi hai. Hamari team jaldi aapse contact karegi. (Note: {{ $('Issue Reply').first().json.note }})",
        template: "ISSUE_NOTICE",
        related_id: "={{ $('Get Issue App').first().json.application_id }}"
      } }
    },
    onError: "continueRegularOutput"
  }));
  nodes.push(code("Issue Confirm", `
const p = $('Parse Command').first().json;
return [{ json: { reply: '\\u2705 Issue log ho gayi: ' + p.arg + ' (' + (p.note || 'no note') + '). Customer ko inform kar diya.', phone: p.phone } }];`));

  // QUEUE
  nodes.push(dtGet("Get Pending Tasks", "operator_tasks", "status", "=PENDING", { returnAll: true }));
  nodes.push(code("Queue Reply", `
const p = $('Parse Command').first().json;
let tasks = [];
try { tasks = $input.all().map(i => i.json); } catch (e) {}
if (!tasks.length) return [{ json: { reply: '\\u2705 Koi pending task nahi hai. Sab clear hai! \\ud83c\\udf89', phone: p.phone } }];
let msg = '\\ud83d\\udccb *PENDING TASKS (' + tasks.length + ')*\\n';
tasks.slice(0, 15).forEach((t, i) => { msg += '\\n' + (i + 1) + '. ' + (t.application_number || t.application_id) + ' | ' + (t.status || '') + ' | ' + (t.created_at || '').slice(0, 10); });
if (tasks.length > 15) msg += '\\n... aur ' + (tasks.length - 15) + ' tasks';
return [{ json: { reply: msg, phone: p.phone } }];`));

  // PAID (manual confirm - TEST mode only, audited)
  nodes.push(dtGet("Get Paid App", "applications", "application_number", "={{ $('Parse Command').first().json.arg }}"));
  nodes.push(code("Manual Paid", `
const app = $('Get Paid App').first().json;
const p = $('Parse Command').first().json;
if (!app.application_id) return [{ json: { cmd: 'PAID_SKIP', phone: p.phone, arg: p.arg } }];
return [{ json: { application_id: app.application_id, phone: p.phone, arg: p.arg } }];`));
  nodes.push(ifNode("App Found For Paid?", [notEmpty("={{ $json.application_id }}")]));
  nodes.push(dtUpdate("Confirm Payment", "payments", "application_id", "={{ $json.application_id }}", {
    status: "PAID", paid_at: "={{ $now.toISO() }}", gateway: "={{ $json.gateway || 'MANUAL' }}"
  }));
  nodes.push(dtUpdate("Confirm App Paid", "applications", "application_id", "={{ $json.application_id }}", {
    status: "PAID", updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtInsert("Audit Manual Paid", "audit_log", {
    event_id: "={{ 'AUD' + Date.now().toString(36).toUpperCase() }}",
    event_type: "MANUAL_PAYMENT_CONFIRM",
    actor: "={{ $('Parse Command').first().json.phone }}",
    phone: "={{ $('Parse Command').first().json.phone }}",
    application_id: "={{ $('Manual Paid').first().json.application_id }}",
    payload: "={{ JSON.stringify({ by: 'operator-command', mode: 'TEST-ONLY' }) }}",
    created_at: "={{ $now.toISO() }}"
  }));
  nodes.push(code("Paid Reply", `
const p = $('Parse Command').first().json;
return [{ json: { reply: '\\u2705 Payment manually confirm kiya: ' + p.arg + ' (audit log ho gaya). Ab DONE command se submission mark karein.', phone: p.phone } }];`));
  nodes.push(code("Paid Not Found", `
const p = $('Parse Command').first().json;
return [{ json: { reply: '\\u26a0\\ufe0f Application ' + p.arg + ' nahi mila. QUEUE likhkar sahi number dekhein.', phone: p.phone } }];`));

  // RESUME (from handoff)
  nodes.push(exwf("Resume Handoff", WF[22], {
    parameters: { source: "database", workflowId: WF[22],
      workflowInputs: { mappingMode: "defineBelow", value: {
        phone: "={{ $('Parse Command').first().json.arg }}",
        mode: "resume"
      } } }
  }));
  nodes.push(code("Resume Reply", `
const p = $('Parse Command').first().json;
return [{ json: { reply: '\\u2705 Bot resume ho gaya for ' + p.arg + '.', phone: p.phone } }];`));

  // HELP (fallback)
  nodes.push(code("Help Reply", `
const p = $('Parse Command').first().json;
let msg = '\\ud83d\\udc64\\u200d\\ud83d\\udcbc *Operator Commands*\\n\\n';
msg += 'DONE CSC-2026-XXXXXX \\u2192 portal submit mark\\n';
msg += 'ISSUE CSC-2026-XXXXXX [note] \\u2192 problem report\\n';
msg += 'QUEUE \\u2192 pending tasks\\n';
msg += 'PAID CSC-2026-XXXXXX \\u2192 manual payment confirm (TEST only)\\n';
msg += 'RESUME 91XXXXXXXXXX \\u2192 customer ka bot resume\\n';
msg += 'HELP \\u2192 ye list';
return [{ json: { reply: msg, phone: p.phone } }];`));

  mergeConn(C, link("Trigger", "Parse Command"));
  mergeConn(C, link("Parse Command", "Route Command"));
  mergeConn(C, { "Route Command": { main: [
    [{ node: "Mark Submitted", type: "main", index: 0 }],
    [{ node: "Issue Reply", type: "main", index: 0 }],
    [{ node: "Get Pending Tasks", type: "main", index: 0 }],
    [{ node: "Get Paid App", type: "main", index: 0 }],
    [{ node: "Resume Handoff", type: "main", index: 0 }],
    [{ node: "Help Reply", type: "main", index: 0 }]
  ] } });
  mergeConn(C, link("Mark Submitted", "Done Reply"));
  mergeConn(C, link("Issue Reply", "Get Issue App"));
  mergeConn(C, link("Get Issue App", "Update Task Issue"));
  mergeConn(C, link("Update Task Issue", "Mark App Issue"));
  mergeConn(C, link("Mark App Issue", "Notify Customer Issue"));
  mergeConn(C, link("Notify Customer Issue", "Issue Confirm"));
  mergeConn(C, link("Get Pending Tasks", "Queue Reply"));
  mergeConn(C, link("Get Paid App", "Manual Paid"));
  mergeConn(C, link("Manual Paid", "App Found For Paid?"));
  mergeConn(C, { "App Found For Paid?": { main: [[{ node: "Confirm Payment", type: "main", index: 0 }], [{ node: "Paid Not Found", type: "main", index: 0 }]] } });
  mergeConn(C, link("Confirm Payment", "Confirm App Paid"));
  mergeConn(C, link("Confirm App Paid", "Audit Manual Paid"));
  mergeConn(C, link("Audit Manual Paid", "Paid Reply"));
  mergeConn(C, link("Resume Handoff", "Resume Reply"));
  writeJson(DIR + "csc-17.json", buildWorkflow(WF[17], "CSC 17 - Operator Portal Assistant", nodes, C));
}

// ============ CSC 18 - SUBMISSION CONFIRMER ============
{
  const nodes = [
    triggerSub("Trigger"),
    dtGet("Get App", "applications", "application_number", "={{ $json.application_number }}"),
    ifNode("App Found?", [notEmpty("={{ $json.application_id }}")]),
    code("Not Found", `
return [{ json: { ok: false, error: 'application not found' } }];`),
    dtUpdate("Set Submitted", "applications", "application_id", "={{ $json.application_id }}", {
      status: "SUBMITTED",
      updated_at: "={{ $now.toISO() }}"
    }),
    dtInsert("History Submitted", "application_status_history", {
      application_id: "={{ $('Get App').first().json.application_id }}",
      application_number: "={{ $('Get App').first().json.application_number }}",
      old_status: "PAID",
      new_status: "SUBMITTED",
      note: "={{ $('Trigger').first().json.note || 'Operator confirmed portal submission' }}",
      created_at: "={{ $now.toISO() }}"
    }),
    dtUpdate("Close Task", "operator_tasks", "application_id", "={{ $('Get App').first().json.application_id }}", {
      status: "DONE",
      updated_at: "={{ $now.toISO() }}"
    }),
    dtInsert("Audit Submitted", "audit_log", {
      event_id: "={{ 'AUD' + Date.now().toString(36).toUpperCase() }}",
      event_type: "PORTAL_SUBMITTED",
      actor: "OPERATOR",
      phone: "={{ $('Get App').first().json.customer_phone }}",
      application_id: "={{ $('Get App').first().json.application_id }}",
      payload: "={{ JSON.stringify({ application_number: $('Get App').first().json.application_number, portal_mode: 'MOCK-or-LIVE' }) }}",
      created_at: "={{ $now.toISO() }}"
    }),
    exwf("Notify Customer", WF[20], {
      parameters: { source: "database", workflowId: WF[20],
        workflowInputs: { mappingMode: "defineBelow", value: {
          action: "send_whatsapp",
          phone: "={{ $('Get App').first().json.customer_phone }}",
          message: "=\\ud83c\\udf89 *Badhai ho!* Aapka application {{ $('Get App').first().json.application_number }} government portal par submit ho gaya hai.\\n\\n\\ud83d\\udcc5 Submission date: {{ $now.toISO().slice(0, 10) }}\\n\\ud83d\\udce9 Government se acknowledgement/receipt milne par turant update milega.\\n\\nStatus dekhne ke liye STATUS likhein.",
          template: "SUBMITTED",
          related_id: "={{ $('Get App').first().json.application_id }}"
        } } }
    }),
    code("Confirm Output", `
return [{ json: { ok: true, application_number: $('Get App').first().json.application_number, status: 'SUBMITTED', phone: $('Trigger').first().json.phone || '' } }];`)
  ];
  const C = {};
  mergeConn(C, link("Trigger", "Get App"));
  mergeConn(C, link("Get App", "App Found?"));
  mergeConn(C, { "App Found?": { main: [[{ node: "Set Submitted", type: "main", index: 0 }], [{ node: "Not Found", type: "main", index: 0 }]] } });
  mergeConn(C, link("Set Submitted", "History Submitted"));
  mergeConn(C, link("History Submitted", "Close Task"));
  mergeConn(C, link("Close Task", "Audit Submitted"));
  mergeConn(C, link("Audit Submitted", "Notify Customer"));
  mergeConn(C, link("Notify Customer", "Confirm Output"));
  writeJson(DIR + "csc-18.json", buildWorkflow(WF[18], "CSC 18 - Submission Confirmer", nodes, C));
}

console.log("BUILD GROUP 3 DONE (14, 15, 16, 17, 18)");
