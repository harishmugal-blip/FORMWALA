import { db } from "@/lib/db";

// FormBot AI Service Assistant — admin-configurable settings (SystemConfig se).
// Tenant admin in values ko dashboard config se change kar sakta he.
// SECURITY-related keys yahan configurable NAHI he (spec #31).

export type ChatbotConfig = {
  enabled: boolean;
  businessName: string;
  assistantName: string;
  tagline: string;
  welcomeMessage: string;
  quickActions: string[];
  businessHours: string;
  fallbackMessage: string;
  tokenPrefix: string;
  paymentMode: "MOCK" | "LIVE";
  paymentUpiId: string;
};

export const TENANT_ID = "TENANT_CSC_001";

const DEFAULTS: ChatbotConfig = {
  enabled: true,
  businessName: "FormBot",
  assistantName: "FormBot Assistant",
  tagline: "AI Service Assistant",
  welcomeMessage:
    "Namaste 👋\nMain FormBot Assistant hoon.\n\nAapko kisi form, document ya online service ke liye help chahiye? Main aapko step-by-step guide kar sakta hoon.",
  quickActions: [
    "Apply for a Service",
    "Check Application Status",
    "Required Documents",
    "Payment Help",
    "Talk to Operator",
  ],
  businessHours: "Chat 24×7 • Operator 10AM-7PM",
  fallbackMessage:
    "Main is information ko verify nahi kar pa raha hoon. Main aapko operator se connect kar sakta hoon.",
  tokenPrefix: "FB",
  paymentMode: "MOCK",
  paymentUpiId: "cscseva@upi",
};

const KEYS: Record<keyof ChatbotConfig, string> = {
  enabled: "CHATBOT_ENABLED",
  businessName: "CHATBOT_BUSINESS_NAME",
  assistantName: "CHATBOT_ASSISTANT_NAME",
  tagline: "CHATBOT_TAGLINE",
  welcomeMessage: "CHATBOT_WELCOME",
  quickActions: "CHATBOT_QUICK_ACTIONS",
  businessHours: "CHATBOT_BUSINESS_HOURS",
  fallbackMessage: "CHATBOT_FALLBACK",
  tokenPrefix: "TOKEN_PREFIX",
  paymentMode: "PAYMENT_MODE",
  paymentUpiId: "PAYMENT_UPI_ID",
};

let cache: { at: number; value: ChatbotConfig } | null = null;
const TTL = 30_000; // 30s

export async function getChatbotConfig(force = false): Promise<ChatbotConfig> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.value;
  const cfg: ChatbotConfig = { ...DEFAULTS };
  try {
    const rows = await db.systemConfig.findMany({
      where: { configKey: { in: Object.values(KEYS) } },
    });
    for (const r of rows) {
      const v = r.configValue ?? "";
      if (!v) continue;
      switch (r.configKey) {
        case KEYS.enabled:
          cfg.enabled = !/^FALSE$/i.test(v);
          break;
        case KEYS.quickActions:
          try {
            const arr = JSON.parse(v);
            if (Array.isArray(arr) && arr.length) cfg.quickActions = arr.map(String);
          } catch {
            cfg.quickActions = v.split("|").map((s) => s.trim()).filter(Boolean);
          }
          break;
        case KEYS.paymentMode:
          cfg.paymentMode = v.toUpperCase() === "LIVE" ? "LIVE" : "MOCK";
          break;
        case KEYS.enabled.toString():
          break;
        default: {
          const entry = Object.entries(KEYS).find(([, k]) => k === r.configKey);
          if (entry) (cfg as Record<string, unknown>)[entry[0]] = v;
        }
      }
    }
  } catch {
    // DB down → defaults (chatbot never hard-fails on config)
  }
  cache = { at: Date.now(), value: cfg };
  return cfg;
}

export function invalidateConfigCache() {
  cache = null;
}

export async function setChatbotConfig(patch: Partial<Record<keyof ChatbotConfig, string>>) {
  for (const [k, v] of Object.entries(patch)) {
    const key = KEYS[k as keyof ChatbotConfig];
    if (!key || typeof v !== "string") continue;
    await db.systemConfig.upsert({
      where: { configKey: key },
      update: { configValue: v },
      create: { configKey: key, configValue: v, description: `FormBot chatbot setting: ${k}` },
    });
  }
  invalidateConfigCache();
}
