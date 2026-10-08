// Patch: add alwaysOutputData to all dataTable get nodes + fix consumers' empty handling
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";

const dir = "/home/z/my-project/scripts/phase-build/json/";
const CODE_FILTERS = {
  "Build Service List": [
    ["const rows = $input.all().map(i => i.json);", "const rows = $input.all().map(i => i.json).filter(r => r && r.service_id);"]
  ],
  "Match Next Doc": [
    ["try { saved = $('Get Saved Docs').all().map(i => i.json); } catch (e) {}", "try { saved = $('Get Saved Docs').all().map(i => i.json).filter(d => d && d.doc_key); } catch (e) {}"]
  ],
  "Validate Docs": [
    ["try { saved = $input.all().map(i => i.json); } catch (e) {}", "try { saved = $input.all().map(i => i.json).filter(d => d && d.doc_key); } catch (e) {}"]
  ],
  "Build Operator Msg": [
    ["try { fields = $('Get Field Values').all().map(i => i.json); } catch (e) {}", "try { fields = $('Get Field Values').all().map(i => i.json).filter(f => f && f.field_key); } catch (e) {}"],
    ["try { docs = $('Get Docs Count').all().map(i => i.json); } catch (e) {}", "try { docs = $('Get Docs Count').all().map(i => i.json).filter(d => d && d.doc_key); } catch (e) {}"]
  ],
  "Queue Reply": [
    ["try { tasks = $input.all().map(i => i.json); } catch (e) {}", "try { tasks = $input.all().map(i => i.json).filter(t => t && t.task_id); } catch (e) {}"]
  ],
  "List Apps Reply": [
    ["try { apps = $input.all().map(i => i.json); } catch (e) {}", "try { apps = $input.all().map(i => i.json).filter(a => a && a.application_id); } catch (e) {}"]
  ],
  "Config Map": [
    ["const rows = $input.all().map(i => i.json);", "const rows = $input.all().map(i => i.json).filter(r => r && r.config_key);"]
  ]
};

let dtPatched = 0, codePatched = 0;
for (const f of readdirSync(dir)) {
  const p = dir + f;
  const wf = JSON.parse(readFileSync(p, "utf8"));
  let changed = false;
  for (const n of wf.nodes) {
    if (n.type === "n8n-nodes-base.dataTable" && n.parameters.operation === "get") {
      if (!n.alwaysOutputData) { n.alwaysOutputData = true; dtPatched++; changed = true; }
    }
    if (n.type === "n8n-nodes-base.code" && CODE_FILTERS[n.name]) {
      for (const [from, to] of CODE_FILTERS[n.name]) {
        if (n.parameters.jsCode.includes(from)) { n.parameters.jsCode = n.parameters.jsCode.split(from).join(to); codePatched++; changed = true; }
      }
    }
  }
  if (changed) writeFileSync(p, JSON.stringify(wf, null, 1));
}
console.log("dtGet patched:", dtPatched, "| code filters patched:", codePatched);
