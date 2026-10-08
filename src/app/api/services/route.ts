import { NextResponse } from "next/server";
import { q, num, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const services = q(`SELECT * FROM ${phys("service_catalog")} ORDER BY service_name`);
  const fieldCounts = q(
    `SELECT service_id, COUNT(*) c FROM ${phys("service_fields")} GROUP BY service_id`
  );
  const docCounts = q(
    `SELECT service_id, COUNT(*) c FROM ${phys("service_documents")} GROUP BY service_id`
  );
  const fc: Record<string, number> = {};
  for (const f of fieldCounts) fc[String(f.service_id)] = Number(f.c);
  const dc: Record<string, number> = {};
  for (const d of docCounts) dc[String(d.service_id)] = Number(d.c);

  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const s of services) {
    const sid = String(s.service_id ?? "").replace(/"/g, "");
    if (!sid || seen.has(sid)) continue; // catalog was imported 2x — dedupe
    seen.add(sid);
    out.push({
      service_id: sid,
      service_name: String(s.service_name ?? "").replace(/"/g, ""),
      category: s.category ? String(s.category).replace(/"/g, "") : "",
      description: s.description,
      gov_fee: num(s.government_fee),
      service_charge: num(s.service_charge),
      gst: num(s.gst),
      total_fee: num(s.total_fee),
      portal_url: s.portal_url,
      portal_type: s.portal_type,
      operator_required: String(s.operator_required).toUpperCase().includes("TRUE"),
      otp_required: String(s.otp_required).toUpperCase().includes("TRUE"),
      status_tracking: String(s.status_tracking).toUpperCase().includes("TRUE"),
      active: String(s.active).toUpperCase().includes("TRUE"),
      processing_steps: s.processing_steps,
      fields: fc[sid] ?? 0,
      docs: dc[sid] ?? 0,
    });
  }
  return NextResponse.json({ services: out });
}
