import { db } from "@/lib/db";
import { TENANT_ID } from "@/lib/fb-config";

// FormBot analytics + audit events (spec #33).
// Safe metrics only — sensitive conversation content store NAHI hota.

export type ChatEventType =
  | "CONVERSATION_STARTED"
  | "CUSTOMER_ID_CREATED"
  | "SERVICE_REQUESTED"
  | "SERVICE_SELECTED"
  | "FIELD_ANSWERED"
  | "FIELD_INVALID"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_SKIPPED"
  | "SUMMARY_SHOWN"
  | "APPLICATION_CONFIRMED"
  | "APPLICATION_CREATED"
  | "PAYMENT_INITIATED"
  | "PAYMENT_CLAIMED"
  | "PAYMENT_VERIFIED"
  | "STATUS_QUERIED"
  | "TOKEN_LOOKUP_INVALID"
  | "HANDOFF_CREATED"
  | "APPLICATION_CANCELLED"
  | "AI_ERROR";

// In events Prisma AuditLog me bhi jaate he (compliance trail)
const AUDIT_TYPES = new Set([
  "DOCUMENT_UPLOADED",
  "APPLICATION_CREATED",
  "PAYMENT_VERIFIED",
  "HANDOFF_CREATED",
  "APPLICATION_CANCELLED",
]);

export async function trackEvent(e: {
  sessionId?: string;
  customerId?: string;
  phone?: string;
  eventType: ChatEventType;
  serviceId?: string;
  applicationId?: string;
  detail?: string;
  tenantId?: string;
}) {
  const row = {
    sessionId: e.sessionId ?? "",
    tenantId: e.tenantId ?? TENANT_ID,
    customerId: e.customerId ?? "",
    phone: e.phone ?? "",
    eventType: e.eventType,
    serviceId: e.serviceId ?? "",
    applicationId: e.applicationId ?? "",
    detail: (e.detail ?? "").slice(0, 300),
  };
  try {
    await db.chatEvent.create({ data: row });
  } catch {
    // analytics must never break chat
  }
  if (AUDIT_TYPES.has(e.eventType)) {
    try {
      await db.auditLog.create({
        data: {
          eventId: `EVT-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          eventType: `CHAT_${e.eventType}`,
          actor: "WEB_CHATBOT",
          phone: row.phone,
          applicationId: row.applicationId,
          payload: JSON.stringify({
            sessionId: row.sessionId,
            serviceId: row.serviceId,
            detail: row.detail,
          }),
        },
      });
    } catch {
      // non-fatal
    }
  }
}
