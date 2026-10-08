// Demo continuation: send one message, print the customer's WhatsApp reply
const BASE = "http://localhost:3000";
const PHONE = process.argv[2] || "919876511122";
const TEXT = process.argv[3];
if (!TEXT) { console.log("usage: bun demo-reply.js <phone> <text>"); process.exit(1); }

const payload = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ value: {
    messages: [{ from: PHONE, id: "wamid.d" + Date.now(), timestamp: String(Math.floor(Date.now() / 1000)), text: { body: TEXT }, type: "text" }],
    contacts: [{ profile: { name: "Ramesh Kumar" }, wa_id: PHONE }]
  }, field: "messages" }] }]
};

const res = await fetch(BASE + "/webhook/whatsapp", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
});
const body = await res.json().catch(async () => ({ raw: await res.text() }));
console.log("HTTP", res.status);
console.log("REPLY:", body.reply || JSON.stringify(body));
