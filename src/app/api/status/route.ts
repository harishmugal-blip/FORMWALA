import { NextRequest, NextResponse } from "next/server";
import { resolveApplicationStatus } from "@/lib/webchat-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/status?token=FB-261006-00021
// Real backend state — chatbot bhi isi resolver se status dikhata he (spec #16).
export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") || "").trim().toUpperCase();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // format validate — no guessing
  if (!/^(FB|CSC|APP)-[A-Z0-9-]{6,16}$/.test(token)) {
    return NextResponse.json(
      { found: false, error: "invalid token format" },
      { status: 200 }
    );
  }

  const info = await resolveApplicationStatus(token);
  if (!info) return NextResponse.json({ found: false }, { status: 200 });

  return NextResponse.json({
    found: true,
    token: info.token,
    service: info.service,
    status: info.status,
    emoji: info.emoji,
    label: info.label,
    note: info.note,
    timeline: info.timeline,
  });
}
