import { NextRequest, NextResponse } from "next/server";
import { q, run, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rows = q(
    `SELECT t.id, t.task_id, t.application_id, t.application_number, t.status, t.note, t.operator_phone, t.createdAt, t.updatedAt,
            a.service_id, a.customer_phone, a.total_fee
     FROM ${phys("operator_tasks")} t
     LEFT JOIN ${phys("applications")} a
       ON REPLACE(a.application_id, '"', '') = REPLACE(t.application_id, '"', '')
     ORDER BY CASE UPPER(t.status) WHEN 'PENDING' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, t.createdAt DESC`
  );
  // normalize quoted values for display
  const out = rows.map((r) => ({
    ...r,
    task_id: String(r.task_id ?? "").replace(/"/g, ""),
    application_id: String(r.application_id ?? "").replace(/"/g, ""),
    application_number: String(r.application_number ?? "").replace(/"/g, ""),
    service_id: r.service_id ? String(r.service_id).replace(/"/g, "") : null,
    customer_phone: r.customer_phone ? String(r.customer_phone).replace(/"/g, "") : null,
  }));
  return NextResponse.json({ tasks: out });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const taskId = String(body.task_id ?? "");
    const status = String(body.status ?? "").toUpperCase();
    if (!taskId || !["PENDING", "IN_PROGRESS", "DONE"].includes(status)) {
      return NextResponse.json({ error: "task_id and valid status required" }, { status: 400 });
    }
    const now = new Date().toISOString().slice(0, 19).replace("T", " ") + ".000";
    run(
      `UPDATE ${phys("operator_tasks")} SET status = ?, updatedAt = ? WHERE task_id = ?`,
      status, now, taskId
    );
    return NextResponse.json({ ok: true, task_id: taskId, status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
