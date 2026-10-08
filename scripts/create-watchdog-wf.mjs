// Create CSC 00 - Services Watchdog workflow (schedule → execute command)
const API = "http://127.0.0.1:5678/api/v1";
const KEY = "n8n_api_csc-build-2026-a7f3d9e2b8c4";
const HDR = { "X-N8N-API-KEY": KEY, "content-type": "application/json" };

async function api(p, m = "GET", b) {
  const r = await fetch(API + p, {
    method: m,
    headers: HDR,
    body: b ? JSON.stringify(b) : undefined,
  });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200), status: r.status }; }
}

const wf = {
  name: "CSC 00 - Services Watchdog",
  settings: { executionOrder: "v1" },
  nodes: [
    {
      parameters: {
        rule: { interval: [{ field: "minutes", minutesInterval: 1 }] },
      },
      id: "sched-1",
      name: "Every minute",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
    },
    {
      parameters: {
        command: "bash /home/z/my-project/scripts/services-check.sh",
      },
      id: "cmd-1",
      name: "Health check + restart",
      type: "n8n-nodes-base.executeCommand",
      typeVersion: 1,
      position: [220, 0],
    },
  ],
  connections: {
    "Every minute": { main: [[{ node: "Health check + restart", type: "main", index: 0 }]] },
  },
};

// upsert by name
const list = await api("/workflows?limit=100");
const existing = (list.data || []).find((w) => w.name === wf.name);
if (existing) {
  const upd = await api(`/workflows/${existing.id}`, "PUT", {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings,
  });
  console.log("updated:", upd.id, "| active:", upd.active);
  if (!upd.active) {
    const p = await api(`/workflows/${upd.id}/activate`, "POST");
    console.log("activated:", p.active);
  }
} else {
  const cr = await api("/workflows", "POST", wf);
  console.log("created:", cr.id);
  const p = await api(`/workflows/${cr.id}/activate`, "POST");
  console.log("activated:", p.active);
}
