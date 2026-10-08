// Unit test: matchService token-level fix — "mool niwas" must resolve to DOMICILE
import { matchService } from "../src/lib/intent";
import { getServices } from "../src/lib/csc-catalog";

const services = await getServices();
console.log("services loaded:", services.length);

const cases: Array<[string, string | null]> = [
  ["mujhe mool niwas banana hai", "DOMICILE"],
  ["mool niwas bnwana h", "DOMICILE"],
  ["mujhe PAN card banana hai", "PAN_CARD"],
  ["ayushman card banwana he", "AYUSHMAN"],
  ["ration card chahiye", "RATION_CARD"],
  ["gst number ke liye apply karna he", "GST_REG"],
];

let pass = 0, fail = 0;
for (const [text, expected] of cases) {
  const m = matchService(text, services);
  const got = m ? m.svc.service_id : null;
  const ok = got === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} "${text}" → ${got} (expected ${expected}) score=${m?.score.toFixed(2)}`);
}
console.log(`\nPASS: ${pass} FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
