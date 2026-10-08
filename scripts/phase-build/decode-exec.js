// Decode n8n chunked execution data and show node outputs
import { Database } from "bun:sqlite";

const db = new Database("/home/z/.n8n/database.sqlite", { readonly: true });
const row = db.prepare("SELECT executionId, data FROM execution_data ORDER BY executionId DESC LIMIT 1").get();
console.log("execution:", row.executionId);
const arr = JSON.parse(row.data);

function resolve(v, depth = 0) {
  if (depth > 8) return "…";
  if (typeof v === "string" && /^\d+$/.test(v) && Number(v) < arr.length) {
    const next = arr[Number(v)];
    if (next === undefined) return v;
    if (typeof next === "object" && next !== null) return deepResolve(next, depth + 1);
    if (typeof next === "string") {
      if (/^\d+$/.test(next) && Number(next) < arr.length) return resolve(next, depth + 1);
      return next;
    }
    return next;
  }
  if (typeof v === "object" && v !== null) return deepResolve(v, depth);
  return v;
}
function deepResolve(obj, depth = 0) {
  if (Array.isArray(obj)) return obj.map(x => resolve(x, depth + 1));
  const out = {};
  for (const [k, val] of Object.entries(obj)) out[k] = resolve(val, depth + 1);
  return out;
}

const resultDataRaw = arr[Number(arr[0].resultData)];
const result = typeof resultDataRaw === "object" ? deepResolve(resultDataRaw) : (typeof resultDataRaw === "string" && /^\d+$/.test(resultDataRaw) ? deepResolve(arr[Number(resultDataRaw)]) : resultDataRaw);
const runData = result.runData || {};
console.log("nodes executed:", Object.keys(runData).join(" | "));
console.log("lastNodeExecuted:", resolve(JSON.parse(arr[0].lastNodeExecuted ?? arr[2]?.lastNodeExecuted ?? '"?"')));
if (result.error) console.log("ERROR:", JSON.stringify(result.error).slice(0, 400));
for (const [node, runs] of Object.entries(runData)) {
  const outs = runs?.[0]?.outputData || [];
  const items = Array.isArray(outs?.[0]) ? outs[0] : outs;
  console.log("\n### NODE:", node);
  console.log(JSON.stringify(items?.[0]?.json ?? items?.[0] ?? items).slice(0, 300));
}
db.close();
