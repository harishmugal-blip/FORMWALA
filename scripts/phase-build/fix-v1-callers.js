// Insert Prep code nodes before executeWorkflow callers (v1 passes input items verbatim)
import { readFileSync, writeFileSync } from "node:fs";

const dir = "/home/z/my-project/scripts/phase-build/json/";
const c = (node, type = "main", index = 0) => ({ node, type, index });

const PREPS = {
  "csc-01-v2.json": {
    "Run Handoff Forward": "const p = $('Route Decision').first().json;\nreturn [{ json: { phone: p.phone, name: p.name, message: p.message, mode: 'customer_message' } }];",
    "Run Handoff Takeover": "const p = $('Route Decision').first().json;\nreturn [{ json: { phone: p.phone, name: p.name, message: p.message, mode: 'takeover' } }];",
    "Start Field Collection": "const p = $('Route Decision').first().json;\nreturn [{ json: { phone: p.phone, name: p.name, message: p.message, service_id: p.pending_service || '' } }];"
  },
  "csc-06.json": {
    "Validate Answer": "const cs = $('Compute Step').first().json;\nconst f = cs.field || {};\nreturn [{ json: { field_key: f.field_key, field_label: f.label, field_type: f.field_type, options: f.options, error_hint: f.error_hint, value: cs.value } }];"
  },
  "csc-08.json": {
    "Get Pricing": "const gp = $('Go Payment').first().json;\nconst mn = $('Match Next Doc').first().json;\nreturn [{ json: { service_id: gp.service_id || (mn.service && mn.service.service_id) || '' } }];",
    "Init Payment": "const pr = $('Get Pricing').first().json;\nconst gp = $('Go Payment').first().json;\nconst mn = $('Match Next Doc').first().json;\nreturn [{ json: { application_id: gp.application_id || mn.application_id, phone: gp.phone || mn.phone, service_id: pr.service_id, total: pr.total, gov_fee: pr.gov_fee, service_charge: pr.service_charge, gst: pr.gst } }];"
  },
  "csc-13.json": {
    "Finalize Application": "const pp = $('Parse Payment').first().json;\nreturn [{ json: { action: 'finalize', application_id: pp.application_id } }];",
    "Send Receipt": "const app = $('Get App Row').first().json;\nconst fin = $('Finalize Application').first().json;\nconst pp = $('Parse Payment').first().json;\nreturn [{ json: { phone: app.customer_phone, application_number: fin.application_number, application_id: app.application_id, total: app.total_fee, gov_fee: app.gov_fee, service_charge: app.service_charge, gst: app.gst, transaction_id: pp.transaction_id } }];",
    "Dispatch Operator": "const app = $('Get App Row').first().json;\nconst fin = $('Finalize Application').first().json;\nreturn [{ json: { application_id: app.application_id, application_number: fin.application_number, customer_phone: app.customer_phone, service_id: app.service_id, total: app.total_fee } }];"
  },
  "csc-17.json": {
    "Mark Submitted": "const p = $('Parse Command').first().json;\nreturn [{ json: { application_number: p.arg, note: 'Portal submission confirmed by operator' } }];",
    "Resume Handoff": "const p = $('Parse Command').first().json;\nreturn [{ json: { phone: p.arg, mode: 'resume' } }];",
    "Notify Customer Issue": "const app = $('Get Issue App').first().json;\nconst p = $('Parse Command').first().json;\nreturn [{ json: { phone: app.customer_phone || '', message: '\\u26a0\\ufe0f Aapke application ' + p.arg + ' mein thodi dikkat aayi hai. Hamari team jaldi aapse contact karegi. (Note: ' + (p.note || '') + ')', template: 'ISSUE_NOTICE', related_id: app.application_id || '' } }];"
  },
  "csc-18.json": {
    "Notify Customer": "const app = $('Get App').first().json;\nreturn [{ json: { phone: app.customer_phone, message: '\\ud83c\\udf89 Badhai ho! Aapka application ' + app.application_number + ' government portal par submit ho gaya hai.\\n\\nStatus dekhne ke liye STATUS likhein.', template: 'SUBMITTED', related_id: app.application_id } }];"
  },
  "csc-22.json": {
    "Alert Operator": "const admin = $json;\nconst p = $('Route Mode').first().json;\nreturn [{ json: { phone: admin.config_value || '', message: '\\ud83d\\udea8 HUMAN HANDOFF REQUEST\\nCustomer: ' + p.name + ' (' + p.phone + ')\\nMessage: ' + String(p.message || '').slice(0, 300) + '\\nBot PAUSED hai. Resume karne ke liye: RESUME ' + p.phone, template: 'HANDOFF_ALERT', related_id: p.phone } }];",
    "Forward To Operator": "const admin = $json;\nconst p = $('Route Mode').first().json;\nreturn [{ json: { phone: admin.config_value || '', message: '\\ud83d\\udce8 Customer message (handoff mode)\\n' + p.name + ' (' + p.phone + '):\\n' + String(p.message || '').slice(0, 500), template: 'HANDOFF_FORWARD', related_id: p.phone } }];"
  },
  "csc-25.json": {
    "Audit Research": "const p = $('Parse Research').first().json;\nreturn [{ json: { event_type: 'UNKNOWN_SERVICE_RESEARCH', actor: 'AI', phone: p.phone, payload: JSON.stringify({ message: p.user_message, detected: p.ai.detected_service }) } }];"
  }
};

let count = 0;
for (const [file, preps] of Object.entries(PREPS)) {
  const wf = JSON.parse(readFileSync(dir + file, "utf8"));
  const nodeByName = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
  for (const [target, codeStr] of Object.entries(preps)) {
    if (!nodeByName[target]) { console.log("skip (missing target):", file, target); continue; }
    const prepName = "Prep " + target.replace(/^Run /, "");
    if (nodeByName[prepName]) { console.log("already:", prepName); continue; }
    const pos = nodeByName[target].position;
    wf.nodes.push({
      parameters: { mode: "runOnceForAllItems", jsCode: codeStr },
      name: prepName, type: "n8n-nodes-base.code", typeVersion: 2,
      position: [(pos[0] || 0) - 120, pos[1] || 0]
    });
    // rewire: anything pointing to target now points to prep
    for (const [from, tv] of Object.entries(wf.connections)) {
      for (const [type, groups] of Object.entries(tv)) {
        for (let gi = 0; gi < groups.length; gi++) {
          for (let ci = 0; ci < groups[gi].length; ci++) {
            if (groups[gi][ci] && groups[gi][ci].node === target && from !== prepName) {
              groups[gi][ci].node = prepName;
            }
          }
        }
      }
    }
    // prep -> target
    if (!wf.connections[prepName]) wf.connections[prepName] = {};
    wf.connections[prepName]["main"] = [[c(target)]];
    count++;
    console.log("added:", file, "->", prepName);
  }
  writeFileSync(dir + file, JSON.stringify(wf, null, 1));
}
console.log("TOTAL prep nodes added:", count);
