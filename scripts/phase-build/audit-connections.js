// Audit all CSC workflows: find missing connections (nodes without outgoing links)
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite", { readonly: true });
const wfs = db.prepare("SELECT id, name, nodes, connections FROM workflow_entity WHERE name LIKE ? ORDER BY name").all("CSC%");

const KNOWN_TERMINALS = /^(BR |Respond|Return Challenge|Ask First|Ask Next|Re-ask|Build Doc Message|Payment Wait Note|Cancel Msg|Ask Doc Reminder|No Config Reply|Remind Next Doc|Next Doc Ask|Init Payment|One App Reply|List Apps Reply|Sent Output|Mock Output|Skip Quiet|Done Reply|Issue Confirm|Queue Reply|Paid Reply|Paid Not Found|Resume Reply|Help Reply|Takeover Reply|Fwd Reply|Resume Output|Final Reply|Not Found|Not Docs Reply|Build First|Finalize Output|Create Draft|Skip Event|Dup Skipped|OCR Skipped|Build Payment Note|Payment Message|Skip Event|Finalize Output|Confirm Output|Audit Output)/;

for (const wf of wfs) {
  const nodes = JSON.parse(wf.nodes).map(n => n.name);
  const conns = JSON.parse(wf.connections);
  const from = new Set(Object.keys(conns));
  const missing = nodes.filter(n => !from.has(n) && !KNOWN_TERMINALS.test(n));
  // unreachable nodes: never referenced as target
  const targets = new Set();
  for (const [, tv] of Object.entries(conns)) {
    for (const [, groups] of Object.entries(tv)) {
      for (const g of groups) for (const t of g) targets.add(t.node);
    }
  }
  // triggers are roots
  const unreachable = nodes.filter(n => !targets.has(n) && !/^(Trigger|WhatsApp Webhook|WhatsApp Verify|Payment Webhook|Admin API|Every 6 Hours|Daily Digest)/.test(n));
  const issues = [];
  if (missing.length) issues.push("NO-OUTGOING: " + missing.join(", "));
  if (unreachable.length) issues.push("UNREACHABLE: " + unreachable.join(", "));
  console.log((issues.length ? "⚠️  " : "✅ ") + wf.name.replace("CSC ", ""));
  for (const i of issues) console.log("   " + i);
}
db.close();
