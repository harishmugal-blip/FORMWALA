import { NextResponse } from "next/server";
import { getChatbotConfig } from "@/lib/fb-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public widget config — sirf safe branding fields (no secrets)
export async function GET() {
  const cfg = await getChatbotConfig();
  return NextResponse.json({
    enabled: cfg.enabled,
    businessName: cfg.businessName,
    assistantName: cfg.assistantName,
    tagline: cfg.tagline,
    welcomeMessage: cfg.welcomeMessage,
    quickActions: cfg.quickActions,
    businessHours: cfg.businessHours,
  });
}
