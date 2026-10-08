const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const BASE = "http://localhost:3000/api/v1";

const tables = await fetch(`${BASE}/data-tables?limit=50`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
const targets = ["service_catalog", "service_fields", "service_documents", "service_pricing", "system_config", "customers", "applications", "payments", "audit_log", "conversation_state", "operator_tasks"];

for (const name of targets) {
  const t = tables.data.find(x => x.name === name);
  if (!t) { console.log(`${name}: NOT FOUND`); continue; }
  const r = await fetch(`${BASE}/data-tables/${t.id}/rows?limit=200`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
  console.log(`${name}: ${(r.data || []).length} rows`);
}

// E2E smoke test: fire a real WhatsApp message at the router
console.log("\n--- E2E SMOKE TEST ---");
const payload = {
  object: "whatsapp_business_account",
  entry: [{
    changes: [{
      value: {
        messages: [{ from: "919876509999", id: "wamid.smoke" + Date.now(), timestamp: String(Math.floor(Date.now() / 1000)), text: { body: "hello, mujhe pan card banana hai" }, type: "text" }],
        contacts: [{ profile: { name: "Smoke Test" }, wa_id: "919876509999" }]
      },
      field: "messages"
    }]
  }]
};
const res = await fetch("http://localhost:3000/webhook/whatsapp", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
});
console.log("Webhook HTTP status:", res.status, res.statusText);
await new Promise(r => setTimeout(r, 25000)); // wait for AI + flow

const apps = tables.data.find(x => x.name === "applications");
const ar = await fetch(`${BASE}/data-tables/${apps.id}/rows?limit=200`, { headers: { "X-N8N-API-KEY": KEY } }).then(r => r.json());
const mine = (ar.data || []).filter(x => x.customer_wa_id === "919876509999" || JSON.stringify(x).includes("919876509999"));
console.log("Applications created by smoke test:", mine.length);
if (mine.length) console.log("Latest:", JSON.stringify(mine[mine.length - 1]).slice(0, 300));
