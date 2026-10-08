import { NextResponse } from "next/server";
import { q, q1, num, unq, phys } from "@/lib/csc-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function istDayStart(): string {
  const now = new Date(Date.now() + 5.5 * 3600_000);
  const d = now.toISOString().slice(0, 10);
  return new Date(`${d}T00:00:00+05:30`).toISOString();
}
function iso7DaysAgo(): string {
  return new Date(Date.now() - 7 * 86400_000).toISOString();
}

async function ping(url: string, ms = 2500): Promise<"up" | "down"> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    const r = await fetch(url, { signal: c.signal, cache: "no-store" });
    clearTimeout(t);
    return r.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

export async function GET() {
  const dayStart = istDayStart();

  const apps = q(
    `SELECT application_id, application_number, service_id, customer_phone, status, total_fee, createdAt, updatedAt FROM ${phys("applications")} ORDER BY createdAt DESC`
  );
  const tasks = q(
    `SELECT task_id, application_number, status, createdAt FROM ${phys("operator_tasks")} ORDER BY createdAt DESC`
  );
  const msgs = q(
    `SELECT phone, direction, body, createdAt FROM ${phys("message_log")} WHERE createdAt >= ? ORDER BY createdAt DESC`,
    iso7DaysAgo()
  );
  const convs = q(
    `SELECT phone, state, service_id, handoff_active, updatedAt FROM ${phys("conversation_state")}`
  );
  const pays = q(`SELECT amount, status, paid_at, createdAt FROM ${phys("payments")}`);
  const handoff = q(
    `SELECT phone, name, reason, status, createdAt FROM ${phys("handoff_queue")} ORDER BY createdAt DESC`
  );
  const research = q(
    `SELECT research_id, user_message, status, createdAt FROM ${phys("service_research")}`
  );

  const today = (iso: unknown) => String(iso ?? "") >= dayStart;
  const PAID = ["PAID", "SUCCESS", "CAPTURED"];
  const pendingTasks = tasks.filter((t) => String(t.status).toUpperCase() !== "DONE");
  const paidAmount = pays
    .filter((p) => PAID.includes(String(p.status).toUpperCase()))
    .reduce((s, p) => s + num(p.amount), 0);
  const paidToday = pays
    .filter((p) => PAID.includes(String(p.status).toUpperCase()) && today(p.paid_at ?? p.createdAt))
    .reduce((s, p) => s + num(p.amount), 0);

  // 7-day message chart (IST days)
  const days: { day: string; label: string; in: number; out: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dObj = new Date(Date.now() + 5.5 * 3600_000 - i * 86400_000);
    const d = dObj.toISOString().slice(0, 10);
    days.push({
      day: d,
      label: dObj.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }),
      in: 0,
      out: 0,
    });
  }
  for (const m of msgs) {
    const raw = String(m.createdAt ?? "");
    const d = new Date(raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z");
    if (isNaN(d.getTime())) continue;
    const istD = new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const bucket = days.find((x) => x.day === istD);
    if (bucket) {
      if (String(m.direction).toUpperCase() === "IN") bucket.in++;
      else bucket.out++;
    }
  }

  // service-wise applications
  const svcMap: Record<string, number> = {};
  for (const a of apps) {
    const k = String(a.service_id || "UNKNOWN");
    svcMap[k] = (svcMap[k] || 0) + 1;
  }
  const svcNames: Record<string, string> = {};
  try {
    const cat = q(`SELECT service_id, service_name FROM ${phys("service_catalog")}`);
    for (const c of cat) svcNames[String(c.service_id)] = String(c.service_name);
  } catch {}

  const feed = [
    ...apps.slice(0, 6).map((a) => ({
      at: String(a.createdAt ?? ""),
      kind: "application",
      text: `${svcNames[String(a.service_id)] || a.service_id} — ${String(a.application_number ?? "")}`,
      sub: `${unq(a.customer_phone)} • ${String(a.status ?? "")}`,
    })),
    ...pays.slice(0, 4).map((p) => ({
      at: String(p.createdAt ?? ""),
      kind: "payment",
      text: `Payment ₹${num(p.amount)} — ${String(p.status ?? "")}`,
      sub: String(p.paid_at ?? ""),
    })),
    ...tasks.slice(0, 4).map((t) => ({
      at: String(t.createdAt ?? ""),
      kind: "task",
      text: `Operator task — ${String(t.application_number ?? "")}`,
      sub: String(t.status ?? ""),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  const [bridge, n8n, agent] = await Promise.all([
    ping("http://127.0.0.1:8080/status"),
    ping("http://127.0.0.1:5678/healthz"),
    ping("http://127.0.0.1:8090/health"),
  ]);

  return NextResponse.json({
    kpis: {
      totalApps: apps.length,
      appsToday: apps.filter((a) => today(a.createdAt)).length,
      pendingTasks: pendingTasks.length,
      doneTasks: tasks.length - pendingTasks.length,
      revenueTotal: paidAmount,
      revenueToday: paidToday,
      activeConvs: convs.filter((c) =>
        !["", "CLOSED", "CLOSE", "IDLE"].includes(String(c.state).toUpperCase())
      ).length,
      msgsToday: msgs.filter((m) => today(m.createdAt)).length,
      handoffPending: handoff.filter((h) => ["PENDING", "WAITING", "NEW"].includes(String(h.status).toUpperCase())).length,
      researchNew: research.filter((r) => String(r.status).toUpperCase() === "NEW").length,
    },
    chart7d: days,
    serviceBreakdown: Object.entries(svcMap)
      .map(([id, count]) => ({ id, name: svcNames[id] || id, count }))
      .sort((a, b) => b.count - a.count),
    feed,
    health: { bridge, n8n, agent },
    waCfg: (() => {
      try {
        return q1(`SELECT config_value FROM ${phys("system_config")} WHERE config_key='WHATSAPP_API_BASE'`) ?? null;
      } catch {
        return null;
      }
    })(),
  });
}
