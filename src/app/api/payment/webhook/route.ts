import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { verifyPayment } from "@/lib/payment-verify";
import { getChatbotConfig } from "@/lib/fb-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/payment/webhook
// LIVE mode: Razorpay webhook (X-Razorpay-Signature HMAC-SHA256 verify, spec #14)
// MOCK mode: sirf local/test calls with mockKey — E2E tests ke liye
// Duplicate events idempotent (PaymentEvent eventId unique check).

function razorpayVerify(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ""));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const cfg = await getChatbotConfig();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // ---------- LIVE (Razorpay) ----------
  if (cfg.paymentMode === "LIVE") {
    const secret = process.env.RAZORPAY_KEY_SECRET || "";
    if (!secret) {
      return NextResponse.json({ ok: false, error: "gateway not configured" }, { status: 500 });
    }
    const sig = req.headers.get("x-razorpay-signature") || "";
    if (!razorpayVerify(raw, sig, secret)) {
      console.error("payment webhook: invalid signature");
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }
    const event = String(body.event || "");
    if (event !== "payment.captured") {
      return NextResponse.json({ ok: true, ignored: event });
    }
    const payload = body.payload as
      | { payment?: { entity?: { id?: string; order_id?: string; amount?: number; notes?: Record<string, string> } } }
      | undefined;
    const ent = payload?.payment?.entity;
    const appNumber = String(ent?.notes?.applicationNumber || ent?.notes?.token || "");
    if (!appNumber) {
      return NextResponse.json({ ok: false, error: "no application reference" }, { status: 400 });
    }
    const result = await verifyPayment({
      applicationNumber: appNumber,
      source: "WEBHOOK",
      transactionId: ent?.id || "",
      gateway: "RAZORPAY",
      eventId: `rzp_${ent?.id || Date.now()}`,
      amount: ent?.amount ? ent.amount / 100 : undefined, // paise -> rupees
    });
    return NextResponse.json({ ok: result.ok, ...("reason" in result ? { reason: result.reason } : {}) });
  }

  // ---------- MOCK (test/E2E; local only) ----------
  const mockKey = process.env.PAYMENT_MOCK_KEY || "formbot-mock-key";
  const providedKey = req.headers.get("x-mock-key") || "";
  if (providedKey !== mockKey) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const eventType = String(body.event || "payment.captured");
  if (eventType !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: eventType });
  }
  const appNumber = String(body.applicationNumber || "");
  const eventId = String(body.eventId || `mock_${Date.now()}`);
  if (!appNumber) {
    return NextResponse.json({ ok: false, error: "applicationNumber required" }, { status: 400 });
  }
  const result = await verifyPayment({
    applicationNumber: appNumber,
    source: "WEBHOOK",
    transactionId: String(body.transactionId || `MOCK_${Date.now()}`),
    gateway: "MOCK",
    eventId,
    amount: body.amount ? Number(body.amount) : undefined,
  });
  return NextResponse.json({
    ok: result.ok,
    ...("reason" in result ? { reason: result.reason } : {}),
    alreadyVerified: result.ok ? result.alreadyVerified : undefined,
  });
}
