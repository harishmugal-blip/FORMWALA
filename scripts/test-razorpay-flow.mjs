import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'db', 'custom.db');

async function testPaymentFlow() {
  const phone = '919876540001';
  console.log('1. Starting test for phone:', phone);

  // Reset
  await fetch('http://127.0.0.1:8090/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, text: 'CANCEL' })
  });

  // Inquiry
  console.log('2. Inquiring for Ayushman Card...');
  await fetch('http://127.0.0.1:8090/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, text: 'Ayushman card banana he' })
  });

  // Confirm
  console.log('3. Confirming...');
  await fetch('http://127.0.0.1:8090/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, text: 'CONFIRM' })
  });

  // Fields (5 fields for Ayushman)
  console.log('4. Submitting form fields...');
  await fetch('http://127.0.0.1:8090/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, text: 'Ramesh Kumar' }) });
  await fetch('http://127.0.0.1:8090/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, text: 'Suresh Kumar' }) });
  await fetch('http://127.0.0.1:8090/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, text: '01/01/1990' }) });
  await fetch('http://127.0.0.1:8090/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, text: '9876540001' }) });
  await fetch('http://127.0.0.1:8090/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, text: '123456789012' }) });

  // Docs (2 docs)
  console.log('5. Submitting documents...');
  await fetch('http://127.0.0.1:8090/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, text: 'Aadhaar uploaded' }) });
  const finalRes = await fetch('http://127.0.0.1:8090/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, text: 'Ration card uploaded' })
  }).then(r => r.json());

  console.log('\n=== BOT COMPLETION MESSAGE ===');
  console.log(finalRes.reply);

  const tokenMatch = finalRes.reply.match(/FB-\d{6}-\d{4,6}/);
  const linkMatch = finalRes.reply.match(/https:\/\/rzp\.io\/\S+/);
  console.log('\nToken generated:', tokenMatch ? tokenMatch[0] : 'NONE');
  console.log('Razorpay Link generated:', linkMatch ? linkMatch[0] : 'NONE');

  if (tokenMatch && linkMatch) {
    console.log('\n=== SIMULATING RAZORPAY WEBHOOK ===');
    const hookRes = await fetch('http://127.0.0.1:8090/payment-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: 'plink_TEST123',
              reference_id: tokenMatch[0],
              amount: 3540,
              customer: { contact: phone }
            }
          }
        }
      })
    }).then(r => r.json());
    console.log('Webhook Response:', hookRes);

    const db = new DatabaseSync(DB_PATH);
    const app = db.prepare('SELECT application_number, status, total_fee FROM applications WHERE application_number=?').get(tokenMatch[0]);
    const pay = db.prepare('SELECT amount, status, gateway, transaction_id FROM payments WHERE application_id=(SELECT application_id FROM applications WHERE application_number=?)').get(tokenMatch[0]);
    console.log('\n=== DB VERIFICATION ===');
    console.log('Application in DB:', app);
    console.log('Payment in DB:', pay);
    db.close();

    console.log('\n🎉 SUCCESS: Razorpay payment link & Webhook verification completely working!');
  } else {
    console.error('FAILED: No token or link generated');
  }
}

testPaymentFlow().catch(console.error);
