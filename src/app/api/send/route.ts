import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Send a WhatsApp message from the dashboard via the CSC bridge
// (Evolution-compatible endpoint) and log it into message_log.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = String(body.phone ?? "").trim();
    const text = String(body.text ?? "").trim();
    if (!phone || !text) {
      return NextResponse.json({ error: "phone and text required" }, { status: 400 });
    }

    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    const r = await fetch("http://127.0.0.1:8080/message/sendText", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "csc-bridge-2026" },
      body: JSON.stringify({ number: phone, text }),
      signal: c.signal,
    });
    clearTimeout(t);

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json(
        { error: data?.error?.message || data?.error || `bridge ${r.status}` },
        { status: 502 }
      );
    }

    const waId = String(data?.key?.id ?? "");
    // NOTE: bridge already logs every outbound message into n8n message_log
    // (direction OUT) — no insert here to avoid duplicates.
    return NextResponse.json({ ok: true, wa_message_id: waId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
