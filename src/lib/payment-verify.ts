import { db } from "@/lib/db";
import { phys, run, variants } from "@/lib/csc-db";
import { trackEvent } from "@/lib/chat-analytics";

// Payment verification — SINGLE source of truth for PAID transitions (spec #14).
// Sirf verified gateway event (webhook) ya authorized operator action hi
// application ko PAID -> QUEUED kar sakta he. Customer ke "paid" bolne se kabhi nahi.

export type VerifyInput = {
  applicationNumber: string;
  source: "WEBHOOK" | "OPERATOR";
  transactionId?: string;
  gateway?: string;
  eventId?: string; // idempotency key (webhook event id / operator action id)
  amount?: number;
};

export type VerifyResult =
  | { ok: true; alreadyVerified: boolean; status: "PAID" | "QUEUED" }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_PAID" | "NO_PAYMENT_ROW" | "ERROR"; message: string };

const nowStr = () => new Date().toISOString().replace("T", " ").slice(0, 19);

export async function verifyPayment(input: VerifyInput): Promise<VerifyResult> {
  const app = await db.application.findFirst({
    where: { applicationNumber: input.applicationNumber },
  });
  if (!app) return { ok: false, reason: "NOT_FOUND", message: "Application nahi mili" };

  // idempotency: same event dobara aaye to skip (webhook replay safe)
  if (input.eventId) {
    const dup = await db.paymentEvent.findFirst({ where: { eventId: input.eventId } });
    if (dup) return { ok: true, alreadyVerified: true, status: "QUEUED" };
  }

  if (["PAID", "QUEUED", "PROCESSING", "SUBMITTED", "RESULT_READY", "DELIVERED"].includes(app.status)) {
    return { ok: false, reason: "ALREADY_PAID", message: "Payment pehle hi verified he" };
  }

  const payment = await db.payment.findFirst({
    where: { applicationId: app.applicationId, status: { not: "PAID" } },
    orderBy: { id: "desc" },
  });
  if (!payment)
    return { ok: false, reason: "NO_PAYMENT_ROW", message: "Pending payment record nahi mila" };

  if (input.amount !== undefined && input.amount > 0 && Math.abs(payment.amount - input.amount) > 1)
    return { ok: false, reason: "ERROR", message: "Amount mismatch — manually check karein" };

  // ---- Prisma: payment PAID -> application PAID -> QUEUED ----
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      transactionId: input.transactionId ?? `VERIFY_${Date.now()}`,
      gateway: input.gateway ?? payment.gateway,
      meta: JSON.stringify({ verifiedBy: input.source, eventId: input.eventId ?? "" }),
    },
  });
  await db.application.update({
    where: { id: app.id },
    data: { status: "PAID" },
  });
  await db.applicationStatusHistory.create({
    data: {
      applicationId: app.applicationId,
      applicationNumber: app.applicationNumber,
      oldStatus: app.status,
      newStatus: "PAID",
      note: `Payment verified (${input.source})`,
    },
  });

  // operator task ab banta he (QUEUED = kaam operator ke paas)
  const taskId = `TASK${Date.now().toString().slice(-8)}`;
  await db.operatorTask.create({
    data: {
      taskId,
      applicationId: app.applicationId,
      applicationNumber: app.applicationNumber,
      operatorPhone: "",
      status: "PENDING",
      note: `Payment verified — seva process karein (token ${app.applicationNumber})`,
    },
  });
  await db.application.update({
    where: { id: app.id },
    data: { status: "QUEUED" },
  });
  await db.applicationStatusHistory.create({
    data: {
      applicationId: app.applicationId,
      applicationNumber: app.applicationNumber,
      oldStatus: "PAID",
      newStatus: "QUEUED",
      note: "Queue me gaya — operator process karega",
    },
  });

  if (input.eventId) {
    await db.paymentEvent.create({
      data: {
        eventId: input.eventId,
        applicationId: app.applicationId,
        gateway: input.gateway ?? "MOCK",
        eventType: "payment.captured",
        payload: JSON.stringify({ source: input.source, amount: payment.amount }),
        signatureValid: "TRUE",
      },
    });
  }

  // ---- n8n live tables mirror (best-effort; dashboard inhe padhta he) ----
  try {
    const at = nowStr();
    const pt = phys("payments");
    const pvs = variants(app.applicationId);
    run(
      `UPDATE ${pt} SET status = ?, paid_at = ?, transaction_id = ? WHERE application_id IN (${pvs.map(() => "?").join(",")}) AND status != ?`,
      JSON.stringify("PAID"), at, JSON.stringify(input.transactionId ?? "VERIFY"), ...pvs, JSON.stringify("PAID")
    );
    const at2 = phys("applications");
    const avs = variants(app.applicationId);
    run(
      `UPDATE ${at2} SET status = ?, updated_at = ? WHERE application_id IN (${avs.map(() => "?").join(",")})`,
      JSON.stringify("QUEUED"), at, ...avs
    );
    const ht = phys("application_status_history");
    run(
      `INSERT INTO ${ht} (application_id, application_number, old_status, new_status, note, created_at) VALUES (?,?,?,?,?,?)`,
      app.applicationId, app.applicationNumber,
      app.status, "QUEUED",
      `Payment verified (${input.source})`, at
    );
    const ot = phys("operator_tasks");
    run(
      `INSERT INTO ${ot} (task_id, application_id, application_number, operator_phone, status, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      taskId, app.applicationId, app.applicationNumber,
      "", "PENDING",
      `Payment verified — token ${app.applicationNumber}`, at, at
    );
  } catch (mirrorErr) {
    // n8n down -> Prisma source of truth, mirror later
    console.error("payment-verify n8n mirror failed:", String(mirrorErr).slice(0, 300));
  }

  await trackEvent({
    eventType: "PAYMENT_VERIFIED",
    applicationId: app.applicationId,
    detail: `${input.source} • token ${app.applicationNumber}`,
  });

  return { ok: true, alreadyVerified: false, status: "QUEUED" };
}
