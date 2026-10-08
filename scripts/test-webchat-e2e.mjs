// E2E test: web chatbot flow — ID creation → service → fields → docs → payment
const BASE = "http://127.0.0.1:3000";
const sid = "test-" + Date.now().toString(36);

async function send(text, attachment) {
  const r = await fetch(`${BASE}/api/webchat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: sid, text, attachment }),
  });
  const j = await r.json();
  const bots = (j.messages || []).filter((m) => m.role === "bot");
  return { stage: j.stage, customerId: j.customerId, bots };
}

function show(label, res) {
  console.log(`\n===== ${label} → stage: ${res.stage} =====`);
  for (const b of res.bots) {
    const preview = b.text.length > 150 ? b.text.slice(0, 150) + "…" : b.text;
    console.log("BOT:", preview.replace(/\n/g, " | "));
    if (b.chips?.length) console.log("  chips:", b.chips.join(" / "));
    if (b.cards?.length) console.log("  cards:", b.cards.length, "services");
    if (b.expectFile) console.log("  [expects file]");
  }
}

(async () => {
  // 1. init
  let r = await send("");
  show("INIT", r);

  // 2. greeting
  r = await send("Hi");
  show("GREETING", r);

  // 3. name
  r = await send("Harish Mirza");
  show("NAME", r);

  // 4. phone → customer ID
  r = await send("9876543210");
  show("PHONE (ID banna chahiye)", r);
  if (!r.customerId) {
    console.log("❌ FAIL: customer ID nahi bani");
    process.exit(1);
  }
  console.log("✅ Customer ID:", r.customerId);

  // 5. select service
  r = await send("PAN Card");
  show("SERVICE SELECT", r);

  // 6. confirm
  r = await send("confirm");
  show("CONFIRM → first field", r);

  // 7. answer 2 fields fast-forward
  r = await send("Ramesh Kumar Sharma");
  show("FIELD 1 (full_name)", r);
  r = await send("Suresh Kumar Sharma");
  show("FIELD 2 (father_name)", r);
  r = await send("15/08/1998");
  show("FIELD 3 (dob)", r);

  // side question test (AI gate — ai-agent down ho to passthrough hoga)
  r = await send("ye PAN card kitne din me ban jata he bhai?");
  show("SIDE QUESTION", r);

  console.log("\nSession:", sid);
})();
