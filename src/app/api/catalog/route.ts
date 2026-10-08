import { NextResponse } from "next/server";
import { getServices } from "@/lib/csc-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public services catalog for the landing page (Prisma — wipe-proof).
export async function GET() {
  try {
    const services = await getServices();
    return NextResponse.json({ services });
  } catch {
    return NextResponse.json({ services: [] });
  }
}
