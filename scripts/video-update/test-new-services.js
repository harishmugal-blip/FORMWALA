// Live test: classification of RATION_CARD + PASSPORT + PAN DOB proof field flow
const BASE = 'http://localhost:3000/webhook/whatsapp';
const phone = '919876519901';

async function send(text) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {
        messaging_product: 'whatsapp',
        contacts: [{ profile: { name: 'Video Test' }, wa_id: phone }],
        messages: [{ from: phone, id: 'wamid.test' + Date.now(), timestamp: String(Math.floor(Date.now()/1000)), type: 'text', text: { body: text } }]
      } }] }]
    })
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, reply: j.reply || JSON.stringify(j).slice(0, 400) };
}

(async () => {
  console.log('=== TEST 1: "ration card banana hai" ===');
  let r = await send('ration card banana hai');
  console.log('[' + r.status + '] ' + (r.reply || '(no reply)').slice(0, 300));

  console.log('\n=== TEST 2: "passport banwana hai" ===');
  r = await send('passport banwana hai');
  console.log('[' + r.status + '] ' + (r.reply || '(no reply)').slice(0, 300));

  console.log('\n=== TEST 3: "caste certificate banana hai" (fee check 74) ===');
  r = await send('caste certificate banana hai');
  console.log('[' + r.status + '] ' + (r.reply || '(no reply)').slice(0, 300));
})();
