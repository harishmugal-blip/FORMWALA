// Seed service config rows into n8n Data Tables via Public API
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000/api/v1";
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const PROJECT = "VgFtFuDMIJpEbhPr";
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };

async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(method + " " + path + " -> " + r.status + " " + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

// map table name -> id
const list = await api("GET", "/data-tables?limit=100");
const tid = {};
for (const t of list.data) tid[t.name] = t.id;
console.log("tables found:", Object.keys(tid).length);

async function clearAndInsert(name, rows) {
  const id = tid[name];
  if (!id) throw new Error("no table " + name);
  await api("DELETE", `/data-tables/${id}/rows/clear`);
  for (let i = 0; i < rows.length; i += 40) {
    await api("POST", `/data-tables/${id}/rows`, { data: rows.slice(i, i + 40), returnType: "count" });
  }
  console.log(`seeded ${name}: ${rows.length} rows`);
}

// ---------- FIELD DEFINITIONS ----------
const FIELD_DEFS = {
  full_name:      { label:"Pura Naam", type:"TEXT", q:"Aapka pura naam (Aadhaar/voter ID ke hisaab se) likhein?", hint:"Naam adhura hai. Pura naam likhein, jaise: Ramesh Kumar" },
  father_name:    { label:"Pita ka Naam", type:"TEXT", q:"Aapke pita ji ka pura naam likhein?", hint:"Pita ji ka pura naam likhein." },
  mother_name:    { label:"Mata ka Naam", type:"TEXT", q:"Aapki mata ji ka pura naam likhein?", hint:"Mata ji ka pura naam likhein." },
  spouse_name:    { label:"Jeevansathi ka Naam", type:"TEXT", q:"Aapke jeevansathi (husband/wife) ka pura naam likhein?", hint:"Jeevansathi ka pura naam likhein." },
  dob:            { label:"Date of Birth", type:"DOB", q:"Aapki date of birth likhein (DD/MM/YYYY format mein)?", hint:"Format galat hai. Aise likhein: 15/08/1998" },
  gender:         { label:"Gender", type:"CHOICE", q:"Gender chunein? (MALE / FEMALE / TRANSGENDER)", options:["MALE","FEMALE","TRANSGENDER"], hint:"MALE, FEMALE ya TRANSGENDER mein se likhein." },
  marital_status: { label:"Shaadi Status", type:"CHOICE", q:"Aapki shaadi ho chuki hai? (MARRIED / UNMARRIED)", options:["MARRIED","UNMARRIED"], hint:"MARRIED ya UNMARRIED likhein." },
  mobile:         { label:"Mobile Number", type:"MOBILE", q:"Aapka 10 digit mobile number likhein?", hint:"10 digit ka valid mobile number likhein (6 se shuru hona chahiye)." },
  email:          { label:"Email", type:"EMAIL", q:"Aapki email ID likhein (nahi hai toh SKIP likhein)?", hint:"Email format galat hai, jaise: name@gmail.com. Nahi hai toh SKIP likhein." },
  address:        { label:"Pura Address", type:"TEXT", q:"Aapka pura address likhein (House/Street, City, District, State, PIN code)?", hint:"Address detail mein likhein - House, City, District, State aur PIN code." },
  state:          { label:"Rajya", type:"TEXT", q:"Aapka state (rajya) likhein?", hint:"State ka naam likhein, jaise Rajasthan." },
  district:       { label:"Zila", type:"TEXT", q:"Aapka district (zila) likhein?", hint:"District ka naam likhein." },
  tehsil:         { label:"Tehsil", type:"TEXT", q:"Aapka tehsil/block likhein?", hint:"Tehsil ya block ka naam likhein." },
  village:        { label:"Gaon/Sheher", type:"TEXT", q:"Aapka gaon/sheher likhein?", hint:"Gaon ya sheher ka naam likhein." },
  pincode:        { label:"PIN Code", type:"PINCODE", q:"Aapka area ka PIN code likhein (6 digit)?", hint:"6 digit ka valid PIN code likhein." },
  aadhaar_number: { label:"Aadhaar Number", type:"AADHAAR", q:"Aapka Aadhaar number likhein (12 digit)?", hint:"12 digit ka Aadhaar number likhein (sirf digits)." },
  pan_number:     { label:"PAN Number", type:"PAN", q:"Aapka PAN number likhein (jaise ABCPD1234F)?", hint:"PAN 10 character ka hota hai, jaise ABCPD1234F." },
  voter_id:       { label:"Voter ID", type:"EPIC", q:"Aapka Voter ID / EPIC number likhein (jaise ABC1234567)?", hint:"Voter ID 3 letters + 7 digits ka hota hai, jaise ABC1234567." },
  bank_account:   { label:"Bank Account", type:"ACCOUNT", q:"Aapka bank account number likhein?", hint:"Bank account number 9-18 digit ka hota hai." },
  ifsc:           { label:"IFSC Code", type:"IFSC", q:"Bank branch ka IFSC code likhein (jaise SBIN0001234)?", hint:"IFSC aise hota hai: SBIN0001234." },
  annual_income:  { label:"Varshik Aay", type:"NUMBER", q:"Aapki annual income (varshik aay) kitni hai? Sirf number likhein (jaise 180000)?", hint:"Sirf number likhein, jaise 180000 (bina comma/rupees)." },
  income_details: { label:"Income Details", type:"TEXT", q:"Apni income ka source aur approx amount likhein (jaise: Salary 350000/year)?", hint:"Income source aur amount likhein, jaise: Salary 350000/year." },
  caste:          { label:"Jati", type:"TEXT", q:"Aapki jaati (caste) likhein, jaise SC/ST/OBC/General ya jaati ka naam?", hint:"Jaati likhein, jaise SC, ST, OBC, General ya jaati ka naam." },
  purpose:        { label:"Kis Kaam ke Liye", type:"TEXT", q:"Ye certificate kis kaam ke liye chahiye? (jaise: scholarship, sarkari naukri, school admission)", hint:"Kaam ka reason likhein, jaise scholarship ya sarkari naukri." },
  business_name:  { label:"Business ka Naam", type:"TEXT", q:"Aapke business/firm ka naam likhein?", hint:"Business ka naam likhein." },
  gstin:          { label:"GSTIN", type:"GSTIN", q:"Agar GSTIN already hai toh likhein, warna SKIP likhein?", hint:"GSTIN 15 character ka hota hai. Nahi hai toh SKIP likhein." },
  school_name:    { label:"School/College", type:"TEXT", q:"Aapke school/college/institute ka naam likhein?", hint:"School ya college ka naam likhein." },
  course_name:    { label:"Course", type:"TEXT", q:"Aapka course/class likhein (jaise B.Tech 2nd Year)?", hint:"Course ya class likhein." },
  roll_number:    { label:"Roll Number", type:"TEXT", q:"Aapka roll number / student ID likhein?", hint:"Roll number ya student ID likhein." },
  ration_number:  { label:"Ration Card No", type:"TEXT", q:"Ration card number likhein (hai toh, warna SKIP)?", hint:"Ration card number likhein ya SKIP likhein." },
  dependents:     { label:"Parivar ke Sadasya", type:"NUMBER", q:"Parivar mein kitne sadasya (members) hain? Sirf number likhein?", hint:"Sirf number likhein, jaise 4." },
  form16:         { label:"Form 16", type:"CHOICE", q:"Kya aapke paas Form 16 hai? (HAAN / NAHI)", options:["HAAN","NAHI"], hint:"HAAN ya NAHI likhein." },
  turnover:       { label:"Business Turnover", type:"NUMBER", q:"Business ki approx annual turnover likhein (sirf number)?", hint:"Sirf number likhein, jaise 1200000." },
  employer_name:  { label:"Niyokta ka Naam", type:"TEXT", q:"Aapke employer/company ka naam likhein (job nahi toh SKIP)?", hint:"Company ka naam likhein ya SKIP likhein." },
  designation:    { label:"Pad", type:"TEXT", q:"Aapka designation/post likhein (job nahi toh SKIP)?", hint:"Designation likhein ya SKIP likhein." },
  previous_apan:  { label:"Purana PAN", type:"PAN", q:"Agar pehle PAN bana hai toh purana PAN number likhein, warna SKIP?", hint:"PAN aise likhein: ABCPD1234F, ya SKIP likhein." },
  applied_before: { label:"Pehle Apply Kiya?", type:"CHOICE", q:"Kya aapne pehle ye certificate apply kiya hai? (HAAN / NAHI)", options:["HAAN","NAHI"], hint:"HAAN ya NAHI likhein." },
  disability:     { label:"Divyang Details", type:"TEXT", q:"Divyangta (disability) ki details likhein, ya NAHI likhein?", hint:"Details likhein ya NAHI likhein." },
  bank_passbook:  { label:"Bank Details", type:"TEXT", q:"Bank ka naam + account number likhein?", hint:"Bank name aur account number dono likhein." },
  umang_mobile:   { label:"Registered Mobile", type:"MOBILE", q:"Aadhaar se linked mobile number likhein?", hint:"Aadhaar se linked 10 digit mobile likhein." },
  aadhaar_linked_bank: { label:"Aadhaar-seeded Bank", type:"TEXT", q:"Aapka bank ka naam jisme Aadhaar linked hai, likhein?", hint:"Bank ka naam likhein." },
  electricity_number: { label:"Bijli Kanta No", type:"TEXT", q:"Electricity bill / Kisan ID number likhein (SKIP bhi likh sakte hain)?", hint:"Number likhein ya SKIP likhein." },
  income_certificate_old: { label:"Purana Income Cert", type:"TEXT", q:"Purana income certificate number likhein (hai toh, warna SKIP)?", hint:"Number likhein ya SKIP likhein." }
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
  self_declaration: { label:"Self Declaration", q:"Self declaration bhejein (apne haath se likhkar sign ki photo)?" },
  rent_agreement: { label:"Rent Agreement", q:"Rent agreement bhejein (agar rented hai)?" },
  business_proof: { label:"Business Proof", q:"Business proof bhejein (Udyam/MSME reg / shop license / GST cert)?" },
  photo_of_shop:  { label:"Dukan ki Photo", q:"Apni dukan/office ki photo bhejein?" },
  itr_copy:       { label:"ITR Copy", q:"Last year ki ITR acknowledgment copy bhejein?" },
  property_proof: { label:"Property Papers", q:"Property/sampatti ke documents ki photo bhejein?" },
  disability_cert: { label:"Divyang Certificate", q:"Divyangta certificate bhejein (agar lagu ho)?" },
  ayushman_family_id: { label:"Family ID", q:"Parivar ID / Ayushman se juda document bhejein?" },
  eshram_ack:     { label:"E-Shram Ack", q:"Agar pehle e-Shram bana hai toh acknowledgement bhejein?" },
  mobile_bill:    { label:"Mobile Bill", q:"Address proof ke liye mobile bill bhejein, warna SKIP likhein?" },
  income_certificate_old: { label:"Purana Income Cert", q:"Purana income certificate bhejein (hai toh)?" },
  age_proof:      { label:"Age Proof", q:"Age proof bhejein - birth certificate ya 10th marksheet?" },
  scheme_form:    { label:"Scheme Form", q:"Yojana ka application form bhejein (hai toh)?" }
};

// ---------- SERVICES ----------
const cat = JSON.parse(readFileSync("/home/z/my-project/download/csc-service-catalog.json", "utf8"));
const services = cat.services;
const catalogRows = [], fieldRows = [], docRows = [], priceRows = [];
const unknownFields = new Set(), unknownDocs = new Set();

for (const sid of Object.keys(services)) {
  const s = services[sid];
  const gstPct = s.service_charge > 0 ? Math.round((s.gst / s.service_charge) * 100) : 0;
  catalogRows.push({
    service_id: sid, service_name: s.service_name, category: s.category, description: s.description,
    government_fee: s.government_fee, service_charge: s.service_charge, gst_percent: gstPct, total_fee: s.total_fee,
    portal_url: s.portal_url || "", portal_type: s.portal_type || "PORTAL_OPERATOR",
    operator_required: s.operator_required ? "TRUE" : "FALSE", otp_required: s.otp_required ? "TRUE" : "FALSE",
    captcha_required: s.captcha_required ? "TRUE" : "FALSE", status_tracking: s.status_tracking ? "TRUE" : "FALSE",
    receipt_required: s.receipt_required ? "TRUE" : "FALSE", processing_steps: JSON.stringify(s.processing_steps || []), active: "TRUE"
  });
  priceRows.push({ service_id: sid, gov_fee: s.government_fee, service_charge: s.service_charge, gst_percent: gstPct, gst_amount: s.gst, total_fee: s.total_fee, currency: "INR", active: "TRUE" });
  let fi = 0;
  for (const fk of s.required_fields || []) {
    const def = FIELD_DEFS[fk];
    if (!def) unknownFields.add(fk);
    const d = def || { label: fk, type: "TEXT", q: "Apna " + fk.replace(/_/g, " ") + " likhein?", hint: "Sahi value likhein." };
    fieldRows.push({ service_id: sid, field_key: fk, field_order: fi++, label: d.label, field_type: d.type, question: d.q, required: "TRUE", options: (d.options || []).join(","), error_hint: d.hint || "" });
  }
  let di = 0;
  for (const dk of s.required_documents || []) {
    const def = DOC_DEFS[dk];
    if (!def) unknownDocs.add(dk);
    const d = def || { label: dk, q: dk.replace(/_/g, " ") + " document bhejein?" };
    docRows.push({ service_id: sid, doc_key: dk, doc_order: di++, label: d.label, accepted_types: "image,pdf", question: d.q, required: "TRUE" });
  }
}
console.log("Unknown field keys:", [...unknownFields].join(", ") || "none");
console.log("Unknown doc keys:", [...unknownDocs].join(", ") || "none");

await clearAndInsert("service_catalog", catalogRows);
await clearAndInsert("service_fields", fieldRows);
await clearAndInsert("service_documents", docRows);
await clearAndInsert("service_pricing", priceRows);

// ---------- SYSTEM CONFIG ----------
const cfg = [
  ["WHATSAPP_PHONE_NUMBER_ID", "SET_YOUR_PHONE_NUMBER_ID", "Meta WhatsApp Cloud API phone number id"],
  ["WHATSAPP_ACCESS_TOKEN", "SET_YOUR_WABA_TOKEN", "Meta WhatsApp permanent access token"],
  ["WHATSAPP_API_VERSION", "v21.0", "Meta Graph API version"],
  ["ADMIN_WHATSAPP_NUMBER", "SET_ADMIN_NUMBER", "Operator/admin WhatsApp (91XXXXXXXXXX format)"],
  ["RAZORPAY_KEY_ID", "", "Razorpay key id - empty = MOCK payment mode"],
  ["RAZORPAY_KEY_SECRET", "", "Razorpay key secret"],
  ["RAZORPAY_WEBHOOK_SECRET", "csc_webhook_secret_2026", "Razorpay webhook HMAC secret"],
  ["PAYMENT_MODE", "MOCK", "MOCK | RAZORPAY_TEST | RAZORPAY_LIVE"],
  ["PORTAL_MODE", "MOCK", "MOCK portal simulation | LIVE"],
  ["GST_PERCENT", "18", "GST % on service charge"],
  ["REMINDER_MAX_PER_APP", "3", "Max reminders per application (anti-harassment)"],
  ["REMINDER_QUIET_START", "21:00", "Quiet hours start (no reminders)"],
  ["REMINDER_QUIET_END", "09:00", "Quiet hours end"],
  ["APP_NUMBER_PREFIX", "CSC-2026-", "Application number prefix"]
];
await clearAndInsert("system_config", cfg.map(([k, v, d]) => ({ config_key: k, config_value: v, description: d, updated_at: new Date().toISOString() })));

// verify
for (const name of ["service_catalog", "service_fields", "service_documents", "service_pricing", "system_config"]) {
  const r = await api("GET", `/data-tables/${tid[name]}/rows?limit=1`);
  console.log(name, "first row keys:", r.data && r.data.length ? Object.keys(r.data[0]).length + " cols, sample: " + JSON.stringify(r.data[0]).slice(0, 120) : "EMPTY");
}
console.log("SEED DONE");
