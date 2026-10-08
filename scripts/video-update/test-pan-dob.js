// Verify PAN flow now collects 8 fields incl. dob_proof_type
const BASE = 'http://localhost:3000/webhook/whatsapp';
const phone = '919876517704';
let counter = Date.now();

async function send(text) {
  const res = await fetch(BASE, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
      messaging_product: 'whatsapp',
      contacts: [{ profile: { name: 'PAN DOB Test' }, wa_id: phone }],
      messages: [{ from: phone, id: 'wamid.' + (counter++), timestamp: String(Math.floor(Date.now()/1000)), type: 'text', text: { body: text } }]
    } }] }] })
  });
  const j = await res.json().catch(() => ({}));
  return (j.reply || JSON.stringify(j).slice(0, 200));
}

(async () => {
  const steps = [
    'pan card banana hai',
    'CONFIRM',
    'Rahul Sharma',            // full_name
    'Suresh Sharma',           // father_name
    '15/08/1999',              // dob
    '9876543210',              // mobile
    'rahul@example.com',       // email
    'H.No 12, Gandhi Nagar, Lucknow, Uttar Pradesh, 226001', // address
    '123412341234',            // aadhaar
    'MARKSHEET_10TH',          // dob_proof_type (NEW FIELD!)
  ];
  for (const s of steps) {
    const r = await send(s);
    console.log('>>> ' + s.slice(0, 40));
    console.log(r.slice(0, 220));
    console.log('');
  }
})();
