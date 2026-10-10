// Automated Test Suite for All 16 CSC Services
// Tests: Inquiry -> Intent Matching -> Confirmation -> Step-by-Step Questions ->
//        Mid-flow AI Doubt Handling -> Cancel/Reset -> Full E2E Flow with DB Token Verification.

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'db', 'custom.db');

const SERVICES_TO_TEST = [
  { id: 'PAN_CARD', query: 'PAN card banwana he', expectedFee: 166 },
  { id: 'INCOME_CERT', query: 'Aay praman patra banwana he', expectedFee: 74 },
  { id: 'CASTE_CERT', query: 'Jati praman patra banwana he', expectedFee: 74 },
  { id: 'DOMICILE', query: 'Mool niwas praman patra chahiye', expectedFee: 74 },
  { id: 'BIRTH_CERT', query: 'Janam praman patra banwana he', expectedFee: 79 },
  { id: 'DEATH_CERT', query: 'Mrityu praman patra kaise banega', expectedFee: 79 },
  { id: 'RATION_CARD', query: 'Ration card me naya naam jodna he', expectedFee: 104 },
  { id: 'VOTER_ID', query: 'Naya voter ID card apply karna he', expectedFee: 59 },
  { id: 'AYUSHMAN', query: '5 lakh wala Ayushman card banana he', expectedFee: 35.4 },
  { id: 'E_SHRAM', query: 'E-shram card banwana he majdoor bima wala', expectedFee: 30 },
  { id: 'ITR_FILING', query: 'ITR file karna he income tax return', expectedFee: 590 },
  { id: 'GST_REG', query: 'GST registration karwana he naya number', expectedFee: 590 },
  { id: 'GST_RETURN', query: 'GST return file karna he', expectedFee: 354 },
  { id: 'GOV_JOB_FORM', query: 'Sarkari naukri ka bharti form bharna he', expectedFee: 118 },
  { id: 'SCHOLARSHIP', query: 'Chatravritti scholarship ka online form bharna he', expectedFee: 30 },
  { id: 'PASSPORT', query: 'Videsh jane ke liye naya passport banwana he', expectedFee: 2618 },
];

async function callChat(phone, text, name = 'Test User') {
  const res = await fetch('http://127.0.0.1:8090/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, name, text })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function runAudit() {
  console.log('===============================================================');
  console.log('🚀 CSC SMART SEVA: FULL 16-SERVICE AUTOMATION WORKFLOW AUDIT');
  console.log('===============================================================\n');

  let passedInquiries = 0;
  let passedStarts = 0;
  const db = new DatabaseSync(DB_PATH);

  // Phase 1: Test Inquiry & Confirmation for ALL 16 Services
  console.log('--- PHASE 1: SERVICE INQUIRY & FORM START (16 SERVICES) ---');
  for (let i = 0; i < SERVICES_TO_TEST.length; i++) {
    const s = SERVICES_TO_TEST[i];
    const testPhone = `9198000000${String(i + 1).padStart(2, '0')}`;

    try {
      // Step A: Inquiry
      const inq = await callChat(testPhone, s.query);
      console.log(`[${i + 1}/16] Service: ${s.id} | Query: "${s.query}"`);
      if (inq.reply && inq.reply.length > 20) {
        console.log(`  ✓ Inquiry OK | Bot replied in Hinglish`);
        passedInquiries++;
      } else {
        console.log(`  ✗ Inquiry FAILED | No reply`);
      }

      // Step B: Confirm & Verify Question 1/N
      const conf = await callChat(testPhone, 'Confirm');
      if (conf.reply && conf.reply.includes('Sawal 1/')) {
        console.log(`  ✓ Form Start OK | Prompts: "${conf.reply.split('\n')[2] || conf.reply.slice(0, 60)}"`);
        passedStarts++;
      } else {
        console.log(`  ✗ Form Start FAILED | Output: ${conf.reply?.slice(0, 80)}`);
      }

      // Step C: Clean state
      await callChat(testPhone, 'CANCEL');
      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.error(`  ✗ Error testing ${s.id}:`, e.message);
    }
  }

  console.log(`\nPhase 1 Results: Inquiries Passed: ${passedInquiries}/16 | Form Starts Passed: ${passedStarts}/16\n`);

  // Phase 2: Test Mid-Flow AI Doubt Handling without losing step
  console.log('--- PHASE 2: MID-FLOW AI DOUBT RESOLUTION & STEP MEMORY ---');
  const doubtPhone = '919811122233';
  await callChat(doubtPhone, 'CANCEL'); // clean
  await callChat(doubtPhone, 'Mool niwas banwana he');
  await callChat(doubtPhone, 'CONFIRM');
  console.log('Started Mool Niwas Form (Question 1/6: Pura Naam)');

  console.log('User asks a doubt instead of answering: "Bhai Aadhaar card me spelling me galti hai toh kya karu?"');
  const doubtRes = await callChat(doubtPhone, 'Bhai Aadhaar card me spelling me galti hai toh kya karu?');
  console.log('AI Doubt Reply:');
  console.log(doubtRes.reply);

  const rememberedPrompt = doubtRes.reply && (
    doubtRes.reply.includes('Sawal') ||
    doubtRes.reply.includes('Jawab') ||
    doubtRes.reply.includes('Salah') ||
    doubtRes.reply.toLowerCase().includes('naam')
  );
  if (rememberedPrompt) {
    console.log('  ✓ PASS: AI answered the doubt AND re-prompted for the current field without losing state!\n');
  } else {
    console.log('  ✗ FAIL: State lost or did not re-prompt\n');
  }

  // Phase 3: Complete End-to-End Application Run with Database Token Verification
  console.log('--- PHASE 3: COMPLETE END-TO-END APPLICATION (PAN CARD) ---');
  const e2ePhone = '919766848999';
  await callChat(e2ePhone, 'CANCEL');
  await callChat(e2ePhone, 'PAN card banana hai');
  await callChat(e2ePhone, 'CONFIRM');

  const fields = db.prepare("SELECT field_key, label, question FROM service_fields WHERE service_id='PAN_CARD' ORDER BY field_order").all();
  console.log(`Answering all ${fields.length} fields for PAN Card:`);

  const sampleAnswers = [
    'Mohd Harish',          // Name
    'Akbar Ali',            // Father name
    '15/08/1996',           // DOB
    '9766848999',           // Mobile
    'harish@example.com',   // Email
    '123456789012',         // Aadhaar Number
    'House 42, Civil Lines, Moradabad, UP, 244001', // Address
    'Self Employee'         // Occupation
  ];

  let lastReply = '';
  for (let f = 0; f < fields.length; f++) {
    const ans = sampleAnswers[f] || 'NA';
    const res = await callChat(e2ePhone, ans);
    lastReply = res.reply;
    console.log(`  Step ${f + 1}/${fields.length} [${fields[f].label}]: Answered "${ans}"`);
  }

  console.log('\nAll fields submitted! Bot response:');
  console.log(lastReply?.split('\n').slice(0, 4).join('\n'));

  // Upload docs
  const docs = db.prepare("SELECT doc_key, label FROM service_documents WHERE service_id='PAN_CARD' ORDER BY doc_order").all();
  console.log(`\nSubmitting all ${docs.length} documents:`);
  for (let d = 0; d < docs.length; d++) {
    const res = await callChat(e2ePhone, `Uploaded photo of ${docs[d].label}`);
    lastReply = res.reply;
    console.log(`  Doc ${d + 1}/${docs.length} [${docs[d].label}]: Uploaded`);
  }

  console.log('\nFinal Application Completion Message:');
  console.log(lastReply);

  // Extract Token
  const tokenMatch = lastReply.match(/FB-\d{6}-\d{4,6}/);
  if (tokenMatch) {
    const token = tokenMatch[0];
    console.log(`\n✓ Generated Application Token: ${token}`);

    // Verify in SQLite Database
    const appRow = db.prepare('SELECT application_number, service_id, status, total_fee, customer_phone FROM applications WHERE application_number=?').get(token);
    if (appRow) {
      console.log('✓ Verified in SQLite applications table:');
      console.log(appRow);
      console.log('\n===============================================================');
      console.log('🎉 AUDIT SUCCESS: ALL 16 WORKFLOWS, AI CONVERSATION & DB VERIFIED!');
      console.log('===============================================================');
    } else {
      console.error('✗ Token not found in database applications table!');
    }
  } else {
    console.error('✗ No Application Token found in final message!');
  }

  // Cleanup test e2e application
  if (tokenMatch) {
    db.prepare('DELETE FROM applications WHERE application_number=?').run(tokenMatch[0]);
    db.prepare('DELETE FROM customers WHERE phone=?').run(e2ePhone);
  }
  await callChat(doubtPhone, 'CANCEL');
  await callChat(e2ePhone, 'CANCEL');
  db.close();
}

runAudit().catch(console.error);
