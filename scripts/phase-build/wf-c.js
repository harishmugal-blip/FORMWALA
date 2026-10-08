// Build CSC 08 Document Collector, CSC 09 OCR Extractor, CSC 12 Payment Initiator, CSC 13 Payment Verifier
import { buildWorkflow, writeJson, triggerSub, code, dtGet, dtInsert, dtUpdate, dtUpsert, ifNode, eq, isEmpty, notEmpty, notEq, exwf, link, mergeConn, webhookNode, respond, http, cryptoNode, WF } from "./lib.js";

const DIR = "/home/z/my-project/scripts/phase-build/json/";

// ============ CSC 08 - DOCUMENT COLLECTOR ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(dtGet("Get Conv State", "conversation_state", "phone", "={{ $json.phone }}"));
  nodes.push(code("Compute", `
const input = $('Trigger').first().json;
const state = $('Get Conv State').first().json || {};
let ctx = {};
try { ctx = JSON.parse(state.context_data || '{}'); } catch (e) {}
const phone = input.phone;
const media = input.media || null;
const text = String(input.message || '').trim();
if ((state.state || '') !== 'DOCS') {
  return [{ json: { next: 'not_docs', phone, text } }];
}
return [{ json: { next: 'in_docs', phone, media, text, application_id: ctx.application_id, service_id: state.service_id } }];`));

  nodes.push(ifNode("In Docs?", [eq("={{ $json.next }}", "in_docs")]));
  // FALSE: not in docs
  nodes.push(code("Not Docs Reply", `
const j = $json;
return [{ json: { reply: 'Filhaal documents ki zaroorat nahi. Service ke naam se naya kaam shuru karein ya STATUS likhein.', phone: j.phone } }];`));

  // TRUE: load config + saved docs
  nodes.push(exwf("Load Config", WF[5], {
    parameters: {
      source: "database", workflowId: WF[5],
      workflowInputs: { mappingMode: "defineBelow", value: { action: "get_full_config", service_id: "={{ $('Compute').first().json.service_id }}" } }
    }
  }));
  nodes.push(dtGet("Get Saved Docs", "application_documents", "application_id", "={{ $('Compute').first().json.application_id }}", { returnAll: true }));
  nodes.push(code("Match Next Doc", `
const cfg = $('Load Config').first().json || {};
const cs = $('Compute').first().json;
const required = cfg.documents || [];
let saved = [];
try { saved = $('Get Saved Docs').all().map(i => i.json); } catch (e) {}
const savedKeys = saved.map(d => d.doc_key);
const missing = required.filter(d => !savedKeys.includes(d.doc_key));
const allDone = missing.length === 0;
const hasMedia = !!(cs.media && cs.media.id);
return [{ json: { allDone, hasMedia, missing, nextDoc: missing[0] || null, savedCount: saved.length, phone: cs.phone, application_id: cs.application_id, media: cs.media, text: cs.text, service: cfg.service || {} } }];`));

  nodes.push(ifNode("All Docs Already?", [eq("={{ $json.allDone }}", "true")]));
  // TRUE -> straight to payment
  nodes.push(code("Go Payment", `
const m = $json;
return [{ json: { action: 'finalize_docs', phone: m.phone, application_id: m.application_id, service_id: m.service.service_id || '' } }];`));
  // FALSE -> has media?
  nodes.push(ifNode("Has Media?", [eq("={{ $json.hasMedia }}", "true")]));
  // FALSE media + text -> remind next doc
  nodes.push(code("Remind Next Doc", `
const m = $json;
const d = m.nextDoc;
let msg;
if (d) {
  msg = '\\ud83d\\udcc4 Agla document: \"' + (d.label || d.doc_key) + '\"\\n' + (d.question || 'Photo/PDF bhejein.') + '\\n\\n(' + m.savedCount + '/' + (m.savedCount + m.missing.length) + ' documents mil gaye)';
} else {
  msg = 'Documents receive ho gaye, processing mein hai...';
}
return [{ json: { reply: msg, phone: m.phone } }];`));
  // TRUE media -> save doc
  nodes.push(dtInsert("Save Doc", "application_documents", {
    application_id: "={{ $('Match Next Doc').first().json.application_id }}",
    phone: "={{ $('Match Next Doc').first().json.phone }}",
    doc_key: "={{ $('Match Next Doc').first().json.nextDoc.doc_key }}",
    media_id: "={{ $('Match Next Doc').first().json.media.id }}",
    mime_type: "={{ $('Match Next Doc').first().json.media.mime || '' }}",
    ocr_text: "",
    status: "RECEIVED",
    created_at: "={{ $now.toISO() }}",
    verified_by: "CUSTOMER"
  }));
  nodes.push(exwf("Run OCR", WF[9], {
    parameters: {
      source: "database", workflowId: WF[9],
      workflowInputs: { mappingMode: "defineBelow", value: {
        media_id: "={{ $('Match Next Doc').first().json.media.id }}",
        mime_type: "={{ $('Match Next Doc').first().json.media.mime || '' }}",
        application_id: "={{ $('Match Next Doc').first().json.application_id }}",
        doc_key: "={{ $('Match Next Doc').first().json.nextDoc.doc_key }}"
      } }
    },
    onError: "continueRegularOutput"
  }));
  nodes.push(code("Update Doc Locally", `
const ocr = $json || {};
const m = $('Match Next Doc').first().json;
const remaining = m.missing.length - 1;
return [{ json: { ocr_note: ocr.ocr_text ? 'OCR done' : (ocr.note || 'OCR skipped'), remaining, savedCount: m.savedCount + 1, total: m.savedCount + m.missing.length, phone: m.phone, application_id: m.application_id } }];`));
  nodes.push(dtUpdate("Store OCR Text", "application_documents", "media_id", "={{ $('Match Next Doc').first().json.media.id }}", {
    ocr_text: "={{ $('Run OCR').first().json.ocr_text || '' }}",
    status: "RECEIVED",
    verified_by: "CUSTOMER"
  }));
  nodes.push(ifNode("More Docs Left?", [eq("={{ $json.remaining }}", "0")]));
  // true = 0 remaining -> payment ; false -> ask next
  nodes.push(code("Next Doc Ask", `
const u = $json;
const m = $('Match Next Doc').first().json;
const savedKeys = [];
return [{ json: { reply: '\\u2705 Document mil gaya (' + u.savedCount + '/' + u.total + ').\\n\\nAgla document bhejein. Kaam ho jaye to kuch na type karein - main khud aage badha dunga.', phone: u.phone } }];`));

  // payment path (shared): Get Pricing -> Init Payment -> message
  nodes.push(dtUpdate("Set State Payment", "conversation_state", "phone", "={{ $json.phone }}", {
    state: "PAYMENT",
    updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(exwf("Get Pricing", WF[11], {
    parameters: {
      source: "database", workflowId: WF[11],
      workflowInputs: { mappingMode: "defineBelow", value: { service_id: "={{ $('Go Payment').first().json.service_id || $('Match Next Doc').first().json.service.service_id }}" } }
    }
  }));
  nodes.push(exwf("Init Payment", WF[12], {
    parameters: {
      source: "database", workflowId: WF[12],
      workflowInputs: { mappingMode: "defineBelow", value: {
        application_id: "={{ $('Go Payment').first().json.application_id || $('Match Next Doc').first().json.application_id }}",
        phone: "={{ $('Go Payment').first().json.phone || $('Match Next Doc').first().json.phone }}",
        service_id: "={{ $('Get Pricing').first().json.service_id }}",
        total: "={{ $('Get Pricing').first().json.total }}",
        gov_fee: "={{ $('Get Pricing').first().json.gov_fee }}",
        service_charge: "={{ $('Get Pricing').first().json.service_charge }}",
        gst: "={{ $('Get Pricing').first().json.gst }}"
      } }
    }
  }));

  // connections
  mergeConn(C, link("Trigger", "Get Conv State"));
  mergeConn(C, link("Get Conv State", "Compute"));
  mergeConn(C, link("Compute", "In Docs?"));
  mergeConn(C, { "In Docs?": { main: [[{ node: "Load Config", type: "main", index: 0 }], [{ node: "Not Docs Reply", type: "main", index: 0 }]] } });
  mergeConn(C, link("Load Config", "Get Saved Docs"));
  mergeConn(C, link("Get Saved Docs", "Match Next Doc"));
  mergeConn(C, link("Match Next Doc", "All Docs Already?"));
  mergeConn(C, { "All Docs Already?": { main: [[{ node: "Go Payment", type: "main", index: 0 }], [{ node: "Has Media?", type: "main", index: 0 }]] } });
  mergeConn(C, { "Has Media?": { main: [[{ node: "Save Doc", type: "main", index: 0 }], [{ node: "Remind Next Doc", type: "main", index: 0 }]] } });
  mergeConn(C, link("Save Doc", "Run OCR"));
  mergeConn(C, link("Run OCR", "Update Doc Locally"));
  mergeConn(C, link("Update Doc Locally", "Store OCR Text"));
  mergeConn(C, link("Store OCR Text", "More Docs Left?"));
  // both completion paths join into Set State Payment
  mergeConn(C, { "More Docs Left?": { main: [[{ node: "Set State Payment", type: "main", index: 0 }], [{ node: "Next Doc Ask", type: "main", index: 0 }]] } });
  mergeConn(C, link("Go Payment", "Set State Payment"));
  mergeConn(C, link("Set State Payment", "Get Pricing"));
  mergeConn(C, link("Get Pricing", "Init Payment"));

  writeJson(DIR + "csc-08.json", buildWorkflow(WF[8], "CSC 08 - Document Collector", nodes, C));
}

// ============ CSC 09 - OCR EXTRACTOR ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(dtGet("Get WA Token", "system_config", "config_key", "=WHATSAPP_ACCESS_TOKEN"));
  nodes.push(code("Check Token", `
const cfg = $('Get WA Token').first().json || {};
const token = cfg.config_value || '';
const input = $json;
const valid = token && token !== 'SET_YOUR_WABA_TOKEN';
return [{ json: { valid, token, media_id: input.media_id, mime_type: input.mime_type || 'image/jpeg', application_id: input.application_id, doc_key: input.doc_key } }];`));
  nodes.push(ifNode("Token OK?", [eq("={{ $json.valid }}", "true")]));
  // FALSE: skip
  nodes.push(code("OCR Skipped", `
const j = $json;
return [{ json: { ocr_text: '', note: 'OCR skipped - WhatsApp token configured nahi hai. Operator manually verify karega.', doc_key: j.doc_key } }];`));
  // TRUE: download media
  nodes.push(dtGet("Get API Version", "system_config", "config_key", "=WHATSAPP_API_VERSION"));
  nodes.push(http("Get Media URL", {
    url: "=https://graph.facebook.com/={{ $('Get API Version').first().json.config_value || 'v21.0' }}/{{ $('Check Token').first().json.media_id }}",
    sendHeaders: true, headerParameters: { parameters: [{ name: "Authorization", value: "=Bearer {{ $('Check Token').first().json.token }}" }] },
    options: { response: { response: { neverError: true } } }
  }, { onError: "continueRegularOutput" }));
  nodes.push(http("Download Media", {
    url: "={{ $json.url || '' }}",
    sendHeaders: true, headerParameters: { parameters: [{ name: "Authorization", value: "=Bearer {{ $('Check Token').first().json.token }}" }] },
    options: { response: { response: { responseFormat: "file", neverError: true } } }
  }, { onError: "continueRegularOutput" }));
  nodes.push(code("Build Vision Prompt", `
const t = $('Check Token').first().json;
const hasBinary = !!(($binary && $binary.data) || ($input.item?.binary && $input.item.binary.data));
if (!hasBinary) return [{ json: { skip: true, doc_key: t.doc_key, note: 'Media download fail - OCR skipped', ocr_text: '' } }];
return [{ json: { skip: false, doc_key: t.doc_key, prompt: 'Ye Indian government document ka photo hai (' + t.doc_key + '). Isme se saari text details nikaal kar simple text mein likho. Sirf text do, koi explanation nahi.' } }];`));
  nodes.push(http("OpenRouter Vision OCR", {
    method: "POST",
    url: "https://openrouter.ai/api/v1/chat/completions",
    authentication: "predefinedCredentialType",
    nodeCredentialType: "openRouterApi",
    sendBody: true, specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ model: 'meta-llama/llama-3.2-11b-vision-instruct:free', max_tokens: 600, messages: [ { role: 'user', content: [ { type: 'text', text: $json.prompt }, { type: 'image_url', image_url: { url: 'data:{{ $('Check Token').first().json.mime_type }};base64,' + ($binary ? $binary.data.toString('base64') : '') } } ] } ] }) }}`,
    options: { response: { response: { neverError: true } }, timeout: 60000 }
  }, { onError: "continueRegularOutput" }));
  nodes.push(code("Parse OCR", `
const r = $json;
let text = '';
try { text = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content || ''; } catch (e) {}
const skip = $('Build Vision Prompt').first().json.skip;
return [{ json: { ocr_text: String(text).slice(0, 4000), note: skip ? 'skipped' : (text ? 'ok' : 'ocr-failed'), doc_key: $('Check Token').first().json.doc_key } }];`));

  mergeConn(C, link("Trigger", "Get WA Token"));
  mergeConn(C, link("Get WA Token", "Check Token"));
  mergeConn(C, link("Check Token", "Token OK?"));
  mergeConn(C, { "Token OK?": { main: [[{ node: "Get API Version", type: "main", index: 0 }], [{ node: "OCR Skipped", type: "main", index: 0 }]] } });
  mergeConn(C, link("Get API Version", "Get Media URL"));
  mergeConn(C, link("Get Media URL", "Download Media"));
  mergeConn(C, link("Download Media", "Build Vision Prompt"));
  mergeConn(C, link("Build Vision Prompt", "OpenRouter Vision OCR"));
  mergeConn(C, link("OpenRouter Vision OCR", "Parse OCR"));
  writeJson(DIR + "csc-09.json", buildWorkflow(WF[9], "CSC 09 - OCR Extractor (AI Vision)", nodes, C));
}

// ============ CSC 12 - PAYMENT INITIATOR ============
{
  const nodes = [];
  const C = {};
  nodes.push(triggerSub("Trigger"));
  nodes.push(dtGet("Get All Config", "system_config", "config_key", "=PAYMENT_MODE", { returnAll: true }));
  nodes.push(code("Config Map", `
const rows = $input.all().map(i => i.json);
const cfg = {};
for (const r of rows) cfg[r.config_key] = r.config_value;
const mode = (cfg.PAYMENT_MODE || 'MOCK').toUpperCase();
const t = $('Trigger').first().json;
return [{ json: {
  mode,
  rzp_key: cfg.RAZORPAY_KEY_ID || '',
  rzp_secret: cfg.RAZORPAY_KEY_SECRET || '',
  application_id: t.application_id, phone: t.phone, service_id: t.service_id,
  total: Number(t.total || 0), gov_fee: Number(t.gov_fee || 0), service_charge: Number(t.service_charge || 0), gst: Number(t.gst || 0)
} }];`));
  nodes.push(dtInsert("Create Payment Record", "payments", {
    payment_id: "={{ 'PAY' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase() }}",
    application_id: "={{ $json.application_id }}",
    customer_phone: "={{ $json.phone }}",
    amount: "={{ $json.total }}",
    gateway: "={{ $json.mode === 'MOCK' ? 'MOCK' : 'RAZORPAY' }}",
    status: "INITIATED",
    created_at: "={{ $now.toISO() }}",
    paid_at: ""
  }));
  nodes.push(code("Build Payment Info", `
const cm = $('Config Map').first().json;
const pay = $('Create Payment Record').first().json;
const info = {
  mode: cm.mode, rzp_key: cm.rzp_key, rzp_secret: cm.rzp_secret,
  payment_id: pay.payment_id || pay.id, application_id: cm.application_id, phone: cm.phone, service_id: cm.service_id,
  total: cm.total, gov_fee: cm.gov_fee, service_charge: cm.service_charge, gst: cm.gst
};
if (cm.mode !== 'MOCK' && cm.rzp_key && cm.rzp_secret) info.use_razorpay = true;
else info.use_razorpay = false;
return [{ json: info }];`));
  nodes.push(ifNode("Razorpay?", [eq("={{ $json.use_razorpay }}", "true")]));
  // TRUE: create razorpay order
  nodes.push(http("Create RZP Order", {
    method: "POST",
    url: "https://api.razorpay.com/v1/orders",
    authentication: "genericCredentialType",
    genericAuthType: "httpBasicAuth",
    sendBody: true, specifyBody: "json",
    jsonBody: `={{ JSON.stringify({ amount: Math.round($('Build Payment Info').first().json.total * 100), currency: 'INR', receipt: $('Build Payment Info').first().json.application_id, notes: { application_id: $('Build Payment Info').first().json.application_id, phone: $('Build Payment Info').first().json.phone } }) }}`,
    options: { response: { response: { neverError: true } }, timeout: 30000 }
  }, { onError: "continueRegularOutput" }));
  nodes.push(code("RZP Link", `
const order = $json;
const info = $('Build Payment Info').first().json;
if (!order.id) {
  return [{ json: { ...info, payment_url: '', rzp_fail: true, order_id: '' } }];
}
return [{ json: { ...info, order_id: order.id, rzp_fail: false } }];`));
  // FALSE: mock link
  nodes.push(code("Mock Link", `
const info = $json;
const am = info.total;
const upi = 'upi://pay?pa=cscsmartseva@upi&pn=CSC%20Smart%20Seva&am=' + am + '&cu=INR&tn=' + encodeURIComponent(info.application_id);
return [{ json: { ...info, payment_url: upi, order_id: '', rzp_fail: false, mock: true } }];`));
  nodes.push(code("Payment Message", `
const info = $json;
let msg = '\\ud83d\\udcb3 *Payment Link* - ' + (info.service_id || '') + '\\n\\n';
msg += '\\ud83d\\udcc4 Application ID: ' + info.application_id + '\\n';
msg += '\\ud83d\\udcb0 Amount: Rs ' + info.total + '\\n';
msg += '   (Govt fee: Rs ' + info.gov_fee + ' + Service: Rs ' + info.service_charge + ' + GST: Rs ' + info.gst + ')\\n\\n';
if (info.rzp_fail) {
  msg += '\\u26a0\\ufe0f Payment gateway error. Operator aapse jaldi contact karega.\\nHUMAN likhkar baat kar sakte hain.';
} else if (info.mock) {
  msg += 'Ye TEST MODE link hai:\\n' + info.payment_url + '\\n\\n';
  msg += 'Payment ke baad automatic verification hogi (webhook). Agar 10 minute mein status update na ho to STATUS likhein.\\n\\n';
  msg += '\\u26a0\\ufe0f Note: Payment sirf official link se karein. Screenshot par bharosa na karein.';
} else {
  msg += 'Payment yahan se karein:\\n' + (info.payment_url || info.order_id) + '\\n\\nPayment ke baad status automatic update hoga.';
}
return [{ json: { reply: msg, phone: info.phone, payment_id: info.payment_id } }];`));

  mergeConn(C, link("Trigger", "Get All Config"));
  mergeConn(C, link("Get All Config", "Config Map"));
  mergeConn(C, link("Config Map", "Create Payment Record"));
  mergeConn(C, link("Create Payment Record", "Build Payment Info"));
  mergeConn(C, link("Build Payment Info", "Razorpay?"));
  mergeConn(C, { "Razorpay?": { main: [[{ node: "Create RZP Order", type: "main", index: 0 }], [{ node: "Mock Link", type: "main", index: 0 }]] } });
  mergeConn(C, link("Create RZP Order", "RZP Link"));
  mergeConn(C, link("Mock Link", "Payment Message"));
  mergeConn(C, link("RZP Link", "Payment Message"));
  writeJson(DIR + "csc-12.json", buildWorkflow(WF[12], "CSC 12 - Payment Initiator", nodes, C));
}

// ============ CSC 13 - PAYMENT VERIFIER (Razorpay webhook, server-side HMAC) ============
{
  const nodes = [];
  const C = {};
  nodes.push(webhookNode("Payment Webhook", "payment-verify", "POST", { parameters: { httpMethod: "POST", path: "payment-verify", responseMode: "responseNode", options: { rawBody: true } } }));
  nodes.push(code("Extract Signature", `
const raw = $json.rawBody || (typeof $json.body === 'string' ? $json.body : JSON.stringify($json.body || {}));
const headers = $json.headers || {};
const sig = headers['x-razorpay-signature'] || '';
let event = {};
try { event = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
const eventType = event.event || event.type || 'unknown';
return [{ json: { raw: typeof raw === 'string' ? raw : JSON.stringify(raw), sig, eventType, event, headers } }];`));
  nodes.push(dtGet("Get Webhook Secret", "system_config", "config_key", "=RAZORPAY_WEBHOOK_SECRET"));
  nodes.push(cryptoNode("Compute HMAC", {
    action: "hmac", binaryData: false, type: "SHA256",
    value: "={{ $('Extract Signature').first().json.raw }}",
    secret: "={{ $json.config_value || 'csc_webhook_secret_2026' }}",
    dataEncoding: "utf8", encoding: "hex"
  }));
  nodes.push(code("Compare Sig", `
const computed = String($json.data || $json.encodedData || '').toLowerCase();
const provided = String($('Extract Signature').first().json.sig || '').toLowerCase();
return [{ json: { valid: !!provided && computed === provided, computed, provided: provided, eventType: $('Extract Signature').first().json.eventType } }];`));
  nodes.push(ifNode("Signature Valid?", [eq("={{ $json.valid }}", "true")]));
  // INVALID
  nodes.push(dtInsert("Log Invalid Attempt", "payment_events", {
    event_id: "={{ 'EVT' + Date.now().toString(36).toUpperCase() }}",
    application_id: "",
    gateway: "RAZORPAY",
    event_type: "={{ $('Extract Signature').first().json.eventType }}",
    payload: "={{ JSON.stringify($('Extract Signature').first().json.event).slice(0, 2000) }}",
    signature_valid: "FALSE",
    created_at: "={{ $now.toISO() }}"
  }));
  nodes.push(respond("Respond 401", { respondWith: "json", responseBody: "={ \"status\": \"invalid signature\" }", options: { responseCode: 401 } }));
  // VALID
  nodes.push(dtInsert("Log Payment Event", "payment_events", {
    event_id: "={{ 'EVT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase() }}",
    application_id: "={{ $('Extract Signature').first().json.event.payload && $('Extract Signature').first().json.event.payload.payment ? ($('Extract Signature').first().json.event.payload.payment.notes.application_id || '') : '' }}",
    gateway: "RAZORPAY",
    event_type: "={{ $('Extract Signature').first().json.eventType }}",
    payload: "={{ JSON.stringify($('Extract Signature').first().json.event).slice(0, 3000) }}",
    signature_valid: "TRUE",
    created_at: "={{ $now.toISO() }}"
  }));
  nodes.push(code("Parse Payment", `
const ev = $('Extract Signature').first().json.event;
const p = ev.payload || {};
const payment = p.payment || {};
const entity = payment.entity || {};
const notes = entity.notes || {};
const application_id = notes.application_id || entity.notes?.application_id || '';
const accepted = ['payment.captured', 'order.paid'];
return [{ json: {
  application_id,
  transaction_id: entity.id || '',
  amount: entity.amount ? entity.amount / 100 : 0,
  eventType: ev.event || '',
  process: accepted.includes(ev.event || '') && !!application_id,
  phone: notes.phone || ''
} }];`));
  nodes.push(ifNode("Process This Event?", [eq("={{ $json.process }}", "true")]));
  nodes.push(code("Skip Event", `
return [{ json: { status: 'ignored', eventType: $json.eventType } }];`));
  nodes.push(dtGet("Get Payment Row", "payments", "application_id", "={{ $json.application_id }}"));
  nodes.push(ifNode("Already Paid?", [eq("={{ $json.status }}", "PAID")]));
  nodes.push(code("Dup Skipped", `
return [{ json: { status: 'already-processed', application_id: $('Parse Payment').first().json.application_id } }];`));
  nodes.push(dtUpdate("Mark Payment Paid", "payments", "application_id", "={{ $('Parse Payment').first().json.application_id }}", {
    status: "PAID",
    transaction_id: "={{ $('Parse Payment').first().json.transaction_id }}",
    paid_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtUpdate("Mark App Paid", "applications", "application_id", "={{ $('Parse Payment').first().json.application_id }}", {
    status: "PAID",
    updated_at: "={{ $now.toISO() }}"
  }));
  nodes.push(dtGet("Get App Row", "applications", "application_id", "={{ $('Parse Payment').first().json.application_id }}"));
  nodes.push(dtInsert("Status History Paid", "application_status_history", {
    application_id: "={{ $('Parse Payment').first().json.application_id }}",
    application_number: "={{ $('Get App Row').first().json.application_number || '' }}",
    old_status: "PAYMENT_PENDING",
    new_status: "PAID",
    note: "Payment verified via Razorpay webhook (server-side HMAC)",
    created_at: "={{ $now.toISO() }}"
  }));
  nodes.push(exwf("Finalize Application", WF[14], {
    parameters: {
      source: "database", workflowId: WF[14],
      workflowInputs: { mappingMode: "defineBelow", value: {
        action: "finalize",
        application_id: "={{ $('Parse Payment').first().json.application_id }}"
      } }
    }
  }));
  nodes.push(exwf("Send Receipt", WF[15], {
    parameters: {
      source: "database", workflowId: WF[15],
      workflowInputs: { mappingMode: "defineBelow", value: {
        phone: "={{ $('Get App Row').first().json.customer_phone }}",
        application_number: "={{ $('Finalize Application').first().json.application_number }}",
        application_id: "={{ $('Parse Payment').first().json.application_id }}",
        total: "={{ $('Get App Row').first().json.total_fee }}",
        gov_fee: "={{ $('Get App Row').first().json.gov_fee }}",
        service_charge: "={{ $('Get App Row').first().json.service_charge }}",
        gst: "={{ $('Get App Row').first().json.gst }}",
        transaction_id: "={{ $('Parse Payment').first().json.transaction_id }}"
      } }
    }
  }));
  nodes.push(exwf("Dispatch Operator", WF[16], {
    parameters: {
      source: "database", workflowId: WF[16],
      workflowInputs: { mappingMode: "defineBelow", value: {
        application_id: "={{ $('Parse Payment').first().json.application_id }}",
        application_number: "={{ $('Finalize Application').first().json.application_number }}",
        customer_phone: "={{ $('Get App Row').first().json.customer_phone }}",
        service_id: "={{ $('Get App Row').first().json.service_id }}",
        total: "={{ $('Get App Row').first().json.total_fee }}"
      } }
    }
  }));
  nodes.push(respond("Respond OK", { respondWith: "json", responseBody: "={ \"status\": \"processed\" }" }));

  mergeConn(C, link("Payment Webhook", "Extract Signature"));
  mergeConn(C, link("Extract Signature", "Get Webhook Secret"));
  mergeConn(C, link("Get Webhook Secret", "Compute HMAC"));
  mergeConn(C, link("Compute HMAC", "Compare Sig"));
  mergeConn(C, link("Compare Sig", "Signature Valid?"));
  mergeConn(C, { "Signature Valid?": { main: [[{ node: "Log Payment Event", type: "main", index: 0 }], [{ node: "Log Invalid Attempt", type: "main", index: 0 }]] } });
  mergeConn(C, link("Log Invalid Attempt", "Respond 401"));
  mergeConn(C, link("Log Payment Event", "Parse Payment"));
  mergeConn(C, link("Parse Payment", "Process This Event?"));
  mergeConn(C, { "Process This Event?": { main: [[{ node: "Get Payment Row", type: "main", index: 0 }], [{ node: "Skip Event", type: "main", index: 0 }]] } });
  mergeConn(C, link("Get Payment Row", "Already Paid?"));
  mergeConn(C, { "Already Paid?": { main: [[{ node: "Mark Payment Paid", type: "main", index: 0 }], [{ node: "Dup Skipped", type: "main", index: 0 }]] } });
  mergeConn(C, link("Mark Payment Paid", "Mark App Paid"));
  mergeConn(C, link("Mark App Paid", "Get App Row"));
  mergeConn(C, link("Get App Row", "Status History Paid"));
  mergeConn(C, link("Status History Paid", "Finalize Application"));
  mergeConn(C, link("Finalize Application", "Send Receipt"));
  mergeConn(C, link("Send Receipt", "Dispatch Operator"));
  mergeConn(C, link("Dispatch Operator", "Respond OK"));
  writeJson(DIR + "csc-13.json", buildWorkflow(WF[13], "CSC 13 - Payment Verifier (Webhook + HMAC)", nodes, C));
}

console.log("BUILD GROUP 2 DONE (08, 09, 12, 13)");
