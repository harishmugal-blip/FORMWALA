import { NextRequest, NextResponse } from "next/server";
import { q, q1, unq, inVariants, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");

  if (phone) {
    // transcript for one conversation (match plain + JSON-quoted variants)
    const vv = variantsOf(phone);
    const state = q1(
      `SELECT phone, state, service_id, handoff_active, context_data, updatedAt FROM ${phys("conversation_state")} WHERE phone IN (${vv.map(() => "?").join(",")}) ORDER BY updatedAt DESC LIMIT 1`,
      ...vv
    );
    const msgs = q(
      `SELECT direction, body, message_type, status, createdAt FROM ${phys("message_log")} WHERE phone IN (${vv.map(() => "?").join(",")}) ORDER BY createdAt ASC LIMIT 300`,
      ...vv
    );
    const apps = q(
      `SELECT application_number, service_id, status, total_fee, createdAt FROM ${phys("applications")} WHERE customer_phone IN (${vv.map(() => "?").join(",")}) ORDER BY createdAt DESC`,
      ...vv
    );
    return NextResponse.json({ state: state ?? null, messages: msgs, applications: apps });
  }

  // conversation list: merge states + last message per normalized phone
  const states = q(
    `SELECT phone, state, service_id, handoff_active, updatedAt FROM ${phys("conversation_state")} ORDER BY updatedAt DESC LIMIT 100`
  );
  const lastByPhone = new Map<string, { body: string; direction: string; createdAt: string }>();
  const recent = q(
    `SELECT phone, body, direction, createdAt FROM ${phys("message_log")} ORDER BY createdAt DESC LIMIT 500`
  );
  for (const m of recent) {
    const k = unq(m.phone);
    if (!k || k === "unknown") continue;
    if (!lastByPhone.has(k))
      lastByPhone.set(k, { body: String(m.body ?? ""), direction: String(m.direction), createdAt: String(m.createdAt) });
  }
  const list: Record<string, unknown>[] = [];
  const seen = new Map<string, number>();
  for (const s of states) {
    const k = unq(s.phone);
    if (!k || k === "unknown") continue;
    const idx = seen.get(k);
    if (idx !== undefined) {
      // duplicate (quoted + plain rows): keep the one with fresher state info
      const prev = list[idx];
      const fresher = String(s.updatedAt ?? "") > String(prev.updatedAt ?? "");
      if (fresher) {
        list[idx] = {
          phone: k,
          state: s.state,
          service_id: s.service_id,
          handoff_active: s.handoff_active,
          updatedAt: s.updatedAt,
          last: lastByPhone.get(k) ?? prev.last,
        };
      }
      continue;
    }
    seen.set(k, list.length);
    list.push({
      phone: k,
      state: s.state,
      service_id: s.service_id,
      handoff_active: s.handoff_active,
      updatedAt: s.updatedAt,
      last: lastByPhone.get(k) ?? null,
    });
  }
  for (const [k, v] of lastByPhone) {
    if (!seen.has(k)) list.push({ phone: k, state: "", service_id: "", handoff_active: 0, updatedAt: v.createdAt, last: v });
  }
  list.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  return NextResponse.json({ conversations: list.slice(0, 80) });
}

// local helper: plain + JSON-quoted variants of a phone
function variantsOf(v: string): string[] {
  const plain = v.replace(/"/g, "").trim();
  return Array.from(new Set([v, plain, JSON.stringify(plain)]));
}

// keep inVariants referenced for future use
void inVariants;
