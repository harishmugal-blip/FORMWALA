// Export the service catalog as a standalone JSON deliverable
import { writeFileSync } from "node:fs";

const src = await Bun.file("/home/z/my-project/scripts/build-csc-workflows.js").text();
const m = src.match(/const catalogCode = `([\s\S]*?)`;/);
if (!m) { console.error("catalog code not found"); process.exit(1); }

let code = m[1].replace(/return \[\{ json: \{ catalog \} \}\];/, "export default catalog;");
code = code.replace(/const gst = /, "const gst = ").replace(/const mk = /, "const mk = ");
const tmp = "/home/z/my-project/scripts/_catalog_tmp.mjs";
writeFileSync(tmp, code);

const catalog = (await import(tmp)).default;
writeFileSync("/home/z/my-project/download/csc-service-catalog.json", JSON.stringify({
  _info: "CSC Smart Seva - Service Catalog (Phase 1) | 14 services | Embedded in workflow 'CSC 03 - Service Catalog Engine' (single source of truth). Admin Panel (Phase 10) se ya is file ko edit karke naye services add honge.",
  generated: new Date().toISOString(),
  services
    : catalog
}, null, 1));
console.log("✅ Catalog exported with", Object.keys(catalog).length, "services:", Object.keys(catalog).join(", "));
