import { NextResponse } from "next/server";
import { q, parseRows, unq, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Unknown-service research requests — what customers asked for that
// is not (yet) in the catalog. Great signal for the operator.
export async function GET() {
  const rows = parseRows(
    q(
      `SELECT research_id, phone, user_message, proposed_service, ai_analysis, status, created_at FROM ${phys("service_research")} ORDER BY created_at DESC LIMIT 60`
    )
  );
  const out = rows.map((r) => {
    // ai_analysis can be a JSON object — flatten to a readable string
    let analysis = "";
    const a = r.ai_analysis;
    if (a && typeof a === "object") {
      const obj = a as Record<string, unknown>;
      analysis =
        String(obj.analysis ?? obj.summary ?? obj.recommendation ?? "") ||
        Object.entries(obj)
          .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" • ");
    } else if (a) {
      analysis = String(a);
    }
    return {
      ...r,
      phone: unq(r.phone),
      user_message: unq(r.user_message),
      proposed_service: unq(r.proposed_service),
      ai_analysis: analysis,
    };
  });
  return NextResponse.json({ research: out });
}
