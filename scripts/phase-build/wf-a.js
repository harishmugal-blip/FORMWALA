// Build CSC 05 (SERVICE ENGINE), CSC 07 (Input Validator), CSC 11 (Pricing Engine)
import { buildWorkflow, writeJson, triggerSub, code, dtGet, dtUpsert, eq, ifNode, link, mergeConn, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";

// ============ CSC 05 - SERVICE ENGINE (central config resolver) ============
{
  const nodes = [];
  nodes.push(triggerSub("Trigger"));
  // Branch A: list_services. Branch B: get_full_config / get_pricing (service_id based)
  nodes.push(code("Route Action", `
const action = $json.action || 'get_full_config';
const service_id = $json.service_id || '';
return [{ json: { action, service_id, input: $json } }];`));

  nodes.push(ifNode("List or Config?", [
    { leftValue: "={{ $json.action }}", rightValue: "list_services", operator: { type: "string", operation: "equals" } }
  ]));

  // FALSE branch (config path): sequential gets
  nodes.push(dtGet("Get Service Row", "service_catalog", "service_id", "={{ $('Route Action').first().json.service_id }}"));
  nodes.push(dtGet("Get Fields", "service_fields", "service_id", "={{ $('Route Action').first().json.service_id }}", { returnAll: true }));
  nodes.push(dtGet("Get Docs", "service_documents", "service_id", "={{ $('Route Action').first().json.service_id }}", { returnAll: true }));
  nodes.push(dtGet("Get Pricing Row", "service_pricing", "service_id", "={{ $('Route Action').first().json.service_id }}"));

  nodes.push(code("Build Full Config", `
const action = $('Route Action').first().json.action;
const input = $('Route Action').first().json.input;
let service = {};
try { service = $('Get Service Row').first().json || {}; } catch (e) {}
let fields = [], docs = [];
try { fields = $('Get Fields').all().map(i => i.json); } catch (e) {}
try { docs = $('Get Docs').all().map(i => i.json); } catch (e) {}
let pricing = {};
try { pricing = $('Get Pricing Row').first().json || {}; } catch (e) {}
fields.sort((a, b) => (a.field_order || 0) - (b.field_order || 0));
docs.sort((a, b) => (a.doc_order || 0) - (b.doc_order || 0));
let processing_steps = [];
try { processing_steps = JSON.parse(service.processing_steps || '[]'); } catch (e) {}
const payload = { ok: !!service.service_id, action, service, fields, documents: docs, pricing, processing_steps };
if (action === 'get_pricing') return [{ json: { ok: !!pricing.service_id, action, pricing: { gov_fee: pricing.gov_fee || 0, service_charge: pricing.service_charge || 0, gst_percent: pricing.gst_percent || 0, gst_amount: pricing.gst_amount || 0, total_fee: pricing.total_fee || 0 }, input } }];
return [{ json: payload }];`));

  // TRUE branch (list path)
  nodes.push({
    parameters: {
      resource: "row", operation: "get",
      dataTableId: { __rl: true, mode: "name", value: "service_catalog" },
      matchType: "allConditions",
      filters: { conditions: [{ keyName: "active", condition: "eq", keyValue: "TRUE" }] },
      returnAll: true
    },
    name: "Get All Services", type: "n8n-nodes-base.dataTable", typeVersion: 1.1, position: [0, 0]
  });
  nodes.push(code("Build Service List", `
const rows = $input.all().map(i => i.json);
const list = rows.map(s => ({ service_id: s.service_id, service_name: s.service_name, category: s.category, description: s.description, total_fee: s.total_fee, gov_fee: s.government_fee, service_charge: s.service_charge }));
return [{ json: { ok: true, action: 'list_services', services: list, catalog: list } }];`));

  const C = {};
  mergeConn(C, link("Trigger", "Route Action"));
  mergeConn(C, link("Route Action", "List or Config?"));
  mergeConn(C, { "List or Config?": { main: [[{ node: "Build Service List", type: "main", index: 0 }], [{ node: "Get Service Row", type: "main", index: 0 }]] } });
  for (const [a, b] of [["Get Service Row", "Get Fields"], ["Get Fields", "Get Docs"], ["Get Docs", "Get Pricing Row"], ["Get Pricing Row", "Build Full Config"]]) {
    mergeConn(C, link(a, b));
  }
  writeJson(DIR + "csc-05.json", buildWorkflow(WF[5], "CSC 05 - Service Engine (Central Config)", nodes, C));
}

// ============ CSC 07 - INPUT VALIDATOR ============
{
  const nodes = [
    triggerSub("Trigger"),
    code("Validate Field", `
const inp = $json;
const type = (inp.field_type || 'TEXT').toUpperCase();
const raw = (inp.value === undefined || inp.value === null) ? '' : String(inp.value).trim();
const value = raw;
const label = inp.field_label || inp.field_key || 'Field';
const hint = inp.error_hint || '';
const up = value.toUpperCase();
const allowSkip = inp.allow_skip !== false;
function ok(normalized) { return [{ json: { valid: true, normalized, field_key: inp.field_key, field_type: type } }]; }
function bad(msg) { return [{ json: { valid: false, error: msg || hint || (label + ' sahi nahi hai. Dobara try karein.'), field_key: inp.field_key, field_type: type } }]; }
if (up === 'CANCEL') return [{ json: { valid: true, normalized: 'CANCEL', field_key: inp.field_key, field_type: 'CONTROL' } }];
if (up === 'SKIP' && allowSkip) return ok('SKIP');
switch (type) {
  case 'MOBILE': {
    const digits = value.replace(/\\D/g, '');
    if (/^[6-9]\\d{9}$/.test(digits)) return ok(digits);
    return bad('10 digit ka valid mobile number likhein (6-9 se shuru).');
  }
  case 'EMAIL': {
    if (/^[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}$/.test(value)) return ok(value.toLowerCase());
    return bad('Email format galat hai. Jaise: name@gmail.com');
  }
  case 'PAN': {
    if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(up)) return ok(up);
    return bad('PAN 10 character ka hota hai, jaise ABCPD1234F.');
  }
  case 'GSTIN': {
    if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(up)) return ok(up);
    return bad('GSTIN 15 character ka hota hai. Agar nahi hai to SKIP likhein.');
  }
  case 'AADHAAR': {
    const digits = value.replace(/[\\s-]/g, '').replace(/\\D/g, '');
    if (/^[0-9]{12}$/.test(digits) && !/^(.)\\1{11}$/.test(digits)) return ok(digits);
    return bad('12 digit ka Aadhaar number likhein (sirf digits).');
  }
  case 'PINCODE': {
    if (/^[1-9][0-9]{5}$/.test(value)) return ok(value);
    return bad('6 digit ka valid PIN code likhein.');
  }
  case 'DOB': {
    const m = value.match(/^(\\d{1,2})[-\\/](\\d{1,2})[-\\/](\\d{4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0'), yyyy = m[3];
      const dt2 = new Date(yyyy + '-' + mm + '-' + dd);
      if (dt2 && dt2.getDate() === Number(dd) && dt2.getMonth() === Number(mm) - 1 && dt2.getFullYear() >= 1900) return ok(dd + '/' + mm + '/' + yyyy);
    }
    return bad('Date aise likhein: DD/MM/YYYY (jaise 15/08/1998).');
  }
  case 'EPIC': {
    if (/^[A-Z]{3}[0-9]{7}$/.test(up)) return ok(up);
    return bad('Voter ID aise hota hai: ABC1234567 (3 letters + 7 digits).');
  }
  case 'ACCOUNT': {
    const d = value.replace(/[\\s-]/g, '');
    if (/^[0-9]{9,18}$/.test(d)) return ok(d);
    return bad('Bank account number 9 se 18 digit ka hota hai.');
  }
  case 'IFSC': {
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(up)) return ok(up);
    return bad('IFSC aise hota hai: SBIN0001234.');
  }
  case 'NUMBER': {
    const n = value.replace(/[,.\\s]/g, '');
    if (/^\\d+(\\.\\d+)?$/.test(n)) return ok(String(Number(n)));
    return bad('Sirf number likhein (jaise 180000).');
  }
  case 'CHOICE': {
    const options = (inp.options || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!options.length) return ok(up);
    const found = options.find(o => o.toUpperCase() === up);
    if (found) return ok(found);
    const yes = ['HAAN','HAANJI','YES','Y','OK','HAA','JI','SAHI','THEEK','THIK','1'];
    const no = ['NAHI','NO','N','NA','NAHE','2'];
    if (options.includes('HAAN') && options.includes('NAHI')) {
      if (yes.includes(up)) return ok('HAAN');
      if (no.includes(up)) return ok('NAHI');
    }
    return bad('Inme se ek likhein: ' + options.join(' / '));
  }
  case 'TEXT':
  default: {
    if (value.length >= 2 && value.length <= 500) return ok(value);
    return bad(label + ' thoda detail mein likhein (2-500 characters).');
  }
}`),
    code("Output Result", `
const j = $json;
return [{ json: j }];`)
  ];
  const C = mergeConn(link("Trigger", "Validate Field"), link("Validate Field", "Output Result"));
  writeJson(DIR + "csc-07.json", buildWorkflow(WF[7], "CSC 07 - Input Validator", nodes, C));
}

// ============ CSC 11 - PRICING ENGINE ============
{
  const nodes = [
    triggerSub("Trigger"),
    dtGet("Get Pricing", "service_pricing", "service_id", "={{ $json.service_id }}"),
    code("Compute Price", `
const p = $json;
const input = $('Trigger').first().json;
const gstPct = Number(p.gst_percent || 18);
const govFee = Number(p.gov_fee || 0);
const charge = Number(p.service_charge || 0);
const gst = Math.round(charge * gstPct / 100);
const total = govFee + charge + gst;
return [{ json: { ok: true, service_id: input.service_id, gov_fee: govFee, service_charge: charge, gst_percent: gstPct, gst, total, currency: 'INR', pricing_note: 'Govt fee: Rs ' + govFee + ' + Service charge: Rs ' + charge + ' + GST(' + gstPct + '%): Rs ' + gst + ' = Rs ' + total } }];`)
  ];
  writeJson(DIR + "csc-11.json", buildWorkflow(WF[11], "CSC 11 - Pricing Engine", nodes, mergeConn(link("Trigger", "Get Pricing"), link("Get Pricing", "Compute Price"))));
}
console.log("BUILD GROUP 1 DONE (05, 07, 11)");
