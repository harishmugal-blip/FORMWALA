import { NextResponse } from "next/server";
import { q, q1, run, num, phys } from "@/lib/csc-db";

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
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    const govFee = num(s.government_fee);
    const serviceCharge = num(s.service_charge);
    const gstPercent = num(s.gst_percent, 18);
    const calculatedGst = Math.round((serviceCharge * gstPercent) / 100);
    const totalFee = num(s.total_fee, govFee + serviceCharge + calculatedGst);

    out.push({
      service_id: sid,
      service_name: String(s.service_name ?? "").replace(/"/g, ""),
      category: s.category ? String(s.category).replace(/"/g, "") : "",
      description: s.description,
      gov_fee: govFee,
      service_charge: serviceCharge,
      gst_percent: gstPercent,
      gst: calculatedGst,
      total_fee: totalFee,
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

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { service_id, gov_fee, service_charge, gst_percent, total_fee, active } = body;

    if (!service_id) {
      return NextResponse.json({ error: "service_id missing hai" }, { status: 400 });
    }

    const sid = String(service_id).trim();
    const existing = q1<any>(`SELECT * FROM ${phys("service_catalog")} WHERE service_id = ?`, sid);
    if (!existing) {
      return NextResponse.json({ error: `Service '${sid}' nahi mila` }, { status: 404 });
    }

    const newGovFee = gov_fee !== undefined ? Math.max(0, Number(gov_fee)) : num(existing.government_fee);
    const newServiceCharge = service_charge !== undefined ? Math.max(0, Number(service_charge)) : num(existing.service_charge);
    const newGstPercent = gst_percent !== undefined ? Math.max(0, Number(gst_percent)) : num(existing.gst_percent, 18);

    const calculatedGst = Math.round((newServiceCharge * newGstPercent) / 100);
    const calculatedTotal = Math.round(newGovFee + newServiceCharge + calculatedGst);
    const newTotalFee = total_fee !== undefined ? Math.max(0, Number(total_fee)) : calculatedTotal;

    const newActive = active !== undefined ? (active ? "TRUE" : "FALSE") : String(existing.active || "TRUE");

    run(
      `UPDATE ${phys("service_catalog")} SET 
        government_fee = ?, 
        service_charge = ?, 
        gst_percent = ?, 
        total_fee = ?, 
        active = ?, 
        updatedAt = CURRENT_TIMESTAMP 
      WHERE service_id = ?`,
      newGovFee,
      newServiceCharge,
      newGstPercent,
      newTotalFee,
      newActive,
      sid
    );

    return NextResponse.json({
      ok: true,
      message: `${existing.service_name || sid} ki fees update ho gayi!`,
      service: {
        service_id: sid,
        gov_fee: newGovFee,
        service_charge: newServiceCharge,
        gst_percent: newGstPercent,
        gst: calculatedGst,
        total_fee: newTotalFee,
        active: newActive === "TRUE",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Fees update karne me error aaya" }, { status: 500 });
  }
}
