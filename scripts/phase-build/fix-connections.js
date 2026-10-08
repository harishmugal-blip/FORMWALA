// Fix specific connection issues in workflow JSONs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const dir = "/home/z/my-project/scripts/phase-build/json/";

function load(f) { return JSON.parse(readFileSync(dir + f, "utf8")); }
function save(f, wf) { writeFileSync(dir + f, JSON.stringify(wf, null, 1)); console.log("fixed:", f); }
const c = (node, type = "main", index = 0) => ({ node, type, index });
function link(obj, from, to, type = "main") {
  if (!obj[from]) obj[from] = {};
  if (!obj[from][type]) obj[from][type] = [[]];
  obj[from][type][0] = [c(to, type)];
  return obj;
}

// ---- CSC 02: full connections rebuild ----
{
  const wf = load("csc-02.json");
  const old = wf.connections || {};
  // keep Trigger/Get Service Catalog links, rebuild the rest
  const conns = {
    "Trigger": old["Trigger"] || { main: [[c("Get Service Catalog")]] },
    "Get Service Catalog": { main: [[c("Build Prompt")]] },
    "Build Prompt": { main: [[c("AI Intent Detection")]] },
    "AI Intent Detection": { main: [[c("Validate & Reply")]] },
    "OpenRouter Model": { ai_languageModel: [[c("AI Intent Detection", "ai_languageModel")]] }
  };
  wf.connections = conns;
  save("csc-02.json", wf);
}

// ---- CSC 04: wire Customer Exists? branches ----
{
  const wf = load("csc-04.json");
  const conns = wf.connections || {};
  // IF node: condition was isEmpty(phone) => true means NOT exists
  conns["Customer Exists?"] = { main: [
    [c("Create Customer")],
    [c("Profile Result")]
  ] };
  conns["Create Customer"] = { main: [[c("Profile Result")]] };
  wf.connections = conns;
  save("csc-04.json", wf);
}

// ---- CSC 05: List branch must go through Get All Services ----
{
  const wf = load("csc-05.json");
  const conns = wf.connections || {};
  conns["List or Config?"] = { main: [
    [c("Get All Services")],
    [c("Get Service Row")]
  ] };
  conns["Get All Services"] = { main: [[c("Build Service List")]] };
  wf.connections = conns;
  save("csc-05.json", wf);
}

// ---- CSC 06: Clear State -> Cancel Msg ----
{
  const wf = load("csc-06.json");
  const conns = wf.connections || {};
  conns["Clear State"] = { main: [[c("Cancel Msg")]] };
  wf.connections = conns;
  save("csc-06.json", wf);
}

// ---- CSC 23: schedule trigger -> All Apps ----
{
  const wf = load("csc-23.json");
  const conns = wf.connections || {};
  conns["Daily Digest 8PM"] = { main: [[c("All Apps")]] };
  wf.connections = conns;
  save("csc-23.json", wf);
}

// ---- CSC 25: reorder so reply is terminal ----
{
  const wf = load("csc-25.json");
  wf.nodes.push({
    parameters: { mode: "runOnceForAllItems", jsCode: "const p = $('Parse Research').first().json;\nreturn [{ json: { reply: p.reply, phone: p.phone } }];" },
    name: "Final Reply", type: "n8n-nodes-base.code", typeVersion: 2, position: [0, 0]
  });
  const conns = wf.connections || {};
  conns["Save Research"] = { main: [[c("Audit Research")]] };
  conns["Audit Research"] = { main: [[c("Final Reply")]] };
  wf.connections = conns;
  save("csc-25.json", wf);
}

console.log("ALL CONNECTION FIXES APPLIED");
