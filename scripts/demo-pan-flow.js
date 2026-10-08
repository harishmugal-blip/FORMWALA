/**
 * LIVE DEMO - PAN card flow walkthrough
 * Customer "Ramesh" (919876511122) chats like a real user; we print the
 * exact WhatsApp replies the system generates (from notifications_log).
 */
const BASE = "http://localhost:3000";
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const PHONE = "919876511122";
const NAME = "Ramesh Kumar";

function metaPayload(text, msgId) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        value: {
          messages: [{ from: PHONE, id: "wamid.demo" + msgId, timestamp: String(Math.floor(Date.now() / 1000)), text: { body: text }, type: "text" }],
          contacts: [{ profile: { name: NAME }, wa_id: PHONE }]
        },
        field: "messages"
      }]
    }]
  };
}

async function sendCustomer(text) {
  const res = await fetch(`${BASE}/webhook/whatsapp`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metaPayload(text, Date.now()))
  });
  console.log(`   [customer sent] HTTP ${res.status} -> "${text}"`);
}

async function readReplies(label, waitMs = 22000) {
  await new Promise(r => setTimeout(r, waitMs));
  const t = await fetch(`${BASE}/api/v1/data-tables?limit=100`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
  const nl = t.data.find(x => x.name === "notifications_log");
  const rows = await fetch(`${BASE}/api/v1/data-tables/${nl.id}/rows?limit=200`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
  const mine = (rows.data || []).filter(r => JSON.stringify(r).includes(PHONE));
  // sort newest first, take replies since label start
  console.log(`\n📱 WHATSAPP REPLY (${label}):`);
  const latest = mine.slice(-3);
  for (const m of latest) {
    const vals = Object.values(m);
    // find the message text field
    const text = vals.find(v => typeof v === "string" && v.length > 30) || JSON.stringify(m);
    const to = vals.find(v => typeof v === "string" && v.replace(/\D/g, "").length === 12) || "";
    console.log(`   ┌─────────────────────────────────────`);
    console.log(`   │ ${String(text).slice(0, 700)}`);
    console.log(`   └─────────────────────────────────────`);
  }
  return mine;
}

async function main() {
  console.log("=== LIVE DEMO: 'mujhe PAN card banana hai' ===\n");

  // STEP 1: naya customer, natural Hinglish
  console.log("── STEP 1: Ramesh ne message bheja ──");
  await sendCustomer("namaste, mujhe pan card banana hai");
  await readReplies("AI intent + service confirmation");

  // STEP 2: confirm karta hai
  console.log("\n── STEP 2: Ramesh confirm karta hai ──");
  await sendCustomer("CONFIRM");
  await readReplies("Field 1 maanga jayega");

  // STEP 3: pehla field GALAT dete hain (validation dikhane ke liye)
  console.log("\n── STEP 3: Galat answer (validation test) ──");
  await sendCustomer("mera naam 12345 hai");
  await readReplies("Validator reject karega", 15000);

  // STEP 4: ab sahi answers ek ke baad ek
  console.log("\n── STEP 4: Sahi jawab (fields complete) ──");
  const answers = ["Ramesh Kumar", "15/08/1990", "919876511122", "HINDU", "12/3, Gandhi Nagar, Jaipur, Rajasthan 302001"];
  for (const a of answers) {
    await sendCustomer(a);
    await new Promise(r => setTimeout(r, 14000));
  }
  await readReplies("Fields done -> doc upload request", 18000);

  // STEP 5: documents (media webhook se aate hain - simulate)
  console.log("\n── STEP 5: Documents upload (3 documents) ──");
  const docMedia = [
    { type: "image/jpeg", id: "media_aadhaar_demo", filename: "aadhaar.jpg" },
    { type: "image/jpeg", id: "media_photo_demo", filename: "photo.jpg" },
    { type: "image/jpeg", id: "media_sign_demo", filename: "signature.jpg" }
  ];
  for (const d of docMedia) {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: {
        messages: [{ from: PHONE, id: "wamid.doc" + d.id, timestamp: String(Math.floor(Date.now() / 1000)), image: { id: d.id, mime_type: d.type }, type: "image" }],
        contacts: [{ profile: { name: NAME }, wa_id: PHONE }]
      }, field: "messages" }] }]
    };
    const res = await fetch(`${BASE}/webhook/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    console.log(`   [doc sent] ${d.filename} -> HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 12000));
  }
  await readReplies("Pricing + Payment link", 20000);

  console.log("\n=== DEMO PART 1 COMPLETE ===");
}
main().catch(e => { console.error("DEMO FAILED:", e); process.exit(1); });
