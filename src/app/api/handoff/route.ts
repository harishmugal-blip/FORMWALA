import { NextRequest, NextResponse } from "next/server";
import { q, run, unq, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rows = q(
    `SELECT id, phone, name, reason, status, taken_by, created_at, resolved_at FROM ${phys("handoff_queue")} ORDER BY created_at DESC LIMIT 50`
  );
  return NextResponse.json({ handoffs: rows });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = Number(body.id ?? 0);
    const action = String(body.action ?? ""); // "take" | "resolve"
    if (!id || !["take", "resolve"].includes(action)) {
      return NextResponse.json({ error: "id and action required" }, { status: 400 });
    }
    const now = new Date().toISOString().slice(0, 19).replace("T", " ") + ".000";
    if (action === "take") {
      run(
        `UPDATE ${phys("handoff_queue")} SET status = 'TAKEN', taken_by = ?, updated_at = ?, updatedAt = ? WHERE id = ?`,
        String(body.taken_by ?? "dashboard"), now, now, id
      );
      // pause the bot for this customer (CSC 22 reads handoff_active)
      const row = q(`SELECT phone FROM ${phys("handoff_queue")} WHERE id = ?`, id)[0] as { phone?: string } | undefined;
      if (row?.phone) {
        const ph = unq(row.phone);
        run(
          `UPDATE ${phys("conversation_state")} SET handoff_active = 1, updatedAt = ? WHERE REPLACE(phone, '"', '') = ?`,
          now, ph
        );
      }
    } else {
      run(
        `UPDATE ${phys("handoff_queue")} SET status = 'RESOLVED', resolved_at = ?, updated_at = ?, updatedAt = ? WHERE id = ?`,
        now, now, now, id
      );
      const row = q(`SELECT phone FROM ${phys("handoff_queue")} WHERE id = ?`, id)[0] as { phone?: string } | undefined;
      if (row?.phone) {
        const ph = unq(row.phone);
        run(
          `UPDATE ${phys("conversation_state")} SET handoff_active = 0, updatedAt = ? WHERE REPLACE(phone, '"', '') = ?`,
          now, ph
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
