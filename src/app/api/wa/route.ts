import { NextRequest, NextResponse } from "next/server";

// Bridge status proxy for the dashboard's WhatsApp view.
// Current bridge: Baileys on 127.0.0.1:8080 (see whatsapp-bridge/bridge.mjs)
const BRIDGE = process.env.WA_BRIDGE_URL || "http://127.0.0.1:8080";

export async function GET() {
  try {
    const r = await fetch(`${BRIDGE}/status`, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    const s = await r.json().catch(() => ({}));
    return NextResponse.json({
      bridge_online: true,
      connected: !!s.connected,
      user: s.user ?? "",
      hasQr: !!s.hasQr,
      qrAgeSec: s.qrAgeSec ?? null,
      forwarded: s.forwarded ?? 0,
      sent: s.sent ?? 0,
      lastError: s.lastError ?? null,
      uptimeSec: s.uptimeSec ?? 0,
    });
  } catch {
    return NextResponse.json({ bridge_online: false, connected: false });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === "pair") {
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    if (!/^\d{10,15}$/.test(phone)) {
      return NextResponse.json({ error: "10-15 digit number likhein" }, { status: 400 });
    }
    try {
      const r = await fetch(`${BRIDGE}/pair/${phone}`, { signal: AbortSignal.timeout(20000) });
      const j = await r.json().catch(() => ({}));
      if (j.pairingCode) return NextResponse.json({ code: j.pairingCode });
      return NextResponse.json({ error: j.error || "Pairing code nahi mila" }, { status: r.status });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
