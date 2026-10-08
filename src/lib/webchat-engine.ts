import { db } from "@/lib/db";
import {
  getServices,
  getFields,
  getDocs,
  getConfigMap,
  type Svc,
  type FieldRow,
  type DocRow,
} from "@/lib/csc-catalog";
import {
  validateField,
  matchChoice,
  aiFieldGate,
  aiGeneralChat,
  isSkip,
  isCancel,
  isConfirm,
  isMenu,
  isPaid,
} from "@/lib/webchat-validators";
import { upsertCustomerN8n, insertApplicationN8n } from "@/lib/csc-write";
import { classifyIntent, extractToken, matchService, CSC_NUMBER_RE, type IntentResult } from "@/lib/intent";
import { getChatbotConfig, TENANT_ID, type ChatbotConfig } from "@/lib/fb-config";
import { trackEvent } from "@/lib/chat-analytics";
import { phys, q1, run, unq, variants } from "@/lib/csc-db";

// ============================================================
// FormBot AI Service Assistant — web chatbot engine
// Flow: ID_NAME → ID_PHONE (customer ID) → MENU → OFFER → FIELDS
//       → DOCS → SUMMARY (explicit confirm) → [application + token
//       FB-YYMMDD-NNNNN] → PAYMENT (verified webhook/operator only)
// Spec rules: one-question-at-a-time, no invented fees/status,
// payment status sirf verified events se, tenant-safe lookups.
// ============================================================

export type Attachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type CardData =
  | {
      type: "summary";
      service: string;
      applicant: string;
      fields: { label: string; value: string }[];
      docs: { label: string; done: boolean; required: boolean }[];
      fees: { gov: number; service: number; gst: number; total: number };
    }
  | {
      type: "status";
      token: string;
      service: string;
      status: string;
      emoji: string;
      label: string;
      note: string;
      timeline: { label: string; at: string }[];
    }
  | { type: "token"; token: string; service: string }
  | {
      type: "payment";
      total: number;
      gov: number;
      serviceFee: number;
      gst: number;
      upi: string;
      mode: string;
      instructions: string;
    }
  | { type: "handoff"; note: string }
  | { type: "docs_list"; service: string; docs: { label: string; required: boolean; done: boolean }[] }
  | { type: "human_action"; note: string };

export type BotReply = {
  text: string;
  chips?: string[];
  cards?: Svc[];
  expectFile?: boolean;
  card?: CardData;
};

export type WebState = {
  serviceId?: string;
  serviceName?: string;
  fields?: FieldRow[];
  fidx?: number;
  collected?: Record<string, string>;
  docs?: DocRow[];
  didx?: number;
  docsCollected?: Record<string, { name: string; type: string; size: number }>;
  fails?: number;
  editingFrom?: "SUMMARY";
  token?: string;
};

export type EngineSession = {
  sessionId: string;
  stage: string;
  customerId: string;
  name: string;
  phone: string;
  state: WebState;
};

export type EngineInput = {
  text?: string;
  attachment?: Attachment;
};

export type EngineResult = {
  replies: BotReply[];
  patch: Partial<Pick<EngineSession, "stage" | "customerId" | "name" | "phone" | "state">>;
};

const STAGE = {
  NAME: "ID_NAME",
  PHONE: "ID_PHONE",
  MENU: "MENU",
  OFFER: "OFFER",
  FIELDS: "FIELDS",
  DOCS: "DOCS",
  SUMMARY: "SUMMARY",
  EDIT: "EDIT",
  PAYMENT: "PAYMENT",
  DONE: "DONE",
} as const;

const APP_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const rand = (n: number, chars = APP_ID_CHARS) =>
  Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

const appId = () => "APPWEB" + rand(10);
const hashId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

const acks = [
  "Samajh gaya ✅",
  "Theek he, note kar liya 👍",
  "Ho gaya ✅",
  "Perfect! ✓",
  "Likh liya 📝",
];
const ack = () => acks[Math.floor(Math.random() * acks.length)];

// ---------- token: FB-YYMMDD-NNNNN (spec #15) ----------
function istYYMMDD(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000); // IST
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

async function nextToken(prefix: string): Promise<string> {
  const day = istYYMMDD();
  const stem = `${prefix}-${day}-`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const count = await db.application.count({
      where: { applicationNumber: { startsWith: stem } },
    });
    const candidate = `${stem}${String(count + 1 + attempt).padStart(5, "0")}`;
    const exists = await db.application.findFirst({
      where: { applicationNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `${stem}${rand(4)}`; // ultra-rare fallback
}

// ---------- masking (spec #12 example: XXXXXX1234) ----------
function maskValue(type: string, v: string): string {
  if (!v) return "—";
  if (v === "SKIP") return "(skip)";
  const T = type.toUpperCase();
  if (T === "MOBILE") return v.length > 4 ? `${"X".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : v;
  if (T === "AADHAAR" || T === "ACCOUNT") return `••••${v.slice(-4)}`;
  return v;
}

function feeParts(svc: Svc) {
  const gst = Math.round((svc.total_fee - svc.government_fee - svc.service_charge) * 100) / 100;
  return { gov: svc.government_fee, service: svc.service_charge, gst, total: svc.total_fee };
}

function feeLines(svc: Svc): string {
  const f = feeParts(svc);
  return [
    `• Sarkari fee: ₹${f.gov}`,
    `• Seva charge: ₹${f.service}`,
    `• GST (${svc.gst_percent}%): ₹${f.gst}`,
    `*Total: ₹${f.total}*`,
  ].join("\n");
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function menuReply(): Promise<BotReply> {
  const services = (await getServices()).filter((s) => s.service_id);
  return {
    text: "Ye sevaayein hum banate hein — jis par card dabayein ya uska naam likhein:",
    cards: services,
  };
}

// ---------- status resolver (single source of truth: backend state) ----------
const STATUS_META: Record<string, { emoji: string; label: string; note: string }> = {
  NEW: { emoji: "🆕", label: "Nayi", note: "Application create ho gayi he." },
  COLLECTING_INFORMATION: { emoji: "📝", label: "Details collect ho rahi he", note: "Aapke details abhi collect ho rahe hein." },
  DOCUMENTS_PENDING: { emoji: "📄", label: "Documents pending", note: "Kuch documents abhi bache hein." },
  READY_FOR_CONFIRMATION: { emoji: "🧾", label: "Confirm ka intezar", note: "Summary confirm karna baki he." },
  PAYMENT_PENDING: { emoji: "🟡", label: "Payment pending", note: "Payment ka intezar he. Payment verify hone ke baad queue me jayegi." },
  PAID: { emoji: "✅", label: "Payment verified", note: "Payment verify ho gaya — ab kaam queue me jayega." },
  QUEUED: { emoji: "🔵", label: "Queue me", note: "Operator aapka kaam process karega. Thoda patience 🙏" },
  PROCESSING: { emoji: "⚙️", label: "Process ho raha he", note: "Aapka kaam government portal par process ho raha he." },
  HUMAN_ACTION_REQUIRED: {
    emoji: "🔐",
    label: "Verification required",
    note: "Official portal par ek human verification step pending he. Hamara operator permitted verification complete karega.",
  },
  SUBMITTED: { emoji: "📤", label: "Portal par submit", note: "Aapki application government portal par submit ho chuki he." },
  RESULT_READY: { emoji: "🎉", label: "Result ready", note: "Aapka result ready he — operator deliver karega." },
  DELIVERED: { emoji: "📬", label: "Delivered", note: "Aapko result deliver ho gaya he. Shukriya!" },
  FAILED: { emoji: "❌", label: "Fail", note: "Kuch technical issue hua — operator aapse contact karega." },
  CANCELLED: { emoji: "🚫", label: "Cancel", note: "Ye application cancel ho gayi he." },
};

export type AppStatusInfo = {
  found: boolean;
  token: string;
  service: string;
  status: string;
  emoji: string;
  label: string;
  note: string;
  timeline: { label: string; at: string }[];
  customerPhone: string;
};

export async function resolveApplicationStatus(token: string): Promise<AppStatusInfo | null> {
  const clean = token.toUpperCase();
  const app = await db.application.findFirst({
    where: { applicationNumber: clean },
  });
  if (!app) return null;

  // live status: operator dashboard n8n tables me update karta he — wahi canonical
  let liveStatus = "";
  try {
    const tvs = variants(clean);
    const rows = q1(
      `SELECT status FROM ${phys("applications")} WHERE application_number IN (${tvs.map(() => "?").join(",")}) LIMIT 1`,
      ...tvs
    ) as { status?: string }[];
    if (rows && rows[0]?.status) liveStatus = unq(String(rows[0].status));
  } catch {
    // n8n down → Prisma status
  }
  const status = STATUS_META[liveStatus] ? liveStatus : app.status;
  const meta = STATUS_META[status] ?? {
    emoji: "🔎",
    label: status,
    note: "Status update ho raha he.",
  };

  // service name
  let serviceName = app.serviceId;
  try {
    const svs = variants(app.serviceId);
    const rows2 = q1(
      `SELECT service_name FROM ${phys("service_catalog")} WHERE service_id IN (${svs.map(() => "?").join(",")}) LIMIT 1`,
      ...svs
    ) as { service_name?: string }[];
    if (rows2 && rows2[0]?.service_name) serviceName = unq(String(rows2[0].service_name));
    else {
      const s = (await getServices()).find((x) => x.service_id === app.serviceId);
      if (s) serviceName = s.service_name;
    }
  } catch {
    /* fallback to id */
  }

  // payment flag — backend-verified only
  let payNote = "";
  try {
    const p = await db.payment.findFirst({
      where: { applicationId: app.applicationId },
      orderBy: { id: "desc" },
    });
    if (p) payNote = p.status === "PAID" ? "Payment: verified ✅" : "Payment: pending 🟡";
  } catch {
    /* ignore */
  }

  // timeline (last 4 events)
  const timeline: { label: string; at: string }[] = [];
  try {
    const hist = await db.applicationStatusHistory.findMany({
      where: { applicationId: app.applicationId },
      orderBy: { id: "asc" },
      take: 10,
    });
    for (const h of hist) {
      const m = STATUS_META[h.newStatus];
      timeline.push({
        label: `${m?.emoji ?? "•"} ${h.newStatus}${h.note ? ` — ${h.note}` : ""}`,
        at: h.createdAt.toISOString(),
      });
    }
  } catch {
    /* ignore */
  }

  return {
    found: true,
    token: clean,
    service: serviceName,
    status,
    emoji: meta.emoji,
    label: meta.label,
    note: payNote ? `${meta.note}\n${payNote}` : meta.note,
    timeline: timeline.slice(-4),
    customerPhone: app.customerPhone,
  };
}

// ---------- summary builder (spec #12) ----------
async function buildSummaryReply(
  state: WebState,
  svc: Svc,
  applicantName: string
): Promise<BotReply> {
  const fields = state.fields ?? [];
  const collected = state.collected ?? {};
  const docsCollected = state.docsCollected ?? {};
  const fieldRows = fields.map((f) => ({
    label: f.label,
    value: maskValue(f.field_type, collected[f.field_key] ?? ""),
  }));
  const docRows = (state.docs ?? []).map((d) => ({
    label: d.label,
    done: Boolean(docsCollected[d.doc_key]) && docsCollected[d.doc_key]?.name !== "SKIP",
    required: d.required,
  }));
  const fees = feeParts(svc);
  return {
    text:
      `🧾 *APPLICATION SUMMARY*\n\n` +
      `Sab kuch check kar lein — confirm karne par application ban jayegi 👇`,
    card: {
      type: "summary",
      service: svc.service_name,
      applicant: applicantName,
      fields: fieldRows,
      docs: docRows,
      fees: { gov: fees.gov, service: fees.service, gst: fees.gst, total: fees.total },
    },
    chips: ["✅ Confirm Application", "✏️ Edit Information", "❌ Cancel"],
  };
}

// ---------- next-step router: fields → docs → SUMMARY (stage-aware) ----------
async function nextStep(state: WebState): Promise<{ reply: BotReply | null; stage: string }> {
  const f = await askCurrentField(state);
  if (f) return { reply: f, stage: STAGE.FIELDS };
  const d = await askCurrentDoc(state);
  if (d) return { reply: d, stage: STAGE.DOCS };
  return { reply: null, stage: STAGE.SUMMARY };
}

async function askCurrentField(state: WebState): Promise<BotReply | null> {
  const fields = state.fields ?? [];
  const i = state.fidx ?? 0;
  if (i >= fields.length) return null;
  const f = fields[i];
  const chips: string[] = [];
  if (!f.required) chips.push("SKIP");
  if (f.field_type === "CHOICE" && f.options.length) {
    return {
      text: `${f.question}\n\n${f.options.map((o, k) => `${k + 1}. ${o}`).join("\n")}`,
      chips: [...f.options.slice(0, 4), ...chips],
    };
  }
  return { text: f.question, chips };
}

async function askCurrentDoc(state: WebState): Promise<BotReply | null> {
  const docs = state.docs ?? [];
  const i = state.didx ?? 0;
  if (i >= docs.length) return null;
  const d = docs[i];
  const chips: string[] = [];
  if (!d.required) chips.push("SKIP");
  return {
    text: `📄 *${d.label}* — ${d.question}`,
    chips,
    expectFile: true,
  };
}

async function startService(state: WebState, svc: Svc): Promise<BotReply[]> {
  const [fields, docs] = await Promise.all([getFields(svc.service_id), getDocs(svc.service_id)]);
  state.serviceId = svc.service_id;
  state.serviceName = svc.service_name;
  state.fields = fields;
  state.fidx = 0;
  state.collected = {};
  state.docs = docs;
  state.didx = 0;
  state.docsCollected = {};
  state.fails = 0;
  state.editingFrom = undefined;

  const steps = svc.processing_steps.length
    ? `\n\n⏱ Process: ${svc.processing_steps.join(" → ")}`
    : "";
  const head: BotReply = {
    text:
      `*${svc.service_name}* — ₹${svc.total_fee}\n\n` +
      `${svc.description}\n\n${feeLines(svc)}${steps}\n\n` +
      `Aage badhun? (2-4 din me kaam complete hota he)`,
    chips: ["✅ Confirm karo", "📋 Requirements", "📋 Menu wapas"],
  };
  return [head];
}

function docsListReply(svc: Svc, docs: DocRow[], collected?: Record<string, unknown>): BotReply {
  const c = collected ?? {};
  return {
    text: `📄 *${svc.service_name}* — required documents:`,
    card: {
      type: "docs_list",
      service: svc.service_name,
      docs: docs.map((d) => ({
        label: d.label,
        required: d.required,
        done: Boolean((c as Record<string, { name?: string }>)[d.doc_key]?.name),
      })),
    },
  };
}

async function beginPayment(svc: Svc, token: string, mode: string): Promise<BotReply> {
  const config = await getConfigMap();
  const upi = config.PAYMENT_UPI_ID || "cscseva@upi";
  const f = feeParts(svc);
  const live = mode === "LIVE";
  return {
    text: live
      ? `💳 *Payment* — token *${token}*\n\nSecure payment link par pay karein. Payment verify hone ke baad application queue me jayegi.`
      : `💳 *Payment* — token *${token}*\n\n${feeLines(svc)}\n\nUPI ID: *${upi}*\n(GPay / PhonePe / Paytm — kisi se bhi)\n\nPayment karne ke baad *\"Paid ho gaya\"* bata dein — operator verify karega. Sirf verified payment par hi aapka kaam queue me jayega.`,
    card: {
      type: "payment",
      total: f.total,
      gov: f.gov,
      serviceFee: f.service,
      gst: f.gst,
      upi: live ? "" : upi,
      mode,
      instructions: live
        ? "Secure payment link use karein. Status automatically verify hota he."
        : `UPI par pay karein, phir "Paid ho gaya" bata dein. Operator verification ke baad status PAID hoga.`,
    },
    chips: live ? ["🔍 Status Check", "❓ Payment Help"] : ["✅ Paid ho gaya", "❓ Payment Help", "🔍 Status Check"],
  };
}

function resetState(): WebState {
  return { collected: {}, docsCollected: {}, fails: 0 };
}

function findService(text: string, services: Svc[]): Svc | null {
  return matchService(text, services)?.svc ?? null;
}

function stateIncomplete(state: WebState): boolean {
  if (!state.serviceId) return false;
  const fieldsDone = state.fields ? (state.fidx ?? 0) >= state.fields.length : false;
  const docsDone = state.docs ? (state.didx ?? 0) >= state.docs.length : false;
  return !(fieldsDone && docsDone);
}

// ---------- operator handoff (spec #20) ----------
async function createHandoff(
  session: EngineSession,
  state: WebState,
  reason: string
): Promise<BotReply[]> {
  const out: BotReply[] = [];
  try {
    await db.chatHandoff.create({
      data: {
        sessionId: session.sessionId,
        tenantId: TENANT_ID,
        customerId: session.customerId,
        phone: session.phone,
        name: session.name,
        reason: reason.slice(0, 300),
        status: "WAITING",
      },
    });
  } catch {
    /* non-fatal */
  }
  // dashboard Requests view n8n handoff_queue padhta he — mirror (best-effort)
  try {
    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
    run(
      `INSERT INTO ${phys("handoff_queue")} (phone, name, reason, status, taken_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      JSON.stringify(session.phone || `web_${hashId(session.sessionId)}`),
      JSON.stringify(session.name || "Web customer"),
      JSON.stringify(`[WEB CHAT] ${reason}`.slice(0, 250)),
      JSON.stringify("WAITING"),
      JSON.stringify(""),
      nowStr,
      nowStr
    );
  } catch {
    /* n8n down */
  }
  if (session.phone) upsertCustomerN8n(session.phone, session.name);

  await trackEvent({
    sessionId: session.sessionId,
    customerId: session.customerId,
    phone: session.phone,
    eventType: "HANDOFF_CREATED",
    serviceId: state.serviceId ?? "",
    detail: reason.slice(0, 200),
  });

  out.push({
    text:
      "👩‍💼 Main aapko *operator* se connect kar raha hoon.\n\n" +
      `Operator ko aapki baat pahunch gayi he${session.name ? `, ${session.name}` : ""} — wo jaldi reply karenge (10AM-7PM working hours).\n\n` +
      "Tab tak chat yahin chalti rahegi — agar seva karni ho to batayein 👇",
    card: { type: "handoff", note: reason.slice(0, 200) },
    chips: ["🆕 Nayi seva", "🔍 Status Check"],
  });
  return out;
}

// ---------- status without token (apne applications) ----------
async function myApplicationsReply(phone: string): Promise<BotReply[]> {
  const apps = await db.application.findMany({
    where: { customerPhone: phone, status: { not: "CANCELLED" } },
    orderBy: { id: "desc" },
    take: 5,
  });
  if (!apps.length) {
    return [
      {
        text:
          "Aapki koi application abhi tak nahi bani he.\n\n" +
          "Agar aapne WhatsApp par application banayi he to wahan status puchhein, " +
          "ya yahan token bhejein (jaise: *FB-261006-00021*).",
        chips: ["🆕 Nayi seva"],
      },
    ];
  }
  const out: BotReply[] = [
    { text: `Aapki ${apps.length > 1 ? `latest ${apps.length} applications` : "application"}: 👇` },
  ];
  for (const a of apps) {
    const info = await resolveApplicationStatus(a.applicationNumber);
    if (info) {
      out.push({
        text: `🔎 *${info.token}*`,
        card: {
          type: "status",
          token: info.token,
          service: info.service,
          status: info.status,
          emoji: info.emoji,
          label: info.label,
          note: info.note,
          timeline: info.timeline,
        },
      });
    }
  }
  return out;
}

// ---------- Customer 360° brief (user rule: ID/token ke baad sabki jankari) ----------
// Format: aapne ab tak kya banwaya (complete) + kya pending + aage kya banwana chahte he
const BRIEF_DONE_STATUSES = ["DELIVERED", "RESULT_READY", "COMPLETED"];
async function customerBriefReply(phone: string, cid?: string, name?: string): Promise<BotReply[]> {
  const apps = await db.application.findMany({
    where: { customerPhone: phone, status: { notIn: ["CANCELLED", "FAILED"] } },
    orderBy: { id: "desc" },
    take: 8,
  });
  const head = `📋 *Aapka poora record*${name ? ` — ${name}` : ""}${cid ? `\n🆔 Customer ID: *${cid}*` : ""}`;
  if (!apps.length) {
    return [
      {
        text:
          `${head}\n\n` +
          "🆕 Aapne abhi tak humse koi seva nahi banwayi.\n" +
          "🚀 Aaj pehli seva banwate hein — neeche card chunein ya service ka naam likhein 👇",
        chips: ["🆕 Nayi seva"],
      },
    ];
  }
  const done: string[] = [];
  const pending: string[] = [];
  for (const a of apps) {
    const info = await resolveApplicationStatus(a.applicationNumber);
    const svcName = info?.service || a.serviceId || "Seva";
    const tok = info?.token || a.applicationNumber;
    const line = `• ${svcName} — *${tok}* (${info?.label || a.status})`;
    if (BRIEF_DONE_STATUSES.includes(a.status)) done.push(line);
    else pending.push(line);
  }
  const parts: string[] = [head, "", "✅ *Aapne ab tak humse ye banwaya:*"];
  parts.push(...(done.length ? done : ["• (abhi tak koi complete nahi hua)"]));
  if (pending.length) {
    parts.push("", "⏳ *Ye kaam abhi chal rahe hain (pending):*");
    parts.push(...pending);
  }
  parts.push("", "🚀 *Aage ke liye aap humse kya banwana chahte hain?* Neeche services dekhiye 👇");
  return [{ text: parts.join("\n"), chips: ["🆕 Nayi seva", "📄 Documents", "🧑‍💼 Operator"] }];
}

// ---------- finalize: explicit confirm ke baad hi application banti he ----------
async function finalize(session: EngineSession, state: WebState, cfg: ChatbotConfig): Promise<BotReply[]> {
  const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
  if (!svc) {
    return [{ text: "Service load nahi ho payi — dobara try karein ya menu kholein.", chips: ["📋 Menu wapas"] }];
  }
  const token = await nextToken(cfg.tokenPrefix || "FB");
  const aid = appId();
  const collected = state.collected ?? {};
  const docsCollected = state.docsCollected ?? {};
  const docs = Object.entries(docsCollected)
    .filter(([, d]) => d.name !== "SKIP")
    .map(([docKey, d]) => ({ doc_key: docKey, mime_type: d.type, file_name: d.name }));

  const formData: Record<string, string> = { ...collected };
  for (const [k, v] of Object.entries(docsCollected)) formData[`doc_${k}`] = v.name;

  try {
    await db.customer.upsert({
      where: { phone: session.phone },
      update: { name: session.name, customerId: session.customerId },
      create: { phone: session.phone, name: session.name, customerId: session.customerId },
    });
    await db.application.create({
      data: {
        applicationId: aid,
        customerPhone: session.phone,
        serviceId: state.serviceId ?? "",
        status: "PAYMENT_PENDING",
        tenantId: TENANT_ID,
        govFee: svc.government_fee,
        serviceCharge: svc.service_charge,
        gst: svc.gst_percent,
        totalFee: svc.total_fee,
        formData: JSON.stringify({
          ...formData,
          _source: "WEB_CHAT",
          _customer_name: session.name,
          _customer_id: session.customerId,
        }),
        applicationNumber: token,
      },
    });
    for (const [k, v] of Object.entries(collected)) {
      await db.applicationFieldValue.create({
        data: { applicationId: aid, phone: session.phone, fieldKey: k, fieldValue: v, validated: "TRUE" },
      });
    }
    for (const [docKey, d] of Object.entries(docsCollected)) {
      if (d.name === "SKIP") continue;
      await db.applicationDocument.create({
        data: {
          applicationId: aid,
          phone: session.phone,
          docKey,
          mediaId: `WEB_${aid}_${docKey}`,
          mimeType: d.type,
          status: "RECEIVED",
          verifiedBy: "CUSTOMER",
        },
      });
    }
    await db.applicationStatusHistory.create({
      data: {
        applicationId: aid,
        applicationNumber: token,
        oldStatus: "READY_FOR_CONFIRMATION",
        newStatus: "PAYMENT_PENDING",
        note: "Customer ne chat me confirm kiya",
      },
    });
    await db.payment.create({
      data: {
        paymentId: `PAYWEB${rand(8)}`,
        applicationId: aid,
        customerPhone: session.phone,
        amount: svc.total_fee,
        gateway: cfg.paymentMode === "LIVE" ? "RAZORPAY" : "UPI_MANUAL",
        transactionId: "",
        status: "PENDING",
        meta: JSON.stringify({ token, mode: cfg.paymentMode, source: "WEB_CHATBOT" }),
      },
    });
    await trackEvent({
      sessionId: session.sessionId,
      customerId: session.customerId,
      phone: session.phone,
      eventType: "APPLICATION_CREATED",
      serviceId: svc.service_id,
      applicationId: aid,
      detail: token,
    });
  } catch (e) {
    console.error("webchat finalize prisma error:", e);
    await trackEvent({
      sessionId: session.sessionId,
      eventType: "AI_ERROR",
      detail: "finalize-db-error",
    });
    return [
      {
        text:
          "⚠️ Application banate waqt technical issue aaya.\n\n" +
          "Aapka data safe he — thodi der baad *Confirm Application* dobara dabayein ya operator se baat karein.",
        chips: ["👩‍💼 Talk to Operator"],
      },
    ];
  }

  // n8n live tables mirror (dashboard visibility; best-effort)
  try {
    upsertCustomerN8n(session.phone, session.name);
    insertApplicationN8n({
      applicationId: aid,
      appNumber: token,
      phone: session.phone,
      name: session.name,
      serviceId: state.serviceId ?? "",
      govFee: svc.government_fee,
      serviceCharge: svc.service_charge,
      gst: svc.gst_percent,
      totalFee: svc.total_fee,
      formData,
      docs,
      source: "WEB_CHAT",
    });
  } catch {
    /* n8n down → fine */
  }

  state.token = token;
  const fieldCount = Object.values(collected).filter((v) => v && v !== "SKIP").length;
  const docCount = docs.length;

  return [
    {
      text:
        `✅ *Application created successfully!*\n\n` +
        `Aapka application token he:\n\n📋 *${token}*\n\n` +
        `Isko save kar lein — isi se status check hoga. (Token ek reference ID he, password nahi.)`,
      card: { type: "token", token, service: svc.service_name },
    },
    {
      text:
        `📌 Summary: ${svc.service_name} • ${fieldCount} details • ${docCount} documents • ₹${svc.total_fee}\n` +
        `Ab payment step he 👇`,
    },
  ];
}

// ============================================================
// MAIN ENTRY
// ============================================================

const OPERATOR_RE =
  /(operator|insaan|real (person|aadmi)|agent se|call karo|phone karo|baat karni he|baat karni hai|human (help|support)|khadoos|shikayat)/i;

export async function processInput(
  session: EngineSession,
  input: EngineInput
): Promise<EngineResult> {
  const text = (input.text ?? "").trim();
  const att = input.attachment;
  let stage = session.stage;
  let state: WebState = session.state ?? resetState();
  const replies: BotReply[] = [];
  let patchOut: Partial<EngineSession> = {};
  const cfg = await getChatbotConfig();
  const say = (r: BotReply) => replies.push(r);
  const phoneForAI = session.phone || `web_${hashId(session.sessionId)}`;
  const isIdStage = stage === STAGE.NAME || stage === STAGE.PHONE;

  // ---------- chatbot disabled ----------
  if (!cfg.enabled) {
    say({ text: `🙏 ${cfg.businessName} chat abhi available nahi he. ${cfg.fallbackMessage}` });
    return { replies, patch: { stage, ...patchOut, state } };
  }

  // ---------- GLOBAL: cancel (any stage except ID steps) ----------
  if (text && isCancel(text) && !isIdStage) {
    const cancelledService = state.serviceId ?? "";
    setStage(STAGE.MENU);
    state = resetState();
    await trackEvent({
      sessionId: session.sessionId,
      customerId: session.customerId,
      phone: session.phone,
      eventType: "APPLICATION_CANCELLED",
      serviceId: cancelledService,
      detail: `stage:${stage}`,
    });
    say({ text: "Theek he, cancel kar diya. Koi baat nahi! 😊" });
    say(await menuReply());
    return { replies, patch: { stage, ...patchOut, state } };
  }

  // ---------- GLOBAL: token lookup (any stage except ID steps) ----------
  if (text && !isIdStage) {
    const tok = extractToken(text) ?? (CSC_NUMBER_RE.test(text) ? text.match(CSC_NUMBER_RE)![0] : null);
    if (tok) {
      const info = await resolveApplicationStatus(tok);
      if (!info) {
        await trackEvent({
          sessionId: session.sessionId,
          eventType: "TOKEN_LOOKUP_INVALID",
          detail: tok,
        });
        say({
          text:
            `🔎 Token *${tok}* database me nahi mila.\n\n` +
            `Format check karein (jaise: *FB-261006-00021*) ya operator se confirm karein.`,
          chips: ["👩‍💼 Talk to Operator", "🆕 Nayi seva"],
        });
      } else if (session.phone && info.customerPhone && info.customerPhone !== session.phone) {
        // tenant/customer isolation — doosre customer ka application nahi dikhega
        say({
          text:
            "🔒 Ye application aapke number par registered nahi he.\n\n" +
            "Privacy ke liye main uski details nahi de sakta. Agar aapka token he to sahi token bhejein.",
          chips: ["🔍 Apni application dekho"],
        });
      } else {
        await trackEvent({
          sessionId: session.sessionId,
          customerId: session.customerId,
          phone: session.phone,
          eventType: "STATUS_QUERIED",
          applicationId: info.token,
          detail: info.status,
        });
        say({
          text:
            `🔎 *Application Status*\n\nToken: *${info.token}*\n\n${info.emoji} Status: *${info.label}*\n\n${info.note}`,
          card: {
            type: "status",
            token: info.token,
            service: info.service,
            status: info.status,
            emoji: info.emoji,
            label: info.label,
            note: info.note,
            timeline: info.timeline,
          },
          chips:
            info.status === "PAYMENT_PENDING"
              ? ["❓ Payment Help", "🆕 Nayi seva"]
              : ["🆕 Nayi seva", "👩‍💼 Talk to Operator"],
        });
      }
      return { replies, patch: { stage, ...patchOut, state } };
    }
  }

  // ---------- GLOBAL: operator handoff (any stage) ----------
  if (text && OPERATOR_RE.test(text) && stage !== STAGE.PAYMENT) {
    const reason =
      stage === STAGE.FIELDS || stage === STAGE.DOCS
        ? `Form bharne beech me operator manga (service: ${state.serviceName ?? "-"})`
        : text.slice(0, 200);
    const hs = await createHandoff(session, state, reason);
    hs.forEach(say);
    // flow context wapas — customer answer de sake
    if (stage === STAGE.FIELDS) {
      const f = (state.fields ?? [])[state.fidx ?? 0];
      if (f) say({ text: `Wapas aayein to ye sawal: ${f.question}`, chips: (state.fields ?? [])[(state.fidx ?? 0)]?.required ? [] : ["SKIP"] });
    } else if (stage === STAGE.DOCS) {
      const d = (state.docs ?? [])[(state.didx ?? 0)];
      if (d) say({ text: `📄 Agla document: *${d.label}* — ${d.question}`, expectFile: true });
    }
    return { replies, patch: { stage, ...patchOut, state } };
  }

  // ---------- GLOBAL: attachment while not in DOCS ----------
  if (att && stage !== STAGE.DOCS) {
    say({
      text:
        stage === STAGE.FIELDS
          ? "Ye sawal likhkar jawab dena he — file baad me documents wale step par aayegi 😊"
          : "File mil gayi 📎 — lekin abhi documents ka step nahi he. Pehle chaliye flow ko complete karte hein.",
    });
    // fall through to stage logic with text only
  }

  const intent: IntentResult | null =
    text && !isIdStage ? await classifyIntent(text.slice(0, 300), stage) : null;

  function setStage(s: string) {
    stage = s;
  }

  switch (stage) {
    // ================= STEP 1: NAME =================
    case STAGE.NAME: {
      if (att) {
        say({ text: "Pehle aapka naam 😊 — file baad me kaam aayegi." });
        break;
      }
      const looksPhone = /^\+?\d[\d\s-]{7,}$/.test(text);
      const isGreeting = /^(hi|hii|hiii|hello|namaste|namaskar|hey|salam|salaam|assalam|good (morning|afternoon|evening)|start|shuru|ok)\b/i.test(text);
      if (isGreeting) {
        say({ text: cfg.welcomeMessage });
        say({ text: "Chaliye pehle aapki ID banate hein — *aapka pura naam* likhein. 😊" });
        break;
      }
      if (!text || text.length < 2 || looksPhone || !/[a-zA-Z\u0900-\u097F]/.test(text)) {
        say({
          text: looksPhone
            ? "Pehle aapka naam chahiye 😊 Naam likhein, phir number."
            : "Naam thoda sahi se likhein (jaise: Ramesh Kumar).",
        });
        break;
      }
      const name = text.slice(0, 60).replace(/\s+/g, " ");
      session.name = name;
      patchOut.name = name;
      setStage(STAGE.PHONE);
      say({
        text: `Namaste *${name}*! 🙏\nMain ${cfg.assistantName} hoon — ${cfg.businessName} ka assistant.\n\nAb aapka *mobile number* likhein (10 digit) — isi se aapki customer ID banegi.`,
      });
      break;
    }

    // ================= STEP 2: PHONE + CUSTOMER ID =================
    case STAGE.PHONE: {
      if (att) {
        say({ text: "Mobile number likhein (10 digit) — ID usi se banegi 😊" });
        break;
      }
      const v = validateField("MOBILE", text);
      if (!v.ok) {
        say({ text: `${v.reason} Dobara likhein.` });
        break;
      }
      const phone = v.value;
      session.phone = phone;

      // repeat customer? ID reuse karo (ek number = ek ID)
      let cid = "";
      try {
        const existing = await db.customer.findUnique({ where: { phone } });
        if (existing?.customerId) cid = existing.customerId;
      } catch {
        /* non-fatal */
      }
      if (!cid) cid = `CUST-2026-${rand(5)}`;
      session.customerId = cid;
      state = resetState();

      try {
        await db.customer.upsert({
          where: { phone },
          update: { name: session.name, customerId: cid },
          create: { phone, name: session.name, customerId: cid },
        });
      } catch {
        /* non-fatal */
      }
      try {
        upsertCustomerN8n(phone, session.name);
      } catch {
        /* n8n down */
      }
      await trackEvent({
        sessionId: session.sessionId,
        customerId: cid,
        phone,
        eventType: "CUSTOMER_ID_CREATED",
        detail: cid,
      });

      setStage(STAGE.MENU);
      say({
        text:
          `🎉 *Aapki ID ban gayi!*\n\n` +
          `👤 Customer ID: *${cid}*\n` +
          `📱 Mobile: ${phone}\n` +
          `🧑 Naam: ${session.name}\n\n` +
          `Ab se har seva isi ID pe hogi. ${cfg.businessName} ki services dekhiye 👇`,
      });
      // user rule: token/ID generate hone ke TURANT baad customer ki sabki jankari —
      // ab tak kya banwaya + kya complete + kya pending + aage kya banwana chahta he
      (await customerBriefReply(phone, cid, session.name)).forEach(say);
      say(await menuReply());
      break;
    }

    // ================= MENU =================
    case STAGE.MENU: {
      if (att) {
        say({ text: "Document ka step baad me aata he 😊 Pehle service chunein 👇" });
        say(await menuReply());
        break;
      }
      if (!text) {
        say(await menuReply());
        break;
      }
      const it = intent!;
      if (it.intent === "START_APPLICATION" && it.serviceCandidate) {
        const services = await getServices();
        const svc = services.find((s) => s.service_id === it.serviceCandidate);
        if (svc) {
          await trackEvent({
            sessionId: session.sessionId,
            customerId: session.customerId,
            phone: session.phone,
            eventType: "SERVICE_SELECTED",
            serviceId: svc.service_id,
            detail: `intent:${it.intent} conf:${it.confidence}`,
          });
          setStage(STAGE.OFFER);
          (await startService(state, svc)).forEach(say);
          break;
        }
      }
      if (it.intent === "CONTINUE_APPLICATION" && stateIncomplete(state)) {
        const nx = await nextStep(state);
        if (nx.reply) {
          say({
            text: `Wahi se chalte hein! 🔄 *${state.serviceName}* jari rakhte hein 👇`,
          });
          say(nx.reply);
          setStage(nx.stage);
          break;
        }
      }
      if (it.intent === "APPLICATION_STATUS" || it.intent === "TOKEN_LOOKUP" || it.intent === "PAYMENT_STATUS") {
        if (session.phone) (await customerBriefReply(session.phone, session.customerId, session.name)).forEach(say);
        else
          say({
            text: "Status check karne ke liye aapka *application token* bhejein (jaise: FB-261006-00021).",
          });
        break;
      }
      if (it.intent === "DOCUMENT_QUERY") {
        const services = await getServices();
        const svc = it.serviceCandidate ? services.find((s) => s.service_id === it.serviceCandidate) : null;
        if (svc) {
          const docs = await getDocs(svc.service_id);
          say(docsListReply(svc, docs));
        } else {
          say({
            text: "Kaunsi service ke documents janna he? Service ka naam likhein ya card chunein 👇",
            cards: (await getServices()).filter((s) => s.service_id),
          });
        }
        break;
      }
      if (it.intent === "SERVICE_DISCOVERY" || it.intent === "GREETING") {
        if (it.intent === "GREETING") say({ text: `Namaste${session.name ? " " + session.name : ""}! 🙏` });
        say(await menuReply());
        break;
      }
      if (it.intent === "CONFIRM_APPLICATION" && stateIncomplete(state)) {
        const nx = await nextStep(state);
        if (nx.reply) {
          say({ text: `Continue karte hein *${state.serviceName}* 👇` });
          say(nx.reply);
          setStage(nx.stage);
          break;
        }
      }
      // stateless "confirm/haan/ok" — koi active application nahi → honest deterministic
      // reply (spec #16: AI/flow kabhi bhi fake "submit ho gaya" claim nahi kar sakta)
      if (isConfirm(text) && !state.serviceId) {
        say({
          text: "Abhi koi active application nahi he 🙂 Kaunsi service banwani he? Card chunein ya service ka naam likhein 👇",
          cards: (await getServices()).filter((s) => s.service_id),
        });
        break;
      }
      // FAQ / UNKNOWN → AI general chat (knowledge base se bahar → fallback message)
      const ai = await aiGeneralChat(phoneForAI, text);
      if (ai) {
        say({ text: ai });
      } else {
        say({ text: cfg.fallbackMessage });
      }
      say({ text: "Koi seva chahiye to card par dabayein 👇", cards: (await getServices()).filter((s) => s.service_id) });
      break;
    }

    // ================= OFFER (fee confirm) =================
    case STAGE.OFFER: {
      const services = await getServices();
      const svc =
        services.find((s) => s.service_id === state.serviceId) ??
        (text ? findService(text, services) : null);
      if (!svc) {
        setStage(STAGE.MENU);
        state = resetState();
        say({ text: "Service select karein 👇" });
        say(await menuReply());
        break;
      }
      if (att) {
        say({ text: "File abhi nahi — pehle confirm karein 😊" });
        break;
      }
      if (isConfirm(text)) {
        const nxt = await askCurrentField(state);
        if (nxt) {
          setStage(STAGE.FIELDS);
          say({
            text: `Badhiya! Kuch details chahiye — sirf ${state.fields?.length ?? 0} chhote sawal, ek-ek karke 👇`,
          });
          say(nxt);
        } else {
          const d = await askCurrentDoc(state);
          if (d) {
            setStage(STAGE.DOCS);
            say({ text: `Ab documents chahiye 📄` });
            say(d);
          } else {
            setStage(STAGE.SUMMARY);
            say(await buildSummaryReply(state, svc, session.name));
          }
        }
        break;
      }
      if (intent && (intent.intent === "DOCUMENT_QUERY" || /requirement|documents|kagaz/i.test(text))) {
        const docs = await getDocs(svc.service_id);
        say(docsListReply(svc, docs));
        say({
          text: "Confirm karke form bharna shuru karein 👇",
          chips: ["✅ Confirm karo", "📋 Menu wapas"],
        });
        break;
      }
      // side question / different service
      const otherSvc = findService(text, services);
      if (otherSvc && otherSvc.service_id !== state.serviceId) {
        (await startService(state, otherSvc)).forEach(say);
        break;
      }
      if (isMenu(text)) {
        setStage(STAGE.MENU);
        state = resetState();
        say(await menuReply());
        break;
      }
      if (text) {
        const ai = await aiGeneralChat(phoneForAI, text);
        if (ai) say({ text: ai });
      }
      say({
        text: `${svc.service_name} ke liye aage badhna he to *Confirm karo* dabayein 👇`,
        chips: ["✅ Confirm karo", "📋 Requirements", "📋 Menu wapas"],
      });
      break;
    }

    // ================= FIELDS =================
    case STAGE.FIELDS: {
      const fields = state.fields ?? [];
      let i = state.fidx ?? 0;
      if (i >= fields.length) {
        const nx = await nextStep(state);
        setStage(nx.stage);
        if (nx.reply) say(nx.reply);
        else {
          const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
          if (svc) say(await buildSummaryReply(state, svc, session.name));
        }
        break;
      }
      const f = fields[i];

      if (att) {
        say({ text: `Ye sawal likhkar jawab dena he: ${f.question}` });
        break;
      }

      if (isMenu(text)) {
        setStage(STAGE.MENU);
        state = resetState();
        say(await menuReply());
        break;
      }

      const canSkip = !f.required || (state.fails ?? 0) >= 3;
      if (isSkip(text)) {
        if (canSkip) {
          state.collected = { ...(state.collected ?? {}), [f.field_key]: "SKIP" };
          state.fails = 0;
          i += 1;
          state.fidx = i;
          const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
          if (state.editingFrom === "SUMMARY") {
            state.editingFrom = undefined;
            setStage(STAGE.SUMMARY);
            if (svc) say(await buildSummaryReply(state, svc, session.name));
            break;
          }
          const nx = await nextStep(state);
          setStage(nx.stage);
          if (nx.reply) {
            say({ text: `${ack()} — SKIP 👍` });
            say(nx.reply);
          } else if (svc) {
            say(await buildSummaryReply(state, svc, session.name));
          }
        } else {
          say({ text: "Ye sawal zaroori he — jawab likhein. (3 baar try ke baad SKIP ho jayega)" });
        }
        break;
      }

      // CHOICE: exact option match AI gate se PEHLE (LLM noise se bachaav)
      if (f.field_type === "CHOICE" && f.options.length) {
        const cv = matchChoice(f.options, text);
        if (cv.ok) {
          state.collected = { ...(state.collected ?? {}), [f.field_key]: cv.value };
          state.fails = 0;
          i += 1;
          state.fidx = i;
          await trackEvent({
            sessionId: session.sessionId,
            customerId: session.customerId,
            phone: session.phone,
            eventType: "FIELD_ANSWERED",
            serviceId: state.serviceId ?? "",
            detail: f.field_key,
          });
          const svcC = (await getServices()).find((s) => s.service_id === state.serviceId);
          if (state.editingFrom === "SUMMARY") {
            state.editingFrom = undefined;
            setStage(STAGE.SUMMARY);
            say({ text: `${ack()} — update ho gaya ✅` });
            if (svcC) say(await buildSummaryReply(state, svcC, session.name));
            break;
          }
          const nxC = await nextStep(state);
          setStage(nxC.stage);
          if (nxC.reply) {
            say({ text: `${ack()} (${i}/${fields.length})` });
            say(nxC.reply);
          } else if (svcC) {
            say(await buildSummaryReply(state, svcC, session.name));
          }
          break;
        }
      }

      // TYPED fields: validation AI gate se PEHLE — well-formed answer turant accept
      // (LLM variance se bachaav; side-questions sirf invalid-looking text par check hote hein)
      const TYPED = ["MOBILE", "DOB", "PAN", "AADHAAR", "EMAIL", "GSTIN", "IFSC", "ACCOUNT", "NUMBER", "PINCODE"];
      if (TYPED.includes(f.field_type.toUpperCase())) {
        const pre = validateField(f.field_type, text);
        if (pre.ok) {
          state.collected = { ...(state.collected ?? {}), [f.field_key]: pre.value };
          state.fails = 0;
          i += 1;
          state.fidx = i;
          await trackEvent({
            sessionId: session.sessionId,
            customerId: session.customerId,
            phone: session.phone,
            eventType: "FIELD_ANSWERED",
            serviceId: state.serviceId ?? "",
            detail: f.field_key,
          });
          const svcP = (await getServices()).find((s) => s.service_id === state.serviceId);
          if (state.editingFrom === "SUMMARY") {
            state.editingFrom = undefined;
            setStage(STAGE.SUMMARY);
            say({ text: `${ack()} — update ho gaya ✅` });
            if (svcP) say(await buildSummaryReply(state, svcP, session.name));
            break;
          }
          const nxP = await nextStep(state);
          setStage(nxP.stage);
          if (nxP.reply) {
            say({ text: `${ack()} (${i}/${fields.length})` });
            say(nxP.reply);
          } else if (svcP) {
            say(await buildSummaryReply(state, svcP, session.name));
          }
          break;
        }
      }

      // AI side-question gate (same as WhatsApp bot)
      const gate = await aiFieldGate({
        phone: phoneForAI,
        name: session.name,
        text,
        state: "FIELDS",
        serviceName: state.serviceName ?? "",
        field: { label: f.label, question: f.question },
        collected: state.collected ?? {},
      });
      if (gate && gate.action === "reply") {
        say({ text: gate.reply });
        say({ text: `Wapas sawal: ${f.question}` });
        break;
      }

      // validate
      const v = f.field_type === "CHOICE" ? matchChoice(f.options, text) : validateField(f.field_type, text);
      if (!v.ok) {
        state.fails = (state.fails ?? 0) + 1;
        await trackEvent({
          sessionId: session.sessionId,
          customerId: session.customerId,
          phone: session.phone,
          eventType: "FIELD_INVALID",
          serviceId: state.serviceId ?? "",
          detail: f.field_key,
        });
        const extra =
          (state.fails ?? 0) >= 3
            ? "\n\n(Tip: *SKIP* likhkar is sawal ko chhod sakte hein — operator baad me bhar dega)"
            : "";
        say({ text: `⚠️ ${v.reason}${extra}\n\n${f.question}` });
        break;
      }

      state.collected = { ...(state.collected ?? {}), [f.field_key]: v.value };
      state.fails = 0;
      i += 1;
      state.fidx = i;
      await trackEvent({
        sessionId: session.sessionId,
        customerId: session.customerId,
        phone: session.phone,
        eventType: "FIELD_ANSWERED",
        serviceId: state.serviceId ?? "",
        detail: f.field_key,
      });
      const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
      // edit mode: sirf ye ek field, phir wapas summary
      if (state.editingFrom === "SUMMARY") {
        state.editingFrom = undefined;
        setStage(STAGE.SUMMARY);
        say({ text: `${ack()} — update ho gaya ✅` });
        if (svc) say(await buildSummaryReply(state, svc, session.name));
        break;
      }
      const nx = await nextStep(state);
      setStage(nx.stage);
      if (nx.reply) {
        say({ text: `${ack()} (${i}/${fields.length})` });
        say(nx.reply);
      } else if (svc) {
        say(await buildSummaryReply(state, svc, session.name));
      }
      break;
    }

    // ================= DOCS =================
    case STAGE.DOCS: {
      const docs = state.docs ?? [];
      let i = state.didx ?? 0;
      if (i >= docs.length) {
        const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
        setStage(STAGE.SUMMARY);
        if (svc) say(await buildSummaryReply(state, svc, session.name));
        break;
      }
      const d = docs[i];

      if (att) {
        const okType =
          /^image\//.test(att.type) ||
          att.type === "application/pdf" ||
          /\.(jpe?g|png|webp|pdf|heic)$/i.test(att.name);
        if (!okType) {
          say({ text: "Sirf *photo (JPG/PNG)* ya *PDF* chalta he. Dobara bhejein." });
          break;
        }
        if (att.size > 4 * 1024 * 1024) {
          say({ text: "File 4MB se chhoti honi chahiye. Photo thodi compress karke bhejein." });
          break;
        }
        state.docsCollected = {
          ...(state.docsCollected ?? {}),
          [d.doc_key]: { name: att.name, type: att.type || "image/jpeg", size: att.size },
        };
        i += 1;
        state.didx = i;
        await trackEvent({
          sessionId: session.sessionId,
          customerId: session.customerId,
          phone: session.phone,
          eventType: "DOCUMENT_UPLOADED",
          serviceId: state.serviceId ?? "",
          detail: d.doc_key,
        });
        const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
        const nxt = await askCurrentDoc(state);
        if (nxt) {
          say({ text: `✅ ${d.label} mil gaya! (${i}/${docs.length})` });
          say(nxt);
        } else {
          setStage(STAGE.SUMMARY);
          say({ text: `✅ ${d.label} mil gaya! Sab documents complete 🎯` });
          if (svc) say(await buildSummaryReply(state, svc, session.name));
        }
        break;
      }

      if (isMenu(text)) {
        setStage(STAGE.MENU);
        state = resetState();
        say(await menuReply());
        break;
      }

      if (isSkip(text)) {
        if (!d.required) {
          i += 1;
          state.didx = i;
          state.docsCollected = {
            ...(state.docsCollected ?? {}),
            [d.doc_key]: { name: "SKIP", type: "text/plain", size: 0 },
          };
          await trackEvent({
            sessionId: session.sessionId,
            eventType: "DOCUMENT_SKIPPED",
            serviceId: state.serviceId ?? "",
            detail: d.doc_key,
          });
          const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
          const nxt = await askCurrentDoc(state);
          if (nxt) say(nxt);
          else {
            setStage(STAGE.SUMMARY);
            if (svc) say(await buildSummaryReply(state, svc, session.name));
          }
        } else {
          say({ text: `${d.label} zaroori he — photo/PDF bhejein. (Operator baad me manga sakta he)` });
        }
        break;
      }

      // text while file expected → AI gate for side questions
      const gate = await aiFieldGate({
        phone: phoneForAI,
        name: session.name,
        text,
        state: "DOCS",
        serviceName: state.serviceName ?? "",
        field: { label: d.label, question: d.question },
        collected: state.collected ?? {},
      });
      if (gate && gate.action === "reply") {
        say({ text: gate.reply });
        say({ text: `Document: ${d.question}`, expectFile: true });
        break;
      }
      say({
        text: `${d.label} ki *photo ya PDF* attach karke bhejein 📎${d.required ? "" : " (ya *SKIP* likhein)"}`,
        expectFile: true,
        chips: d.required ? [] : ["SKIP"],
      });
      break;
    }

    // ================= SUMMARY (spec #12 + #13) =================
    case STAGE.SUMMARY: {
      const services = await getServices();
      const svc = services.find((s) => s.service_id === state.serviceId);
      if (!svc) {
        setStage(STAGE.MENU);
        state = resetState();
        say(await menuReply());
        break;
      }
      if (att) {
        say({ text: "Sab documents mil gaye the 😊 Ab summary confirm karein 👇" });
        break;
      }

      // explicit confirmation — current summary par hi apply hota he
      if (isConfirm(text) || (intent && intent.intent === "CONFIRM_APPLICATION")) {
        const fin = await finalize(session, state, cfg);
        fin.forEach(say);
        if (state.token) {
          setStage(STAGE.PAYMENT);
          say(await beginPayment(svc, state.token, cfg.paymentMode));
        } else {
          // finalize failed — reply already sent, stay on summary
        }
        break;
      }

      if (/edit|change|sudhar|galat|update|badlo|badal/i.test(text) || (intent && intent.intent === "INFORMATION_UPDATE")) {
        setStage(STAGE.EDIT);
        const fields = state.fields ?? [];
        say({
          text:
            `✏️ *Kaunsi detail badalni he?* Number likhein:

` +
            fields
              .map(
                (f, k) =>
                  `${k + 1}. ${f.label}: ${(state.collected ?? {})[f.field_key] || "—"}`
              )
              .join("\n") +
            `\n\n(0 likhein — wapas summary par)`,
          chips: ["0", "❌ Cancel"],
        });
        break;
      }

      if (isMenu(text)) {
        setStage(STAGE.MENU);
        state = resetState();
        say(await menuReply());
        break;
      }

      if (intent && (intent.intent === "DOCUMENT_QUERY" || /requirement|documents/i.test(text))) {
        const docs = await getDocs(svc.service_id);
        say(docsListReply(svc, docs, state.docsCollected ?? {}));
        say({ text: "Confirm karne ke liye 👇", chips: ["✅ Confirm Application", "✏️ Edit Information"] });
        break;
      }

      if (text) {
        const gate = await aiFieldGate({
          phone: phoneForAI,
          name: session.name,
          text,
          state: "FIELDS",
          serviceName: state.serviceName ?? "",
          field: { label: "Application Summary", question: "summary confirm karna he" },
          collected: state.collected ?? {},
        });
        if (gate && gate.action === "reply") say({ text: gate.reply });
      }
      say({
        text: "Confirm karne par application ban jayegi aur token milega 👇",
        chips: ["✅ Confirm Application", "✏️ Edit Information", "❌ Cancel"],
      });
      break;
    }

    // ================= EDIT (information update) =================
    case STAGE.EDIT: {
      const fields = state.fields ?? [];
      if (isMenu(text) || text === "0" || /wapas|back|summary/i.test(text)) {
        const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
        setStage(STAGE.SUMMARY);
        if (svc) say(await buildSummaryReply(state, svc, session.name));
        break;
      }
      const num = parseInt(text, 10);
      if (isNaN(num) || num < 1 || num > fields.length) {
        say({
          text: `1 se ${fields.length} me se number likhein (ya *0* = wapas summary).`,
          chips: ["0", "❌ Cancel"],
        });
        break;
      }
      const f = fields[num - 1];
      state.editingFrom = "SUMMARY";
      state.fidx = num - 1;
      state.fails = 0;
      setStage(STAGE.FIELDS);
      say({ text: `Theek he — *${f.label}* dobara batayein 👇` });
      const q = await askCurrentField(state);
      if (q) say(q);
      break;
    }

    // ================= PAYMENT (token ke baad) =================
    case STAGE.PAYMENT: {
      const services = await getServices();
      const svc = services.find((s) => s.service_id === state.serviceId);
      if (!svc || !state.token) {
        setStage(STAGE.MENU);
        state = resetState();
        say(await menuReply());
        break;
      }

      // "paid" claim — application PAID nahi hogi (sirf verified event se hogi)
      if (isPaid(text)) {
        await trackEvent({
          sessionId: session.sessionId,
          customerId: session.customerId,
          phone: session.phone,
          eventType: "PAYMENT_CLAIMED",
          applicationId: state.token,
          detail: `token:${state.token}`,
        });
        say({
          text:
            `🙏 Dhyane dein: *sirf verified payment* par hi application aage badhti he.

` +
            `Aapka token: *${state.token}*

` +
            `Payment verify hone ke baad status apne aap *PAID → QUEUED* hoga. ` +
            `Status check karne ke liye token bhejte rahein ya neeche dabayein 👇`,
          chips: ["🔍 Status Check", "❓ Payment Help", "👩‍💼 Talk to Operator"],
        });
        break;
      }

      if (/status/i.test(text) || (intent && (intent.intent === "APPLICATION_STATUS" || intent.intent === "PAYMENT_STATUS"))) {
        const info = await resolveApplicationStatus(state.token);
        if (info) {
          say({
            text: `🔎 *${info.token}*

${info.emoji} Status: *${info.label}*

${info.note}`,
            card: {
              type: "status",
              token: info.token,
              service: info.service,
              status: info.status,
              emoji: info.emoji,
              label: info.label,
              note: info.note,
              timeline: info.timeline,
            },
            chips: info.status === "PAYMENT_PENDING" ? ["❓ Payment Help", "🆕 Nayi seva"] : ["🆕 Nayi seva"],
          });
        } else {
          say({ text: "Status load nahi hua — thodi der baad try karein." });
        }
        break;
      }

      if (att) {
        say({ text: "Payment ke liye file nahi — payment karein aur \"Paid ho gaya\" bata dein 😊" });
        break;
      }

      if (isMenu(text)) {
        setStage(STAGE.MENU);
        state = resetState();
        say({ text: `Token *${state.token || ""}* save rakhein! Nayi seva 👇` });
        say(await menuReply());
        break;
      }

      if (text) {
        const gate = await aiFieldGate({
          phone: phoneForAI,
          name: session.name,
          text,
          state: "PAYMENT",
          serviceName: state.serviceName ?? "",
          field: { label: "Payment", question: "Payment karke Paid likhna he" },
          collected: state.collected ?? {},
        });
        if (gate && gate.action === "reply") {
          say({ text: gate.reply });
          say({ text: "Payment ho jaye to *Paid ho gaya* likhein 👇", chips: ["✅ Paid ho gaya", "🔍 Status Check"] });
          break;
        }
        const ai = await aiGeneralChat(phoneForAI, text);
        if (ai) {
          say({ text: ai });
          say({ text: "Payment ho jaye to *Paid ho gaya* likhein 👇", chips: ["✅ Paid ho gaya", "🔍 Status Check"] });
          break;
        }
      }
      say(await beginPayment(svc, state.token, cfg.paymentMode));
      break;
    }

    // ================= DONE =================
    case STAGE.DONE: {
      if (!text) {
        say({ text: "Nayi seva ke liye *Nayi seva* dabayein 👇", chips: ["🆕 Nayi seva", "🔍 Status Check"] });
        break;
      }
      const it = intent!;
      if (isMenu(text) || it.intent === "SERVICE_DISCOVERY" || /nayi|new/i.test(text)) {
        setStage(STAGE.MENU);
        state = resetState();
        say({ text: "Sure! 👇" });
        say(await menuReply());
        break;
      }
      if (it.intent === "APPLICATION_STATUS" || it.intent === "PAYMENT_STATUS" || it.intent === "TOKEN_LOOKUP") {
        if (session.phone) (await customerBriefReply(session.phone, session.customerId, session.name)).forEach(say);
        else say({ text: "Status ke liye application token bhejein (jaise: FB-261006-00021)." });
        break;
      }
      if (it.intent === "START_APPLICATION" && it.serviceCandidate) {
        const services = await getServices();
        const svc = services.find((s) => s.service_id === it.serviceCandidate);
        if (svc) {
          setStage(STAGE.OFFER);
          (await startService(state, svc)).forEach(say);
          break;
        }
      }
      if (it.intent === "OPERATOR_REQUEST") {
        const hs = await createHandoff(session, state, text.slice(0, 200));
        hs.forEach(say);
        break;
      }
      const ai = await aiGeneralChat(phoneForAI, text);
      if (ai) {
        say({ text: ai });
        say({ text: "Aur koi seva chahiye? 👇", chips: ["🆕 Nayi seva", "🔍 Status Check"] });
        break;
      }
      say({ text: cfg.fallbackMessage, chips: ["🆕 Nayi seva", "👩‍💼 Talk to Operator"] });
      break;
    }
  }

  if (!replies.length) {
    replies.push({
      text: "Ek minute… samajh nahi aaya 😅 Dobara try karein, ya *operator* se baat karni ho to likhein.",
      chips: ["🆕 Nayi seva", "👩‍💼 Talk to Operator"],
    });
  }

  return { replies, patch: { stage, ...patchOut, state } };
}

export { STAGE };

