// VIDEO-VERIFIED SYSTEM UPDATE (SarkariDNA videos, Task 12)
// 1. ADD RATION_CARD + PASSPORT services (catalog + pricing + fields + docs)
// 2. PAN_CARD: add dob_proof_type field + dob_proof doc (Aadhaar alone NOT sufficient now)
// 3. GST_REG: add business_place_proof doc (rent agreement / NOC / electricity bill)
// 4. CASTE/DOMICILE/INCOME certs: gov fee 30 -> 15 (UP e-District, video-verified)
// Idempotent: safe to re-run.
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.HOME + '/.n8n/database.sqlite');

const T = {};
for (const n of ['service_catalog','service_pricing','service_fields','service_documents']) {
  T[n] = db.prepare('SELECT id FROM data_table WHERE name=?').get(n).id;
}
const tb = n => 'data_table_user_' + T[n];
const now = () => db.prepare("SELECT STRFTIME('%Y-%m-%d %H:%M:%f','NOW') t").get().t;

function nextId(table) {
  return db.prepare(`SELECT COALESCE(MAX(id),0)+1 n FROM ${tb(table)}`).get().n;
}
function exists(table, key, val) {
  return db.prepare(`SELECT id FROM ${tb(table)} WHERE ${key}=?`).get(val);
}

// ---------- 1. NEW SERVICES ----------
const newServices = [
  {
    service_id: 'RATION_CARD',
    service_name: 'Ration Card',
    category: 'Identity',
    description: 'Naya ration card (Smart PDS) ya member add - NFSA',
    government_fee: 45, service_charge: 50, gst_percent: 18, total_fee: 104,
    portal_url: 'https://nfsa.gov.in',
    processing_steps: '["Aadhaar OTP login","RC Application form","Family members add","FPS dealer selection","Acknowledgement number"]',
    fields: [
      ['full_name','1','Mukhiya ka Naam','TEXT','Ghar ke mukhiya (head of family) ka pura naam likhein?','','TRUE'],
      ['father_name','2','Pita ka Naam','TEXT','Mukhiya ke pita ji ka pura naam likhein?','','TRUE'],
      ['dob','3','Date of Birth','DOB','Mukhiya ki date of birth likhein (DD/MM/YYYY)?','','TRUE'],
      ['mobile','4','Mobile Number','MOBILE','Aapka 10 digit mobile number likhein?','','TRUE'],
      ['address','5','Pura Address','TEXT','Aapka pura address likhein (House/Street, City, District, State, PIN code)?','','TRUE'],
      ['occupation','6','Dhanda','TEXT','Mukhiya ka dhanda/occupation likhein (jaise: kheti, dukaan, mazdoori)?','','TRUE'],
      ['annual_income','7','Varshik Aay','NUMBER','Parivar ki total annual income likhein (sirf number, jaise 120000)?','','TRUE'],
      ['family_members','8','Parivar Sadasya','NUMBER','Ghar mein kitne sadasya (members) hain? Sirf number likhein?','','TRUE'],
      ['card_type','9','Card Type','CHOICE','Kaunsa ration card chahiye? (APL / BPL / ANTYODAYA / pata nahi toh PATA_NAHI)?','List mein se ek option likhein','TRUE'],
    ],
    fields_options: { card_type: 'APL,BPL,ANTYODAYA,PATA_NAHI' },
    docs: [
      ['aadhaar_card','1','Aadhaar Card','image/jpeg,image/png,application/pdf','Sabhi sadasyon (members) ki Aadhaar card photo/PDF bhejein?','TRUE'],
      ['photograph','2','Passport Photo','image/jpeg,image/png','Mukhiya ki passport size photo bhejein (max 5MB)?','TRUE'],
      ['address_proof','3','Address Proof','image/jpeg,image/png,application/pdf','Address proof bhejein (bijli bill / paani bill / voter ID)?','TRUE'],
      ['income_certificate','4','Income Certificate','image/jpeg,image/png,application/pdf','Agar income certificate hai toh bhejein (optional, skip kar sakte hain)?','FALSE'],
      ['caste_certificate','5','Caste Certificate','image/jpeg,image/png,application/pdf','Agar caste certificate hai toh bhejein (optional, skip kar sakte hain)?','FALSE'],
    ],
  },
  {
    service_id: 'PASSPORT',
    service_name: 'Passport',
    category: 'Identity',
    description: 'Naya passport / renewal (36/60 pages) - PSK appointment ke saath',
    government_fee: 2500, service_charge: 100, gst_percent: 18, total_fee: 2618,
    portal_url: 'https://www.passportindia.gov.in',
    processing_steps: '["Passport Seva registration","Form fill (9 steps)","Fee payment Rs 2500","PSK appointment booking","Police verification"]',
    fields: [
      ['full_name','1','Pura Naam','TEXT','Aapka pura naam (Aadhaar/marksheet ke hisaab se) likhein?','','TRUE'],
      ['father_name','2','Pita ka Naam','TEXT','Aapke pita ji ka pura naam likhein?','','TRUE'],
      ['dob','3','Date of Birth','DOB','Aapki date of birth likhein (DD/MM/YYYY format mein)?','','TRUE'],
      ['mobile','4','Mobile Number','MOBILE','Aapka 10 digit mobile number likhein?','','TRUE'],
      ['email','5','Email','EMAIL','Aapki email ID likhein (Passport Seva login isi par banta hai)?','','TRUE'],
      ['address','6','Pura Address','TEXT','Aapka pura address likhein (House/Street, City, District, State, PIN code)?','','TRUE'],
      ['education','7','Education (ECR)','CHOICE','Kya aap 10th pass hain? (10TH_PASS / BELOW_10TH) - isse ECR/Non-ECR tay hota hai?','10TH_PASS ya BELOW_10TH likhein','TRUE'],
      ['apply_type','8','Apply Type','CHOICE','Kaisa passport apply karna hai? (NEW / RENEWAL / TATKAAL)?','NEW, RENEWAL ya TATKAAL likhein','TRUE'],
    ],
    fields_options: { education: '10TH_PASS,BELOW_10TH', apply_type: 'NEW,RENEWAL,TATKAAL' },
    docs: [
      ['aadhaar_card','1','Aadhaar Card','image/jpeg,image/png,application/pdf','Aadhaar card ki photo/PDF bhejein?','TRUE'],
      ['dob_proof','2','DOB Proof','image/jpeg,image/png,application/pdf','DOB proof bhejein (birth certificate / 10th marksheet / voter ID)?','TRUE'],
      ['address_proof','3','Address Proof','image/jpeg,image/png,application/pdf','Address proof bhejein (bijli bill / bank passbook / rent agreement)?','TRUE'],
      ['old_passport','4','Purana Passport','image/jpeg,image/png,application/pdf','Purana passport hai toh bhejein (renewal ke liye, warna SKIP)?','FALSE'],
    ],
  },
];

for (const s of newServices) {
  if (exists('service_catalog', 'service_id', s.service_id)) {
    console.log('SKIP (already exists): ' + s.service_id);
    continue;
  }
  // catalog
  db.prepare(`INSERT INTO ${tb('service_catalog')}
    (service_id,service_name,category,description,government_fee,service_charge,gst_percent,total_fee,portal_url,portal_type,operator_required,otp_required,captcha_required,status_tracking,receipt_required,processing_steps,active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(s.service_id, s.service_name, s.category, s.description, s.government_fee, s.service_charge, s.gst_percent, s.total_fee,
         s.portal_url, 'PORTAL_OPERATOR', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', s.processing_steps, 'TRUE');
  // pricing
  const gstAmount = Math.round(s.service_charge * s.gst_percent / 100);
  db.prepare(`INSERT INTO ${tb('service_pricing')}
    (service_id,gov_fee,service_charge,gst_percent,gst_amount,total_fee,currency,active)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(s.service_id, s.government_fee, s.service_charge, s.gst_percent, gstAmount, s.government_fee + s.service_charge + gstAmount, 'INR', 'TRUE');
  // fields
  for (const [key, order, label, type, q, hint, req] of s.fields) {
    db.prepare(`INSERT INTO ${tb('service_fields')}
      (service_id,field_key,field_order,label,field_type,question,required,options,error_hint)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(s.service_id, key, order, label, type, q, req, s.fields_options[key] || '', hint || '');
  }
  // docs
  for (const [key, order, label, types, q, req] of s.docs) {
    db.prepare(`INSERT INTO ${tb('service_documents')}
      (service_id,doc_key,doc_order,label,accepted_types,question,required)
      VALUES (?,?,?,?,?,?,?)`)
      .run(s.service_id, key, order, label, types, q, req);
  }
  console.log('ADDED SERVICE: ' + s.service_id + ' (fields=' + s.fields.length + ', docs=' + s.docs.length + ')');
}

// ---------- 2. PAN_CARD: DOB proof mandatory ----------
if (!exists('service_fields', 'field_key', 'dob_proof_type')) {
  db.prepare(`INSERT INTO ${tb('service_fields')}
    (service_id,field_key,field_order,label,field_type,question,required,options,error_hint)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run('PAN_CARD','dob_proof_type','8','DOB Proof Type','CHOICE',
      'Aadhaar ke alawa DOB proof kaunsa document denge? (MARKSHEET_10TH / BIRTH_CERTIFICATE / VOTER_ID / DRIVING_LICENCE / PASSPORT / AFFIDAVIT)',
      'TRUE','MARKSHEET_10TH,BIRTH_CERTIFICATE,VOTER_ID,DRIVING_LICENCE,PASSPORT,AFFIDAVIT',
      'List mein se ek option likhein (Aadhaar ab DOB proof ke liye kaafi nahi hai)');
  console.log('ADDED FIELD: PAN_CARD.dob_proof_type');
} else console.log('SKIP field dob_proof_type (exists)');

if (!exists('service_documents', 'doc_key', 'dob_proof') ) {
  // careful: dob_proof also used by PASSPORT - check per service
  const p = db.prepare(`SELECT id FROM ${tb('service_documents')} WHERE service_id='PAN_CARD' AND doc_key='dob_proof'`).get();
  if (!p) {
    db.prepare(`INSERT INTO ${tb('service_documents')}
      (service_id,doc_key,doc_order,label,accepted_types,question,required)
      VALUES (?,?,?,?,?,?,?)`)
      .run('PAN_CARD','dob_proof','4','DOB Proof (10th Marksheet/Birth Cert)','image/jpeg,image/png,application/pdf',
        'DOB proof bhejein (10th marksheet / birth certificate / voter ID / DL)? Ab Aadhaar akela DOB proof nahi chalta.','TRUE');
    console.log('ADDED DOC: PAN_CARD.dob_proof');
  }
} else console.log('SKIP doc PAN dob_proof (check)');

db.prepare(`UPDATE ${tb('service_catalog')} SET description=?, processing_steps=?, updatedAt=? WHERE service_id='PAN_CARD'`)
  .run('Naya PAN card ya correction (e-PAN + Physical). DOB proof ab Aadhaar ke alawa bhi zaroori',
       '["Form 49A fill","Aadhaar + DOB proof upload","e-KYC + e-Sign OTP","Portal submission","Acknowledgement receipt"]', now());

// ---------- 3. GST_REG: business place proof ----------
const gpp = db.prepare(`SELECT id FROM ${tb('service_documents')} WHERE service_id='GST_REG' AND doc_key='business_place_proof'`).get();
if (!gpp) {
  db.prepare(`INSERT INTO ${tb('service_documents')}
    (service_id,doc_key,doc_order,label,accepted_types,question,required)
    VALUES (?,?,?,?,?,?,?)`)
    .run('GST_REG','business_place_proof','5','Business Place Proof','image/jpeg,image/png,application/pdf',
      'Business jagah ka proof bhejein (rent agreement / NOC / bijli bill)?','TRUE');
  console.log('ADDED DOC: GST_REG.business_place_proof');
} else console.log('SKIP doc GST place proof (exists)');

// ---------- 4. Certificate fees 30 -> 15 ----------
for (const sid of ['CASTE_CERT','DOMICILE','INCOME_CERT']) {
  db.prepare(`UPDATE ${tb('service_catalog')} SET government_fee=15, total_fee=15+service_charge+ROUND(service_charge*gst_percent/100), updatedAt=? WHERE service_id=?`).run(now(), sid);
  db.prepare(`UPDATE ${tb('service_pricing')} SET gov_fee=15, gst_amount=ROUND(service_charge*gst_percent/100), total_fee=15+service_charge+ROUND(service_charge*gst_percent/100), updatedAt=? WHERE service_id=?`).run(now(), sid);
}
console.log('UPDATED FEES: CASTE_CERT/DOMICILE/INCOME_CERT gov_fee -> 15 (total 74)');

// ---------- verify ----------
console.log('\n=== FINAL STATE ===');
for (const r of db.prepare(`SELECT service_id, service_name, government_fee g, service_charge s, total_fee t FROM ${tb('service_catalog')} ORDER BY id`).all())
  console.log(`${r.service_id} | ${r.service_name} | govt:${r.g} + svc:${r.s} = total:${r.t}`);
console.log('fields: ' + db.prepare(`SELECT COUNT(*) c FROM ${tb('service_fields')}`).get().c +
  ', docs: ' + db.prepare(`SELECT COUNT(*) c FROM ${tb('service_documents')}`).get().c);
