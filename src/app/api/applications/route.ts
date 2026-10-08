import { NextRequest, NextResponse } from "next/server";
import { q, q1, parseRows, parseRow, unq, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    // full detail for one application (match plain + JSON-quoted variants)
    const plain = unq(id);
    const vv = Array.from(new Set([id, plain, JSON.stringify(plain)]));
    const app = q1(
      `SELECT * FROM ${phys("applications")} WHERE application_id IN (${vv.map(() => "?").join(",")}) OR application_number IN (${vv.map(() => "?").join(",")}) LIMIT 1`,
      ...vv, ...vv
    );
    if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

    const appId = unq(app.application_id);
    const av = Array.from(new Set([appId, JSON.stringify(appId)]));
    const fields = parseRows(
      q(`SELECT field_key, field_value, validated FROM ${phys("application_field_values")} WHERE application_id IN (${av.map(() => "?").join(",")}) ORDER BY createdAt`, ...av)
    );
    const docs = parseRows(
      q(`SELECT doc_key, media_id, mime_type, status, ocr_text, createdAt FROM ${phys("application_documents")} WHERE application_id IN (${av.map(() => "?").join(",")}) ORDER BY createdAt`, ...av)
    );
    const history = parseRows(
      q(`SELECT old_status, new_status, note, created_at FROM ${phys("application_status_history")} WHERE application_id IN (${av.map(() => "?").join(",")}) ORDER BY created_at`, ...av)
    );
    const pays = parseRows(
      q(`SELECT payment_id, amount, status, gateway, transaction_id, paid_at FROM ${phys("payments")} WHERE application_id IN (${av.map(() => "?").join(",")}) ORDER BY createdAt`, ...av)
    );
    const tasks = parseRows(
      q(`SELECT task_id, status, note, createdAt FROM ${phys("operator_tasks")} WHERE application_id IN (${av.map(() => "?").join(",")}) ORDER BY createdAt`, ...av)
    );
    return NextResponse.json({ app: parseRow(app), fields, docs, history, payments: pays, tasks });
  }

  const rows = parseRows(
    q(
      `SELECT a.application_id, a.application_number, a.service_id, a.customer_phone, a.status, a.total_fee, a.gov_fee, a.service_charge, a.gst, a.createdAt, a.updatedAt,
              (SELECT SUM(CAST(p.amount AS REAL)) FROM ${phys("payments")} p
                WHERE REPLACE(p.application_id, '"', '') = REPLACE(a.application_id, '"', '')
                  AND UPPER(p.status) IN ('PAID','SUCCESS','CAPTURED')) AS paid_amount
       FROM ${phys("applications")} a ORDER BY a.createdAt DESC LIMIT 200`
    )
  );
  // normalize quoted values for display + dedupe by application_id
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const key = unq(r.application_id) || unq(r.application_number);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...r,
      application_id: unq(r.application_id),
      application_number: unq(r.application_number),
      customer_phone: unq(r.customer_phone),
      service_id: unq(r.service_id),
      // prefer catalog total_fee, fall back to actual paid amount
      total_fee: r.total_fee ?? r.paid_amount ?? 0,
    });
  }
  return NextResponse.json({ applications: out });
}
