// FREE WhatsApp (Baileys bridge) integration:
// 1) system_config: WHATSAPP_API_BASE + BRIDGE creds
// 2) CSC 01: add "Get API Base" node, rewire, use base in Send WhatsApp Reply
// 3) CSC 20: repoint Get API Ver -> WHATSAPP_API_BASE, use base in Send WhatsApp
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const BASE = "http://127.0.0.1:4000/api/v1";
const H = { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" };
const BRIDGE = "http://127.0.0.1:3010";

async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: H, ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// ---------- 1. system_config ----------
async function config() {
  const tabs = await api("/data-tables?limit=100");
  const sc = tabs.data.find(t => t.name === "system_config");
  const rows = await api(`/data-tables/${sc.id}/rows?limit=50`);
  const byKey = {};
  for (const r of rows.data) byKey[r.config_key] = r.id;

  async function upsert(key, value) {
    const body = JSON.stringify({
      filter: { type: "and", filters: [{ columnName: "config_key", condition: "eq", value: key }] },
      data: { config_key: key, config_value: value, description: "auto" }
    });
    const r = await fetch(`${BASE}/data-tables/${sc.id}/rows/upsert`, { method: "POST", headers: H, body });
    if (r.ok) { console.log(`  ~ ${key} = ${value}`); }
    else { console.error(`  X ${key}: ${r.status} ${await r.text()}`); process.exitCode = 1; }
  }
  await upsert("WHATSAPP_API_BASE", BRIDGE);
  await upsert("WHATSAPP_PHONE_NUMBER_ID", "BRIDGE-LOCAL");
  await upsert("WHATSAPP_ACCESS_TOKEN", "csc-free-bridge-2026");
}

// ---------- 2/3. workflows ----------
function makeGetApiBase(pos) {
  return {
    parameters: {
      resource: "row", operation: "get",
      dataTableId: { __rl: true, mode: "name", value: "system_config" },
      matchType: "allConditions",
      filters: { conditions: [{ keyName: "config_key", condition: "eq", keyValue: "=WHATSAPP_API_BASE" }] },
      returnAll: false, limit: 1
    },
    name: "Get API Base", type: "n8n-nodes-base.dataTable", typeVersion: 1.1,
    position: pos, alwaysOutputData: true,
    id: "b66dc0b3-fa11-ba5e-0001-c3f720434a86"
  };
}

async function patchCSC01() {
  const list = await api("/workflows?limit=100");
  const wf = list.data.find(w => w.name.startsWith("CSC 01"));
  const full = await api(`/workflows/${wf.id}`);
  const nodes = full.nodes, conn = full.connections;

  if (!nodes.find(n => n.name === "Get API Base")) {
    const tok = nodes.find(n => n.name === "Get WA Token");
    nodes.push(makeGetApiBase([(tok?.position?.[0] ?? 0) + 220, tok?.position?.[1] ?? 0]));
    // rewire: Get WA Token -> Get API Base -> Route Decision
    conn["Get WA Token"] = { main: [[{ node: "Get API Base", type: "main", index: 0 }]] };
    conn["Get API Base"] = { main: [[{ node: "Route Decision", type: "main", index: 0 }]] };
  }

  const bsp = nodes.find(n => n.name === "Build Send Payload");
  bsp.parameters.jsCode = `
const pid = $('Get Phone ID').first().json.config_value || '';
const token = $('Get WA Token').first().json.config_value || '';
let base = 'https://graph.facebook.com';
try { base = $('Get API Base').first().json.config_value || base; } catch (e) {}
if (!/^https?:\\/\\//.test(base)) base = 'https://graph.facebook.com';
const ready = pid && token && !pid.startsWith('SET_') && !token.startsWith('SET_');
return [{ json: { ready, pid, token, api_base: base, to: $json.phone, reply: String($json.reply || '').slice(0, 4096) } }];`.trim();

  const swr = nodes.find(n => n.name === "Send WhatsApp Reply");
  swr.parameters.url = "={{ $('Build Send Payload').first().json.api_base }}/v21.0/{{ $('Build Send Payload').first().json.pid }}/messages";

  await api(`/workflows/${wf.id}`, { method: "PUT", body: JSON.stringify({ name: full.name, nodes, connections: conn, settings: full.settings }) });
  await api(`/workflows/${wf.id}/activate`, { method: "POST" });
  console.log(`CSC 01 patched + activated (${wf.id})`);
}

async function patchCSC20() {
  const list = await api("/workflows?limit=100");
  const wf = list.data.find(w => w.name.startsWith("CSC 20"));
  const full = await api(`/workflows/${wf.id}`);
  const nodes = full.nodes;

  const gav = nodes.find(n => n.name === "Get API Ver");
  gav.parameters.filters.conditions[0].keyValue = "=WHATSAPP_API_BASE";

  const cwc = nodes.find(n => n.name === "Check WA Creds");
  cwc.parameters.jsCode = cwc.parameters.jsCode.replace(
    "|| 'v21.0'",
    "|| 'https://graph.facebook.com/v21.0'"
  );

  const sw = nodes.find(n => n.name === "Send WhatsApp");
  sw.parameters.url = "={{ $json.ver }}/{{ $json.pid }}/messages";

  await api(`/workflows/${wf.id}`, { method: "PUT", body: JSON.stringify({ name: full.name, nodes, connections: full.connections, settings: full.settings }) });
  await api(`/workflows/${wf.id}/activate`, { method: "POST" });
  console.log(`CSC 20 patched + activated (${wf.id})`);
}

(async () => {
  console.log("== system_config ==");
  await config();
  console.log("== CSC 01 ==");
  await patchCSC01();
  console.log("== CSC 20 ==");
  await patchCSC20();
  console.log("\nALL PATCHED ✓");
})().catch(e => { console.error("PATCH FAILED:", e.message); process.exit(1); });
