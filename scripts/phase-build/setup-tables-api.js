// One-shot: recreate all 22 CSC data tables via Public API (nanoid ids) + seed config rows
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000/api/v1";
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };

async function api(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(method + " " + path + " -> " + r.status + " " + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

// ---------- STEP 1: drop old UUID tables (metadata) ----------
const db = new Database("/home/z/.n8n/database.sqlite");
const old = db.prepare("SELECT id, name FROM data_table").all();
for (const t of old) {
  db.prepare("DELETE FROM data_table_column WHERE dataTableId = ?").run(t.id);
  db.prepare("DELETE FROM data_table WHERE id = ?").run(t.id);
}
console.log("dropped metadata for", old.length, "old tables");
db.close();

// ---------- STEP 2: create tables via API ----------
const T = (name, cols) => ({ name, cols });
const TABLES = [
  T("customers", [["phone","string"],["full_name","string"],["email","string"],["state","string"],["district","string"],["address","string"],["consent_status","string"],["created_at","string"],["updated_at","string"]]),
  T("applications", [["application_id","string"],["customer_phone","string"],["service_id","string"],["status","string"],["gov_fee","number"],["service_charge","number"],["gst","number"],["total_fee","number"],["form_data","string"],["application_number","string"],["created_at","string"],["updated_at","string"]]),
  T("payments", [["payment_id","string"],["application_id","string"],["customer_phone","string"],["amount","number"],["gateway","string"],["transaction_id","string"],["status","string"],["created_at","string"],["paid_at","string"]]),
  T("conversation_state", [["phone","string"],["state","string"],["service_id","string"],["context_data","string"],["handoff_active","string"],["updated_at","string"]]),
  T("service_catalog", [["service_id","string"],["service_name","string"],["category","string"],["description","string"],["government_fee","number"],["service_charge","number"],["gst_percent","number"],["total_fee","number"],["portal_url","string"],["portal_type","string"],["operator_required","string"],["otp_required","string"],["captcha_required","string"],["status_tracking","string"],["receipt_required","string"],["processing_steps","string"],["active","string"]]),
  T("service_fields", [["service_id","string"],["field_key","string"],["field_order","number"],["label","string"],["field_type","string"],["question","string"],["required","string"],["options","string"],["error_hint","string"]]),
  T("service_documents", [["service_id","string"],["doc_key","string"],["doc_order","number"],["label","string"],["accepted_types","string"],["question","string"],["required","string"]]),
  T("service_pricing", [["service_id","string"],["gov_fee","number"],["service_charge","number"],["gst_percent","number"],["gst_amount","number"],["total_fee","number"],["currency","string"],["active","string"]]),
  T("application_field_values", [["application_id","string"],["phone","string"],["field_key","string"],["field_value","string"],["validated","string"],["created_at","string"],["updated_at","string"]]),
  T("application_documents", [["application_id","string"],["phone","string"],["doc_key","string"],["media_id","string"],["mime_type","string"],["ocr_text","string"],["status","string"],["created_at","string"],["verified_by","string"]]),
  T("application_status_history", [["application_id","string"],["application_number","string"],["old_status","string"],["new_status","string"],["note","string"],["created_at","string"]]),
  T("operator_tasks", [["task_id","string"],["application_id","string"],["application_number","string"],["operator_phone","string"],["status","string"],["note","string"],["created_at","string"],["updated_at","string"]]),
  T("handoff_queue", [["phone","string"],["name","string"],["reason","string"],["status","string"],["taken_by","string"],["created_at","string"],["resolved_at","string"]]),
  T("notifications_log", [["phone","string"],["template","string"],["message","string"],["status","string"],["related_id","string"],["error","string"],["created_at","string"]]),
  T("reminders_log", [["phone","string"],["application_id","string"],["reminder_type","string"],["count","number"],["sent_at","string"],["status","string"]]),
  T("audit_log", [["event_id","string"],["event_type","string"],["actor","string"],["phone","string"],["application_id","string"],["payload","string"],["created_at","string"]]),
  T("receipts", [["receipt_id","string"],["application_id","string"],["application_number","string"],["amount","number"],["payload","string"],["created_at","string"]]),
  T("system_config", [["config_key","string"],["config_value","string"],["description","string"],["updated_at","string"]]),
  T("payment_events", [["event_id","string"],["application_id","string"],["gateway","string"],["event_type","string"],["payload","string"],["signature_valid","string"],["created_at","string"]]),
  T("service_research", [["research_id","string"],["phone","string"],["user_message","string"],["ai_analysis","string"],["proposed_service","string"],["status","string"],["created_at","string"]]),
  T("consent_log", [["phone","string"],["consent_type","string"],["consent_text","string"],["granted","string"],["source","string"],["created_at","string"]]),
  T("message_log", [["phone","string"],["direction","string"],["message_type","string"],["body","string"],["wa_message_id","string"],["status","string"],["created_at","string"]])
];

const existing = new Set((await api("GET", "/data-tables?limit=100")).data.map(t => t.name));
const tid = {};
for (const t of TABLES) {
  if (existing.has(t.name)) {
    const cur = (await api("GET", "/data-tables?limit=100")).data.find(x => x.name === t.name);
    tid[t.name] = cur.id;
    console.log("exists:", t.name);
    continue;
  }
  const created = await api("POST", "/data-tables", { name: t.name, projectId: "VgFtFuDMIJpEbhPr", columns: t.cols.map(([name, type]) => ({ name, type })) });
  tid[t.name] = created.id;
  console.log("created:", t.name, created.id);
}

// ---------- STEP 3: seed config rows ----------
async function clearAndInsert(name, rows) {
  const id = tid[name];
  await api("DELETE", `/data-tables/${id}/rows/clear`);
  for (let i = 0; i < rows.length; i += 40) {
    await api("POST", `/data-tables/${id}/rows`, { data: rows.slice(i, i + 40), returnType: "count" });
  }
  console.log(`seeded ${name}: ${rows.length} rows`);
}

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
  income_certificate_old: { label:"Purana Income Cert", type:"TEXT", q:"Purana income certificate number likhein (hai toh, warna SKIP)?", hint:"Number likhein ya SKIP likhein." },
  sales_data: { label:"Sales Data", type:"NUMBER", q:"Apni sales ki approx monthly value likhein (sirf number, jaise 150000)?", hint:"Sirf number likhein, jaise 150000." },
  purchase_data: { label:"Purchase Data", type:"NUMBER", q:"Apni purchases ki approx monthly value likhein (sirf number, jaise 100000)?", hint:"Sirf number likhein, jaise 100000." },
  years_of_residence: { label:"Rehne ki Avadhi", type:"NUMBER", q:"Is district/state mein kitne saal se reh rahe hain? Sirf number likhein?", hint:"Sirf number likhein, jaise 10." },
  child_name: { label:"Bachche ka Naam", type:"TEXT", q:"Bachche ka pura naam likhein?", hint:"Bachche ka pura naam likhein." },
  place_of_birth: { label:"Janm Sthan", type:"TEXT", q:"Janm ka sthan likhein (sheher/aspatal)?", hint:"Janm ka sthan likhein." },
  deceased_name: { label:"Swargiya ka Naam", type:"TEXT", q:"Swargiya (deceased) vyakti ka pura naam likhein?", hint:"Swargiya vyakti ka pura naam likhein." },
  date_of_death: { label:"Mrityu Tarikh", type:"DOB", q:"Mrityu ki tarikh likhein (DD/MM/YYYY format mein)?", hint:"Aise likhein: 15/08/1998." },
  place_of_death: { label:"Mrityu Sthan", type:"TEXT", q:"Mrityu ka sthan likhein (ghar/aspatal, sheher)?", hint:"Mrityu ka sthan likhein." },
  applicant_name: { label:"Aavedak ka Naam", type:"TEXT", q:"Aavedak (applicant) ka pura naam likhein?", hint:"Aavedak ka pura naam likhein." },
  relative_name: { label:"Sambandhi ka Naam", type:"TEXT", q:"Sambandhit vyakti ka pura naam aur rishta likhein?", hint:"Naam aur rishta likhein, jaise: Ramesh (pita)." },
  constituency: { label:"Constituency", type:"TEXT", q:"Aapka Vidhan Sabha constituency likhein?", hint:"Constituency ka naam likhein." },
  ration_card: { label:"Ration Card", type:"TEXT", q:"Ration card number likhein (hai toh, warna SKIP likhein)?", hint:"Ration card number likhein ya SKIP likhein." },
  state_district: { label:"State-District", type:"TEXT", q:"State aur district likhein (jaise: Rajasthan, Jaipur)?", hint:"Aise likhein: Rajasthan, Jaipur." },
  occupation: { label:"Dhanda", type:"TEXT", q:"Aapka dhanda/occupation likhein?", hint:"Occupation likhein, jaise Kisan, Dukandar." },
  education_details: { label:"Education", type:"TEXT", q:"Aapki education ki details likhein (jaise: 10th pass, B.A.)?", hint:"Education likhein, jaise 10th pass." },
  category: { label:"Category", type:"TEXT", q:"Category likhein (SC / ST / OBC / General)?", hint:"SC, ST, OBC ya General likhein." },
  student_name: { label:"Student ka Naam", type:"TEXT", q:"Student ka pura naam likhein?", hint:"Student ka pura naam likhein." },
  institute_name: { label:"Institute ka Naam", type:"TEXT", q:"Institute/school/college ka naam likhein?", hint:"Institute ka naam likhein." }
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
  scheme_form:    { label:"Scheme Form", q:"Yojana ka application form bhejein (hai toh)?" },
  sales_register: { label:"Sales Register", q:"Sales register/bills ki photo bhejein (hai toh)?" },
  purchase_register: { label:"Purchase Register", q:"Purchase register/bills ki photo bhejein (hai toh)?" },
  caste_proof_of_family: { label:"Pariwar Caste Proof", q:"Pariwar ka caste proof bhejein (pita ji ka certificate/school certificate)?" },
  residence_proof: { label:"Niwas Proof", q:"Niwas proof bhejein (bijli bill/ration card/matdata ID)?" },
  hospital_receipt: { label:"Aspatal Receipt", q:"Aspatal ka receipt/praman patra bhejein?" },
  cremation_certificate: { label:"Cremation Certificate", q:"Cremation certificate (dah sanskar praman) bhejein?" },
  applicant_aadhaar: { label:"Aavedak ka Aadhaar", q:"Aavedak ka Aadhaar card bhejein?" },
  education_certificates: { label:"Education Certificates", q:"Education certificates/marksheets bhejein?" },
  caste_certificate_if_any: { label:"Purana Caste Cert", q:"Purana caste certificate bhejein (hai toh, warna NAHI likhein)?" },
  marksheet: { label:"Marksheet", q:"Marksheet ki photo bhejein?" },
  income_certificate: { label:"Income Certificate", q:"Income certificate bhejein (hai toh)?" }
};

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
  console.log(name, "->", r.data && r.data.length ? "OK (" + Object.keys(r.data[0]).length + " cols)" : "EMPTY");
}
console.log("ALL TABLES + SEED DONE");
console.log("TABLE_IDS=" + JSON.stringify(tid));
