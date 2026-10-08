// CSC Smart Seva - Phase A: create 18 new data tables + seed 14-service config
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const db = new Database("/home/z/.n8n/database.sqlite");
const PROJECT = "VgFtFuDMIJpEbhPr";
const now = new Date().toISOString().replace("T", " ").replace("Z", "").slice(0, 23) + ".000";
const uuid = () => crypto.randomUUID();

function createTable(name, columns) {
  const exists = db.prepare("SELECT id FROM data_table WHERE name = ? AND projectId = ?").get(name, PROJECT);
  if (exists) { console.log("exists: " + name); return; }
  const tid = uuid();
  db.prepare('INSERT INTO data_table (id, name, projectId, createdAt, updatedAt) VALUES (?,?,?,?,?)')
    .run(tid, name, PROJECT, now, now);
  let idx = 0;
  for (const [cname, ctype] of columns) {
    db.prepare('INSERT INTO data_table_column (id, name, type, "index", dataTableId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run(uuid(), cname, ctype, idx++, tid, now, now);
  }
  console.log("created: " + name + " (" + columns.length + " cols)");
}

// ---------- 18 NEW TABLES ----------
createTable("service_catalog", [
  ["service_id","string"],["service_name","string"],["category","string"],["description","string"],
  ["government_fee","number"],["service_charge","number"],["gst_percent","number"],["total_fee","number"],
  ["portal_url","string"],["portal_type","string"],["operator_required","string"],["otp_required","string"],
  ["captcha_required","string"],["status_tracking","string"],["receipt_required","string"],["processing_steps","string"],["active","string"]
]);
createTable("service_fields", [
  ["service_id","string"],["field_key","string"],["field_order","number"],["label","string"],
  ["field_type","string"],["question","string"],["required","string"],["options","string"],["error_hint","string"]
]);
createTable("service_documents", [
  ["service_id","string"],["doc_key","string"],["doc_order","number"],["label","string"],
  ["accepted_types","string"],["question","string"],["required","string"]
]);
createTable("service_pricing", [
  ["service_id","string"],["gov_fee","number"],["service_charge","number"],
  ["gst_percent","number"],["gst_amount","number"],["total_fee","number"],["currency","string"],["active","string"]
]);
createTable("application_field_values", [
  ["application_id","string"],["phone","string"],["field_key","string"],["field_value","string"],
  ["validated","string"],["created_at","string"],["updated_at","string"]
]);
createTable("application_documents", [
  ["application_id","string"],["phone","string"],["doc_key","string"],["media_id","string"],
  ["mime_type","string"],["ocr_text","string"],["status","string"],["created_at","string"],["verified_by","string"]
]);
createTable("application_status_history", [
  ["application_id","string"],["application_number","string"],["old_status","string"],["new_status","string"],
  ["note","string"],["created_at","string"]
]);
createTable("operator_tasks", [
  ["task_id","string"],["application_id","string"],["application_number","string"],
  ["operator_phone","string"],["status","string"],["note","string"],["created_at","string"],["updated_at","string"]
]);
createTable("handoff_queue", [
  ["phone","string"],["name","string"],["reason","string"],["status","string"],
  ["taken_by","string"],["created_at","string"],["resolved_at","string"]
]);
createTable("notifications_log", [
  ["phone","string"],["template","string"],["message","string"],["status","string"],
  ["related_id","string"],["error","string"],["created_at","string"]
]);
createTable("reminders_log", [
  ["phone","string"],["application_id","string"],["reminder_type","string"],
  ["count","number"],["sent_at","string"],["status","string"]
]);
createTable("audit_log", [
  ["event_id","string"],["event_type","string"],["actor","string"],["phone","string"],
  ["application_id","string"],["payload","string"],["created_at","string"]
]);
createTable("receipts", [
  ["receipt_id","string"],["application_id","string"],["application_number","string"],
  ["amount","number"],["payload","string"],["created_at","string"]
]);
createTable("system_config", [
  ["config_key","string"],["config_value","string"],["description","string"],["updated_at","string"]
]);
createTable("payment_events", [
  ["event_id","string"],["application_id","string"],["gateway","string"],["event_type","string"],
  ["payload","string"],["signature_valid","string"],["created_at","string"]
]);
createTable("service_research", [
  ["research_id","string"],["phone","string"],["user_message","string"],["ai_analysis","string"],
  ["proposed_service","string"],["status","string"],["created_at","string"]
]);
createTable("consent_log", [
  ["phone","string"],["consent_type","string"],["consent_text","string"],
  ["granted","string"],["source","string"],["created_at","string"]
]);
createTable("message_log", [
  ["phone","string"],["direction","string"],["message_type","string"],["body","string"],
  ["wa_message_id","string"],["status","string"],["created_at","string"]
]);

// ---------- FIELD DEFINITIONS (Hinglish questions + validation types) ----------
const FIELD_DEFS = {
  full_name:      { label:"Pura Naam", type:"TEXT", q:"Aapka pura naam (Aadhaar/voter ID ke hisaab se) likhein?", hint:"Naam adhura hai. Pura naam likhein, jaise: Ramesh Kumar" },
  father_name:    { label:"Pita ka Naam", type:"TEXT", q:"Aapke pita ji ka pura naam likhein?", hint:"Pita ji ka pura naam likhein." },
  mother_name:    { label:"Mata ka Naam", type:"TEXT", q:"Aapki mata ji ka pura naam likhein?", hint:"Mata ji ka pura naam likhein." },
  spouse_name:    { label:"Jeevansathi ka Naam", type:"TEXT", q:"Aapke jeevansathi (husband/wife) ka pura naam likhein?", hint:"Jeevansathi ka pura naam likhein." },
  dob:            { label:"Date of Birth", type:"DOB", q:"Aapki date of birth likhein (DD/MM/YYYY format mein)?", hint:"Format galat hai. Aise likhein: 15/08/1998" },
  gender:         { label:"Gender", type:"CHOICE", q:"Gender chunein?", options:["MALE","FEMALE","TRANSGENDER"], hint:"MALE, FEMALE ya TRANSGENDER mein se likhein." },
  marital_status: { label:"Shaadi Status", type:"CHOICE", q:"Aapki shaadi ho chuki hai?", options:["MARRIED","UNMARRIED"], hint:"MARRIED ya UNMARRIED likhein." },
  mobile:         { label:"Mobile Number", type:"MOBILE", q:"Aapka 10 digit mobile number likhein?", hint:"10 digit ka valid mobile number likhein (6 se shuru hona chahiye)." },
  email:          { label:"Email", type:"EMAIL", q:"Aapki email ID likhein (nahi hai toh SKIP likhein)?", hint:"Email format galat hai, jaise: name@gmail.com. Nahi hai toh SKIP likhein." },
  address:        { label:"Pura Address", type:"TEXT", q:"Aapka pura address likhein (House/Street, City, District, State, PIN code)?", hint:"Address thoda detail mein likhein - House, City, District, State aur PIN code." },
  state:          { label:"Rajya", type:"TEXT", q:"Aapka state (rajya) likhein?", hint:"State ka naam likhein, jaise Rajasthan." },
  district:       { label:"Zila", type:"TEXT", q:"Aapka district (zila) likhein?", hint:"District ka naam likhein." },
  tehsil:         { label:"Tehsil", type:"TEXT", q:"Aapka tehsil/block likhein?", hint:"Tehsil ya block ka naam likhein." },
  village:        { label:"Gaon", type:"TEXT", q:"Aapka gaon/sheher likhein?", hint:"Gaon ya sheher ka naam likhein." },
  pincode:        { label:"PIN Code", type:"PINCODE", q:"Aapka area ka PIN code likhein (6 digit)?", hint:"6 digit ka valid PIN code likhein." },
  aadhaar_number: { label:"Aadhaar Number", type:"AADHAAR", q:"Aapka Aadhaar number likhein (12 digit)?", hint:"12 digit ka Aadhaar number likhein (sirf digits)." },
  pan_number:     { label:"PAN Number", type:"PAN", q:"Aapka PAN number likhein (jaise ABCPD1234F)?", hint:"PAN 10 character ka hota hai, jaise ABCPD1234F." },
  voter_id:       { label:"Voter ID", type:"EPIC", q:"Aapka Voter ID / EPIC number likhein (jaise ABC1234567)?", hint:"Voter ID 3 letters + 7 digits ka hota hai, jaise ABC1234567." },
  bank_account:   { label:"Bank Account", type:"ACCOUNT", q:"Aapka bank account number likhein?", hint:"Bank account number 9-18 digit ka hota hai." },
  ifsc:           { label:"IFSC Code", type:"IFSC", q:"Bank branch ka IFSC code likhein (jaise SBIN0001234)?", hint:"IFSC aise hota hai: SBIN0001234 (4 letters + 0 + 6 alnum)." },
  annual_income:  { label:"Varshik Aay", type:"NUMBER", q:"Aapki annual income (varshik aay) kitni hai? Sirf number likhein (jaise 180000)?", hint:"Sirf number likhein, jaise 180000 (bina comma/rupees)." },
  income_details: { label:"Income Details", type:"TEXT", q:"Apni income ka source aur approx amount likhein (jaise: Salary 350000/year)?", hint:"Income source aur amount likhein, jaise: Salary 350000/year." },
  caste:          { label:"Jati", type:"TEXT", q:"Aapki jaati (caste) likhein, jaise SC/ST/OBC/General ya jaati ka naam?", hint:"Jaati likhein, jaise SC, ST, OBC, General ya jaati ka naam." },
  purpose:        { label:"Kis Kaam ke Liye", type:"TEXT", q:"Ye certificate kis kaam ke liye chahiye? (jaise: scholarship, sarkari naukri, school admission)", hint:"Kaam ka reason likhein, jaise scholarship ya sarkari naukri." },
  business_name:  { label:"Business ka Naam", type:"TEXT", q:"Aapke business/firm ka naam likhein?", hint:"Business ka naam likhein." },
  gstin:          { label:"GSTIN (agar hai)", type:"GSTIN", q:"Agar GSTIN already hai toh likhein, warna SKIP likhein?", hint:"GSTIN 15 character ka hota hai. Nahi hai toh SKIP likhein." },
  school_name:    { label:"School/College", type:"TEXT", q:"Aapke school/college/institute ka naam likhein?", hint:"School ya college ka naam likhein." },
  course_name:    { label:"Course", type:"TEXT", q:"Aapka course/class likhein (jaise B.Tech 2nd Year)?", hint:"Course ya class likhein." },
  roll_number:    { label:"Roll Number", type:"TEXT", q:"Aapka roll number / student ID likhein?", hint:"Roll number ya student ID likhein." },
  aadhaar_linked_bank: { label:"Aadhaar-seeded Bank", type:"TEXT", q:"Aapka bank ka naam jisme Aadhaar linked hai, likhein?", hint:"Bank ka naam likhein." },
  ration_number:  { label:"Ration Card No", type:"TEXT", q:"Ration card number likhein (hai toh, warna SKIP)?", hint:"Ration card number likhein ya SKIP likhein." },
  electricity_number: { label:"Bijli Kanta No", type:"TEXT", q:"Electricity bill / Kisan ID number likhein (SKIP bhi likh sakte hain)?", hint:"Number likhein ya SKIP likhein." },
  dependents:     { label:"Parivar ke Sadasya", type:"NUMBER", q:"Parivar mein kitne sadasya (members) hain? Sirf number likhein?", hint:"Sirf number likhein, jaise 4." },
  form16:         { label:"Form 16", type:"CHOICE", q:"Kya aapke paas Form 16 hai?", options:["HAAN","NAHI"], hint:"HAAN ya NAHI likhein." },
  turnover:       { label:"Business Turnover", type:"NUMBER", q:"Business ki approx annual turnover likhein (sirf number)?", hint:"Sirf number likhein, jaise 1200000." },
  employer_name:  { label:"Niyokta ka Naam", type:"TEXT", q:"Aapke employer/company ka naam likhein (job nahi toh SKIP)?", hint:"Company ka naam likhein ya SKIP likhein." },
  designation:    { label:"Pad", type:"TEXT", q:"Aapka designation/post likhein (job nahi toh SKIP)?", hint:"Designation likhein ya SKIP likhein." },
  previous_apan:  { label:"Purana PAN", type:"PAN", q:"Agar pehle PAN bana hai toh purana PAN number likhein, warna SKIP?", hint:"PAN aise likhein: ABCPD1234F, ya SKIP likhein." },
  applied_before: { label:"Pehle Apply Kiya?", type:"CHOICE", q:"Kya aapne pehle ye certificate apply kiya hai?", options:["HAAN","NAHI"], hint:"HAAN ya NAHI likhein." },
  disability:     { label:"Divyang Details", type:"TEXT", q:"Divyangta (disability) ki details likhein, ya NAHI likhein?", hint:"Details likhein ya NAHI likhein." },
  bank_passbook:  { label:"Bank Details", type:"TEXT", q:"Bank ka naam + account number likhein?", hint:"Bank name aur account number dono likhein." },
  umang_mobile:   { label:"Registered Mobile", type:"MOBILE", q:"Aadhaar se linked mobile number likhein?", hint:"Aadhaar se linked 10 digit mobile likhein." }
};
const DOC_DEFS = {
  aadhaar_card:   { label:"Aadhaar Card", q:"Aadhaar card ki photo bhejein (front side)?" },
  photograph:     { label:"Passport Photo", q:"Apni passport size photo bhejein (white background best)?" },
  signature:      { label:"Signature", q:"Khali page par sign karke uski photo bhejein?" },
  form16:         { label:"Form 16", q:"Form 16 ki photo/PDF bhejein?" },
  bank_statement: { label:"Bank Statement", q:"6 mahine ka bank statement bhejein (photo/PDF)?" },
  pan_card:       { label:"PAN Card", q:"PAN card ki photo bhejein?" },
  address_proof:  { label:"Address Proof", q:"Address proof bhejein (bijli bill / rent agreement / passport)?" },
  income_proof:   { label:"Income Proof", q:"Income proof bhejein (salary slip / IT return / patwari certificate)?" },
  caste_proof:    { label:"Jati Praman Patra", q:"Purana caste certificate ya pita ji ka caste certificate bhejein?" },
  domicile_proof: { label:"Niwas Praman", q:"Niwas (domicile) proof bhejein - bijli bill / matdata ID?" },
  birth_certificate: { label:"Janm Praman Patra", q:"Birth certificate ya 10th marksheet bhejein (DOB proof)?" },
  marksheet_10:   { label:"10th Marksheet", q:"10th class ki marksheet ki photo bhejein?" },
  marksheet_12:   { label:"12th Marksheet", q:"12th class ki marksheet ki photo bhejein?" },
  last_marksheet: { label:"Pichhli Marksheet", q:"Last year ki marksheet bhejein?" },
  fee_receipt:    { label:"Fee Receipt", q:"College/school ki fee receipt bhejein?" },
  bonafide:       { label:"Bonafide Certificate", q:"Institute ka bonafide certificate bhejein?" },
  electricity_bill: { label:"Bijli Bill", q:"Bijli bill ki photo bhejein (address proof)?" },
  ration_card:    { label:"Ration Card", q:"Ration card ki photo bhejein?" },
  bank_passbook:  { label:"Bank Passbook", q:"Bank passbook ki photo bhejein (account details dikhe)?" },
  self_declaration: { label:"Self Declaration", q:"Self declaration form bhejein (ya apne haath se likhkar sign ki photo)?" },
  rent_agreement: { label:"Rent Agreement", q:"Rent agreement bhejein (agar rented hai)?" },
  business_proof: { label:"Business Proof", q:"Business proof bhejein (Udyam/MSME reg / shop license / GST cert)?" },
  photo_of_shop:  { label:"Dukan ki Photo", q:"Apni dukan/office ki photo bhejein?" },
  itr_copy:       { label:"ITR Copy", q:"Last year ki ITR acknowledgment copy bhejein?" },
  property_proof: { label:"Property Papers", q:"Property/sampatti ke documents ki photo bhejein?" },
  disability_cert: { label:"Divyang Certificate", q:"Divyangta certificate bhejein (agar lagu ho)?" },
  ayushman_family_id: { label:"Family ID", q:"Parivar ID / Ayushman card se juda document bhejein?" },
  eshram_ack:     { label:"E-Shram Ack", q:"Agar pehle e-Shram bana hai toh acknowledgement bhejein?" },
  mobile_bill:    { label:"Mobile Bill", q:"Agar address proof ke liye mobile bill hai toh bhejein, warna SKIP likhein?" },
  income_certificate_old: { label:"Purana Income Cert", q:"Purana income certificate bhejein (hai toh)?" },
  age_proof:      { label:"Age Proof", q:"Age proof bhejein - birth certificate ya 10th marksheet?" },
  scheme_form:    { label:"Scheme Form", q:"Yojana ka application form bhejein (hai toh)?" }
};

// ---------- SEED SERVICES FROM CATALOG ----------
const cat = JSON.parse(readFileSync("/home/z/my-project/download/csc-service-catalog.json", "utf8"));
const services = cat.services;
const ids = Object.keys(services);
console.log("Services in catalog:", ids.length);

const delSF = db.prepare("DELETE FROM service_fields WHERE service_id = ?");
const delSD = db.prepare("DELETE FROM service_documents WHERE service_id = ?");
const insSF = db.prepare("INSERT INTO service_fields (service_id, field_key, field_order, label, field_type, question, required, options, error_hint) VALUES (?,?,?,?,?,?,?,?,?)");
const insSD = db.prepare("INSERT INTO service_documents (service_id, doc_key, doc_order, label, accepted_types, question, required) VALUES (?,?,?,?,?,?,?)");
const insSC = db.prepare("INSERT INTO service_catalog (service_id, service_name, category, description, government_fee, service_charge, gst_percent, total_fee, portal_url, portal_type, operator_required, otp_required, captcha_required, status_tracking, receipt_required, processing_steps, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
const insSP = db.prepare("INSERT INTO service_pricing (service_id, gov_fee, service_charge, gst_percent, gst_amount, total_fee, currency, active) VALUES (?,?,?,?,?,?,?,?)");

db.prepare("DELETE FROM service_catalog").run();
db.prepare("DELETE FROM service_pricing").run();
const unknownFields = new Set(), unknownDocs = new Set();

for (const sid of ids) {
  const s = services[sid];
  const gstPct = s.service_charge > 0 ? Math.round((s.gst / s.service_charge) * 100) : 0;
  insSC.run(sid, s.service_name, s.category, s.description, s.government_fee, s.service_charge,
    gstPct, s.total_fee, s.portal_url || "", s.portal_type || "PORTAL_OPERATOR",
    s.operator_required ? "TRUE" : "FALSE", s.otp_required ? "TRUE" : "FALSE",
    s.captcha_required ? "TRUE" : "FALSE", s.status_tracking ? "TRUE" : "FALSE",
    s.receipt_required ? "TRUE" : "FALSE", JSON.stringify(s.processing_steps || []), "TRUE");
  insSP.run(sid, s.government_fee, s.service_charge, gstPct, s.gst, s.total_fee, "INR", "TRUE");

  delSF.run(sid);
  let fi = 0;
  for (const fk of s.required_fields || []) {
    const def = FIELD_DEFS[fk];
    if (!def) { unknownFields.add(fk); }
    const d = def || { label: fk, type: "TEXT", q: "Apna " + fk + " likhein?", hint: "Sahi value likhein." };
    insSF.run(sid, fk, fi++, d.label, d.type, d.q, "TRUE", (d.options || []).join(","), d.hint || "");
  }
  delSD.run(sid);
  let di = 0;
  for (const dk of s.required_documents || []) {
    const def = DOC_DEFS[dk];
    if (!def) { unknownDocs.add(dk); }
    const d = def || { label: dk, q: dk + " document bhejein?" };
    insSD.run(sid, dk, di++, d.label, "image,pdf", d.q, "TRUE");
  }
}
console.log("Unknown field keys:", [...unknownFields]);
console.log("Unknown doc keys:", [...unknownDocs]);

// ---------- SYSTEM CONFIG DEFAULTS ----------
const insCfg = db.prepare("INSERT INTO system_config (config_key, config_value, description, updated_at) VALUES (?,?,?,?)");
const setCfg = (k, v, d) => {
  const ex = db.prepare("SELECT config_key FROM system_config WHERE config_key = ?").get(k);
  if (ex) { db.prepare("UPDATE system_config SET config_value=?, description=?, updated_at=? WHERE config_key=?").run(v, d, now, k); }
  else insCfg.run(k, v, d, now);
};
setCfg("WHATSAPP_PHONE_NUMBER_ID", "SET_YOUR_PHONE_NUMBER_ID", "Meta WhatsApp Cloud API phone number id");
setCfg("WHATSAPP_ACCESS_TOKEN", "SET_YOUR_WABA_TOKEN", "Meta WhatsApp permanent access token");
setCfg("WHATSAPP_API_VERSION", "v21.0", "Meta Graph API version");
setCfg("ADMIN_WHATSAPP_NUMBER", "SET_ADMIN_NUMBER", "Operator/admin WhatsApp (91XXXXXXXXXX format)");
setCfg("RAZORPAY_KEY_ID", "", "Razorpay key id - empty = MOCK payment mode");
setCfg("RAZORPAY_KEY_SECRET", "", "Razorpay key secret");
setCfg("RAZORPAY_WEBHOOK_SECRET", "csc_webhook_secret_2026", "Razorpay webhook HMAC secret");
setCfg("PAYMENT_MODE", "MOCK", "MOCK | RAZORPAY_TEST | RAZORPAY_LIVE");
setCfg("PORTAL_MODE", "MOCK", "MOCK portal simulation | LIVE");
setCfg("GST_PERCENT", "18", "GST % on service charge");
setCfg("REMINDER_MAX_PER_APP", "3", "Max reminders per application (anti-harassment)");
setCfg("REMINDER_QUIET_START", "21:00", "Quiet hours start (no reminders)");
setCfg("REMINDER_QUIET_END", "09:00", "Quiet hours end");
setCfg("APP_NUMBER_PREFIX", "CSC-2026-", "Application number prefix");

// ---------- VERIFY ----------
const cnt = (t) => db.prepare("SELECT COUNT(*) c FROM " + t).get().c;
console.log("service_catalog rows:", cnt("service_catalog"), "| service_fields rows:", cnt("service_fields"),
  "| service_documents rows:", cnt("service_documents"), "| service_pricing rows:", cnt("service_pricing"),
  "| system_config rows:", cnt("system_config"));
db.close();
console.log("PHASE A DONE");
