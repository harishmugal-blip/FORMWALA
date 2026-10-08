import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CSC services watchdog — called by n8n "CSC 00 - Services Watchdog"
// workflow every minute (and safe to call manually). Restarts the
// whatsapp-bridge / ai-agent if their health checks fail.
const KEY = "csc-watchdog-2026";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await new Promise<{ out: string; err: string }>((resolve) => {
    exec("bash /home/z/my-project/scripts/services-check.sh", { timeout: 20000 }, (err, stdout) => {
      resolve({ out: String(stdout || ""), err: String(err?.message || "") });
    });
  });
  return NextResponse.json({
    ok: true,
    output: result.out.trim(),
    error: result.err || undefined,
  });
}
