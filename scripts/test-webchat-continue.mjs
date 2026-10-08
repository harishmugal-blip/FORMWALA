// Continue E2E v2: finish PAN flow with correct answers → docs → payment → verify n8n
import { Database } from "bun:sqlite";

const BASE = "http://127.0.0.1:3000";
const sid = process.argv[2];
if (!sid) { console.log("usage: bun test-webchat-continue.mjs <sessionId>"); process.exit(1); }

async function send(text, attachment) {
  const r = await fetch(`${BASE}/api/webchat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: sid, text, attachment }),
  });
  return r.json();
}
function show(label, j) {
  console.log(`\n===== ${label} → ${j.stage} =====`);
  for (const b of (j.messages || []).filter((m) => m.role === "bot")) {
    console.log("BOT:", (b.text.length > 130 ? b.text.slice(0, 130) + "…" : b.text).replace(/\n/g, " | "));
    if (b.expectFile) console.log("  [file expected]");
  }
}

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// remaining fields in order: mobile, email, address, aadhaar, dob_proof_type (CHOICE)
const answers = [
  ["9876501234", "FIELD mobile"],
  ["harish@example.com", "FIELD email"],
  ["Ward 5, Main Road, Gaya, Bihar - 823001", "FIELD address"],
  ["123456789012", "FIELD aadhaar"],
  ["Aadhaar Card", "FIELD dob proof type (choice)"],
];

(async () => {
  let j;
  for (const [text, label] of answers) {
    j = await send(text);
    show(label, j);
    if (j.stage !== "FIELDS") break;
  }

  // docs: 4 required — send files
  const docNames = ["aadhaar card", "passport photo", "signature", "dob proof"];
  for (let i = 0; i < docNames.length && j.stage === "DOCS"; i++) {
    j = await send("", { name: `${docNames[i].replace(/ /g, "_")}.png`, type: "image/png", size: 120, dataUrl: png });
    show(`DOC ${i + 1}: ${docNames[i]}`, j);
  }

  // payment
  if (j.stage === "PAYMENT") {
    j = await send("paid");
    show("PAID → DONE", j);
  }

  // verify n8n writes
  console.log("\n--- n8n DB check ---");
  const db = new Database("/home/z/.n8n/database.sqlite");
  const tid = (n) => db.prepare("SELECT id FROM data_table WHERE name=?").get(n).id;
  try {
    const apps = db
      .prepare(`SELECT application_number, customer_phone, service_id, status, total_fee FROM data_table_user_${tid("applications")} ORDER BY rowid DESC LIMIT 2`)
      .all();
    console.log("applications:", JSON.stringify(apps));
    const custs = db
      .prepare(`SELECT phone, full_name, consent_status FROM data_table_user_${tid("customers")} WHERE full_name LIKE '%Harish%'`)
      .all();
    console.log("customers:", JSON.stringify(custs));
    const tasks = db
      .prepare(`SELECT application_number, status, note FROM data_table_user_${tid("operator_tasks")} ORDER BY rowid DESC LIMIT 2`)
      .all();
    console.log("operator_tasks:", JSON.stringify(tasks));
    const pays = db
      .prepare(`SELECT application_id, amount, gateway, status FROM data_table_user_${tid("payments")} ORDER BY rowid DESC LIMIT 2`)
      .all();
    console.log("payments:", JSON.stringify(pays));
  } catch (e) {
    console.log("check failed:", String(e).slice(0, 150));
  }
  db.close();
})();
