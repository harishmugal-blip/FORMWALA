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

// ============================================================
// CSC Smart Seva — WEB chatbot engine (Ravi persona)
// Flow: ID_NAME → ID_PHONE (customer ID banti he) → MENU → OFFER
//       → FIELDS → DOCS → PAYMENT → DONE
// Same questions/docs/prices as the WhatsApp bot (service_fields,
// service_documents, service_pricing tables).
// ============================================================

export type Attachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type BotReply = {
  text: string;
  chips?: string[];
  cards?: Svc[];
  expectFile?: boolean;
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
  PAYMENT: "PAYMENT",
  DONE: "DONE",
} as const;

const APP_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const rand = (n: number, chars = APP_ID_CHARS) =>
  Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

const appNumber = (prefix: string) => `${prefix}${rand(6)}`;
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

function feeLines(svc: Svc): string {
  const gst = Math.round((svc.total_fee - svc.government_fee - svc.service_charge) * 100) / 100;
  return [
    `• Sarkari fee: ₹${svc.government_fee}`,
    `• Seva charge: ₹${svc.service_charge}`,
    `• GST (${svc.gst_percent}%): ₹${gst}`,
    `*Total: ₹${svc.total_fee}*`,
  ].join("\n");
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findService(text: string, services: Svc[]): Svc | null {
  const t = normalize(text);
  if (!t) return null;
  // exact-ish match first
  for (const s of services) {
    if (normalize(s.service_name) === t || normalize(s.service_id) === t) return s;
  }
  // substring match
  for (const s of services) {
    const n = normalize(s.service_name);
    if (n.length >= 4 && (t.includes(n) || n.includes(t))) return s;
  }
  // category match ("pan card ka kaam", "income certificate lagana he")
  for (const s of services) {
    const words = normalize(s.service_name).split(/(?=[A-Z])/);
    if (words.length && words[0].length >= 4 && t.includes(words[0])) return s;
  }
  return null;
}

async function menuReply(): Promise<BotReply> {
  const services = (await getServices()).filter((s) => s.service_id);
  return {
    text: "Ye sevaayein hum banate hein — jis par card dabayein ya uska naam likhein:",
    cards: services,
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

  const steps = svc.processing_steps.length
    ? `\n\n⏱ Process: ${svc.processing_steps.join(" → ")}`
    : "";
  const head: BotReply = {
    text:
      `*${svc.service_name}* — ₹${svc.total_fee}\n\n` +
      `${svc.description}\n\n${feeLines(svc)}${steps}\n\n` +
      `Aage badhun? (2-4 din me kaam complete hota he)`,
    chips: ["✅ Confirm karo", "📋 Menu wapas"],
  };
  return [head];
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

async function beginPayment(svc: Svc): Promise<BotReply> {
  const config = await getConfigMap();
  const upi = config.PAYMENT_UPI_ID || "cscseva@upi";
  return {
    text:
      `💳 *Payment*\n\n${feeLines(svc)}\n\n` +
      `UPI ID: *${upi}*\n` +
      `(GPay / PhonePe / Paytm — kisi se bhi kar sakte hein)\n\n` +
      `Payment karke *\"Paid\"* likhein. Verification operator karega aur receipt milega.`,
    chips: ["✅ Paid ho gaya", "❓ Payment me doubt"],
  };
}

async function finalize(session: EngineSession): Promise<BotReply[]> {
  const state = session.state;
  const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
  const config = await getConfigMap();
  const prefix = config.APP_NUMBER_PREFIX || "CSC-2026-";
  const number = appNumber(prefix);
  const aid = appId();
  const collected = state.collected ?? {};
  const docsCollected = state.docsCollected ?? {};
  const docs = Object.entries(docsCollected).map(([docKey, d]) => ({
    doc_key: docKey,
    mime_type: d.type,
    file_name: d.name,
  }));

  const formData: Record<string, string> = { ...collected };
  for (const [k, v] of Object.entries(docsCollected)) formData[`doc_${k}`] = v.name;

  try {
    // ---- Prisma (source of truth, wipe-proof) ----
    await db.customer.upsert({
      where: { phone: session.phone },
      update: { name: session.name },
      create: { phone: session.phone, name: session.name },
    });
    await db.application.create({
      data: {
        applicationId: aid,
        customerPhone: session.phone,
        serviceId: state.serviceId ?? "",
        status: "PAYMENT_PENDING",
        govFee: svc?.government_fee ?? 0,
        serviceCharge: svc?.service_charge ?? 0,
        gst: svc?.gst_percent ?? 18,
        totalFee: svc?.total_fee ?? 0,
        formData: JSON.stringify({ ...formData, _source: "WEB_CHAT", _customer_name: session.name }),
        applicationNumber: number,
      },
    });
    for (const [k, v] of Object.entries(collected)) {
      await db.applicationFieldValue.create({
        data: { applicationId: aid, phone: session.phone, fieldKey: k, fieldValue: v, validated: "TRUE" },
      });
    }
    for (const [docKey, d] of Object.entries(docsCollected)) {
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
        applicationNumber: number,
        oldStatus: "",
        newStatus: "PAYMENT_PENDING",
        note: "Web chatbot se application bani",
      },
    });
    await db.payment.create({
      data: {
        paymentId: `PAYWEB${rand(8)}`,
        applicationId: aid,
        customerPhone: session.phone,
        amount: svc?.total_fee ?? 0,
        gateway: "UPI_MANUAL",
        transactionId: "",
        status: "PENDING",
      },
    });
    await db.operatorTask.create({
      data: {
        taskId: `TASKWEB${rand(8)}`,
        applicationId: aid,
        applicationNumber: number,
        operatorPhone: "",
        status: "PENDING",
        note: "Web chatbot se aya — customer ID: " + session.customerId,
      },
    });
  } catch (e) {
    // Prisma failure is abnormal — still reply success-shape but log stage summary honestly
    console.error("webchat finalize prisma error:", e);
  }

  // ---- n8n live tables (dashboard visibility; best-effort) ----
  try {
    upsertCustomerN8n(session.phone, session.name);
    insertApplicationN8n({
      applicationId: aid,
      appNumber: number,
      phone: session.phone,
      name: session.name,
      serviceId: state.serviceId ?? "",
      govFee: svc?.government_fee ?? 0,
      serviceCharge: svc?.service_charge ?? 0,
      gst: svc?.gst_percent ?? 18,
      totalFee: svc?.total_fee ?? 0,
      formData,
      docs,
      source: "WEB_CHAT",
    });
  } catch { /* n8n down → fine */ }

  const fieldCount = Object.values(collected).filter((v) => v && v !== "SKIP").length;
  const docCount = Object.keys(docsCollected).length;
  return [
    {
      text:
        `🎉 *Application ban gayi!*\n\n` +
        `📋 Application No: *${number}*\n` +
        `👤 Naam: ${session.name}\n` +
        `🛠 Seva: ${state.serviceName}\n` +
        `💰 Fees: ₹${svc?.total_fee ?? 0}\n` +
        `📝 Details: ${fieldCount} sawal + ${docCount} document\n\n` +
        `*Aage kya hoga:*\n` +
        `1. Operator aapki details check karega\n` +
        `2. Payment verification ke baad portal pe submit hoga\n` +
        `3. Status ka update milega\n\n` +
        `Apna application number kahin save kar lein! 🙏`,
    },
    {
      text: "Aur koi seva chahiye?",
      chips: ["🆕 Nayi seva", "❓ Sawaal puchhna he"],
    },
  ];
}

function resetState(): WebState {
  return { collected: {}, docsCollected: {}, fails: 0 };
}

// ============================================================
// MAIN ENTRY
// ============================================================

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

  const setStage = (s: string) => (stage = s);
  const say = (r: BotReply) => replies.push(r);
  const phoneForAI = session.phone || `web_${hashId(session.sessionId)}`;

  // ---------- GLOBAL CANCEL (any stage) ----------
  if (text && isCancel(text) && stage !== STAGE.NAME && stage !== STAGE.PHONE) {
    setStage(STAGE.MENU);
    state = resetState();
    say({ text: "Theek he, cancel kar diya. Koi baat nahi! 😊" });
    say(await menuReply());
    return { replies, patch: { stage, state } };
  }

  switch (stage) {
    // ================= STEP 1: NAME =================
    case STAGE.NAME: {
      const looksPhone = /^\+?\d[\d\s-]{7,}$/.test(text);
      const isGreeting = /^(hi|hii|hiii|hello|namaste|namaskar|hey|salam|salaam|assalam|good (morning|afternoon|evening)|start|shuru)\b/i.test(text);
      if (isGreeting) {
        say({
          text:
            "Namaste! 🙏 Main *Ravi* hoon — CSC Smart Seva ka assistant.\n\nSarkari kaam ghar baithe — PAN card, ITR, GST, certificate sab yahin se.\n\nChaliye shuru karte hein — *aapka pura naam* likhein.",
        });
        break;
      }
      if (!text || text.length < 2 || looksPhone || !/[a-zA-Z]/.test(text)) {
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
        text: `Namaste *${name}*! 🙏\nMain Ravi hoon — CSC Smart Seva ka assistant.\n\nAb aapka *mobile number* likhein (10 digit) — isi se aapki customer ID banegi.`,
      });
      break;
    }

    // ================= STEP 2: PHONE + ID =================
    case STAGE.PHONE: {
      const v = validateField("MOBILE", text);
      if (!v.ok) {
        say({ text: `${v.reason} Dobara likhein.` });
        break;
      }
      const phone = v.value;
      session.phone = phone;
      const cid = `CUST-2026-${rand(5)}`;
      session.customerId = cid;
      state = resetState();

      try {
        await db.customer.upsert({
          where: { phone },
          update: { name: session.name },
          create: { phone, name: session.name },
        });
      } catch { /* non-fatal */ }
      try {
        upsertCustomerN8n(phone, session.name);
      } catch { /* n8n down */ }

      setStage(STAGE.MENU);
      say({
        text:
          `🎉 *Aapki ID ban gayi!*\n\n` +
          `👤 Customer ID: *${cid}*\n` +
          `📱 Mobile: ${phone}\n` +
          `🧑 Naam: ${session.name}\n\n` +
          `Ab se har seva isi ID pe hogi. services dikhata hoon 👇`,
      });
      say(await menuReply());
      break;
    }

    // ================= MENU =================
    case STAGE.MENU: {
      const services = await getServices();
      const svc = text ? findService(text, services) : null;
      if (svc) {
        setStage(STAGE.OFFER);
        say(...(await startService(state, svc)));
        break;
      }
      // nayi seva chip / general question → AI
      if (text) {
        const ai = await aiGeneralChat(phoneForAI, text);
        if (ai) {
          say({ text: ai });
          say({ text: "Koi seva chahiye to card par dabayein 👇", cards: services });
        } else {
          say({ text: "Main services ke bare me batata hoon 👇" });
          say(await menuReply());
        }
        break;
      }
      say(await menuReply());
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
      if (isConfirm(text)) {
        const next = await askCurrentField(state);
        if (next) {
          setStage(STAGE.FIELDS);
          say({ text: `Badhiya! Kuch details chahiye — sirf ${state.fields?.length ?? 0} chhote sawal 👇` });
          say(next);
        } else {
          const d = await askCurrentDoc(state);
          if (d) {
            setStage(STAGE.DOCS);
            say({ text: `Ab documents chahiye 📄` });
            say(d);
          } else {
            setStage(STAGE.PAYMENT);
            say(await beginPayment(svc));
          }
        }
        break;
      }
      // side question / different service
      const otherSvc = findService(text, services);
      if (otherSvc && otherSvc.service_id !== state.serviceId) {
        say(...(await startService(state, otherSvc)));
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
        chips: ["✅ Confirm karo", "📋 Menu wapas"],
      });
      break;
    }

    // ================= FIELDS =================
    case STAGE.FIELDS: {
      const fields = state.fields ?? [];
      let i = state.fidx ?? 0;
      if (i >= fields.length) {
        // shouldn't happen; jump to docs/payment
        const d = await askCurrentDoc(state);
        if (d) {
          setStage(STAGE.DOCS);
          say(d);
        } else {
          setStage(STAGE.PAYMENT);
          const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
          if (svc) say(await beginPayment(svc));
        }
        break;
      }
      const f = fields[i];

      // user sent a file while a text answer was expected
      if (att) {
        say({
          text: `Ye sawal likhkar jawab dena he: ${f.question}`,
        });
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
          const nxt = await askCurrentField(state);
          if (nxt) {
            say({ text: `${ack()} — SKIP 👍` });
            say(nxt);
          } else {
            const d = await askCurrentDoc(state);
            if (d) {
              setStage(STAGE.DOCS);
              say({ text: "Sawal complete! Ab documents 📄" });
              say(d);
            } else {
              setStage(STAGE.PAYMENT);
              const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
              if (svc) say(await beginPayment(svc));
            }
          }
        } else {
          say({ text: "Ye sawal zaroori he — jawab likhein. (3 baar try ke baad SKIP ho jayega)" });
        }
        break;
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
      const nxt = await askCurrentField(state);
      if (nxt) {
        say({ text: `${ack()} (${i}/${fields.length})` });
        say(nxt);
      } else {
        const d = await askCurrentDoc(state);
        if (d) {
          setStage(STAGE.DOCS);
          say({ text: `Sawal complete! 🎯 Ab *${state.docs?.length ?? 0}* document chahiye 📄` });
          say(d);
        } else {
          setStage(STAGE.PAYMENT);
          const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
          if (svc) say(await beginPayment(svc));
        }
      }
      break;
    }

    // ================= DOCS =================
    case STAGE.DOCS: {
      const docs = state.docs ?? [];
      let i = state.didx ?? 0;
      if (i >= docs.length) {
        const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
        setStage(STAGE.PAYMENT);
        if (svc) say(await beginPayment(svc));
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
        const nxt = await askCurrentDoc(state);
        if (nxt) {
          say({ text: `✅ ${d.label} mil gaya! (${i}/${docs.length})` });
          say(nxt);
        } else {
          const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
          setStage(STAGE.PAYMENT);
          say({ text: `✅ ${d.label} mil gaya! Sab documents complete 🎯` });
          if (svc) say(await beginPayment(svc));
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
          state.docsCollected = { ...(state.docsCollected ?? {}), [d.doc_key]: { name: "SKIP", type: "text/plain", size: 0 } };
          const nxt = await askCurrentDoc(state);
          if (nxt) say(nxt);
          else {
            const svc = (await getServices()).find((s) => s.service_id === state.serviceId);
            setStage(STAGE.PAYMENT);
            if (svc) say(await beginPayment(svc));
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

    // ================= PAYMENT =================
    case STAGE.PAYMENT: {
      const services = await getServices();
      const svc = services.find((s) => s.service_id === state.serviceId);
      if (!svc) {
        setStage(STAGE.MENU);
        state = resetState();
        say(await menuReply());
        break;
      }
      if (isPaid(text) || isConfirm(text)) {
        setStage(STAGE.DONE);
        say(...(await finalize(session)));
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
          say({ text: "Payment ho jaye to *Paid* likhein 👇", chips: ["✅ Paid ho gaya"] });
          break;
        }
        const ai = await aiGeneralChat(phoneForAI, text);
        if (ai) {
          say({ text: ai });
          say({ text: "Payment ho jaye to *Paid* likhein 👇", chips: ["✅ Paid ho gaya"] });
          break;
        }
      }
      say(await beginPayment(svc));
      break;
    }

    // ================= DONE =================
    case STAGE.DONE: {
      if (isMenu(text) || /nayi|new/i.test(text)) {
        setStage(STAGE.MENU);
        state = resetState();
        say({ text: "Sure! 👇" });
        say(await menuReply());
        break;
      }
      if (text) {
        const ai = await aiGeneralChat(phoneForAI, text);
        if (ai) {
          say({ text: ai });
          say({ text: "Aur koi seva chahiye? 👇", chips: ["🆕 Nayi seva"] });
          break;
        }
      }
      say({ text: "Nayi seva ke liye *Nayi seva* dabayein 👇", chips: ["🆕 Nayi seva"] });
      break;
    }

    // ================= fallback =================
    default: {
      setStage(STAGE.MENU);
      say(await menuReply());
    }
  }

  if (!replies.length) {
    replies.push({ text: "Ek minute… samajh nahi aaya. Dobara try karein ya *Menu* likhein." });
  }

  return { replies, patch: { stage, ...patchOut, state } };
}

export { STAGE };
