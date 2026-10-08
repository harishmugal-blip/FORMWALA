import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";

// Serves the bridge's live QR PNG (whatsapp-bridge rewrites it every ~30s
// while waiting for a scan). Cache-busted by ?t= from the client.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const buf = await readFile("/home/z/my-project/download/whatsapp-qr.png");
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ error: "QR not available" }, { status: 404 });
  }
}
