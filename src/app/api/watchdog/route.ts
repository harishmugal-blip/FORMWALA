import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CSC services watchdog — called by health monitors or manually.
// Checks whatsapp-bridge (:8080) and ai-agent (:8090).
const KEY = "csc-watchdog-2026";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const checkService = async (url: string) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      return res.ok ? "UP" : `HTTP_${res.status}`;
    } catch {
      return "DOWN";
    }
  };

  const [bridge, agent] = await Promise.all([
    checkService("http://127.0.0.1:8080/status"),
    checkService("http://127.0.0.1:8090/health"),
  ]);

  return NextResponse.json({
    ok: true,
    bridge,
    agent,
    timestamp: new Date().toISOString(),
  });
}
