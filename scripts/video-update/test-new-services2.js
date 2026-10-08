const BASE = 'http://localhost:3000/webhook/whatsapp';
let counter = Date.now();

async function send(text, phone) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: {
        messaging_product: 'whatsapp',
        contacts: [{ profile: { name: 'Video Test' }, wa_id: phone }],
        messages: [{ from: phone, id: 'wamid.' + (counter++), timestamp: String(Math.floor(Date.now()/1000)), type: 'text', text: { body: text } }]
      } }] }]
    })
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, reply: j.reply || JSON.stringify(j).slice(0, 300) };
}

(async () => {
  console.log('=== TEST 1: ration card (fresh 919876517701) ===');
  let r = await send('ration card banana hai', '919876517701');
  console.log('[' + r.status + '] ' + (r.reply || '').slice(0, 300));

  console.log('\n=== TEST 2: passport (fresh 919876517702) ===');
  r = await send('passport banwana hai', '919876517702');
  console.log('[' + r.status + '] ' + (r.reply || '').slice(0, 300));

  console.log('\n=== TEST 3: caste cert fee (fresh 919876517703) ===');
  r = await send('caste certificate banana hai', '919876517703');
  console.log('[' + r.status + '] ' + (r.reply || '').slice(0, 300));
})();
