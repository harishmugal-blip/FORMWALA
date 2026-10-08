// Map inter-workflow connections: who calls whom (executeWorkflow nodes + webhook entry points)
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite", { readonly: true });
const wfs = db.prepare("SELECT id, name, nodes, connections FROM workflow_entity WHERE name LIKE 'CSC%' ORDER BY name").all();

// Build id->name map and name->number map
const idToName = {};
for (const w of wfs) idToName[w.id] = w.name.replace("CSC ", "").replace(/ - .*/, "").trim();

const shortName = (n) => n.replace("CSC ", "").replace(/ - .*/, "").trim();

console.log("=== CALL GRAPH (kaun kisko call karta hai) ===\n");
for (const wf of wfs) {
  const nodes = JSON.parse(wf.nodes);
  const conns = JSON.parse(wf.connections);
  const me = shortName(wf.name);
  const calls = [];

  for (const n of nodes) {
    // executeWorkflowTrigger targets = my "entry points" for other workflows
    if (n.type === "n8n-nodes-base.executeWorkflowTrigger") {
      calls.push(`◀ ENTRY (sub-workflow ka start)`);
    }
    // n8n-nodes-base.executeWorkflow = calls another workflow
    if (n.type === "n8n-nodes-base.executeWorkflow") {
      const wid = n.parameters?.workflowId;
      let target = "?";
      if (typeof wid === "object" && wid?.value) target = idToName[wid.value] || wid.value;
      else if (typeof wid === "string") target = idToName[wid] || wid;
      const label = n.name || "call";
      calls.push(`→ CSC ${target}  (via "${label}")`);
    }
    // webhook triggers
    if (n.type === "n8n-nodes-base.webhook") {
      calls.push(`🌐 PUBLIC ENTRY: /${n.parameters?.path || "?"} (${n.parameters?.httpMethod || "POST"})`);
    }
    if (n.type === "n8n-nodes-base.scheduleTrigger") {
      calls.push(`⏰ CRON ENTRY: ${n.parameters?.rule?.interval?.[0]?.field || "schedule"}`);
    }
  }
  // dedupe entries
  const uniq = [...new Set(calls)];
  console.log(`CSC ${me}:`);
  for (const c of uniq) console.log(`   ${c}`);
  console.log("");
}

// Also count data table nodes per workflow (shared memory)
console.log("=== DATA TABLE USAGE (kitne workflows DB use karte hain) ===");
let totalDt = 0, wfWithDt = 0;
for (const wf of wfs) {
  const nodes = JSON.parse(wf.nodes);
  const dtNodes = nodes.filter(n => n.type === "n8n-nodes-base.dataTable").length;
  totalDt += dtNodes;
  if (dtNodes > 0) wfWithDt++;
}
console.log(`${wfWithDt}/${wfs.length} workflows Data Tables use karte hain, total ${totalDt} data table nodes`);
db.close();
