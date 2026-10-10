import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { processInput, type EngineSession, type Attachment } from "@/lib/webchat-engine";
import { getChatbotConfig } from "@/lib/fb-config";
import { trackEvent } from "@/lib/chat-analytics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MsgOut = {
  role: "bot" | "user";
  text: string;
  chips?: string[];
  cards?: unknown[];
  expectFile?: boolean;
  card?: unknown;
  attachment?: { name: string; type: string; size: number; dataUrl?: string };
  at: string;
};

async function loadSession(sessionId: string) {
  const row = await db.webChatSession.findUnique({ where: { sessionId } });
  if (row) {
    let state = {};
    try {
      state = JSON.parse(row.state || "{}");
    } catch {
      state = {};
    }
    return {
      sessionId: row.sessionId,
      stage: row.stage,
      customerId: row.customerId,
      name: row.name,
      phone: row.phone,
      state,
    } as EngineSession;
  }
  return null;
}

async function saveMessages(sessionId: string, msgs: MsgOut[]) {
  for (const m of msgs) {
    await db.webChatMessage.create({
      data: {
        sessionId,
        role: m.role,
        text: m.text,
        meta: JSON.stringify({
          chips: m.chips,
          cards: m.cards,
          expectFile: m.expectFile,
          card: m.card,
          attachment: m.attachment,
        }),
      },
    });
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") || "";
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  const session = await loadSession(sessionId);
  const rows = await db.webChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const messages: MsgOut[] = rows.map((r) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(r.meta || "{}");
    } catch {
      meta = {};
    }
    return {
      role: r.role as "bot" | "user",
      text: r.text,
      chips: (meta.chips as string[]) ?? undefined,
      cards: (meta.cards as unknown[]) ?? undefined,
      expectFile: Boolean(meta.expectFile),
      card: meta.card,
      attachment: meta.attachment as MsgOut["attachment"],
      at: r.createdAt.toISOString(),
    };
  });

  // resume hint: adhura application he to UI continue chip dikhaye
  let resumeAvailable = false;
  if (session?.state) {
    const st = session.state as { serviceId?: string; fields?: unknown[]; fidx?: number; docs?: unknown[]; didx?: number };
    if (st.serviceId) {
      const fieldsDone = st.fields ? (st.fidx ?? 0) >= st.fields.length : false;
      const docsDone = st.docs ? (st.didx ?? 0) >= st.docs.length : false;
      resumeAvailable = !(fieldsDone && docsDone);
    }
  }

  return NextResponse.json({
    exists: Boolean(session),
    stage: session?.stage ?? "ID_NAME",
    customerId: session?.customerId ?? "",
    name: session?.name ?? "",
    resumeAvailable,
    messages,
  });
}

export async function POST(req: NextRequest) {
  let body: { sessionId?: string; text?: string; attachment?: Attachment };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const sessionId = String(body.sessionId || "").slice(0, 64);
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const text = String(body.text ?? "").slice(0, 2000);
  const att = body.attachment;
  const cfg = await getChatbotConfig();

  // basic rate limit: max 45 msgs / min per session (form filling can be chatty)
  const recent = await db.webChatMessage.count({
    where: {
      sessionId,
      role: "user",
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
  });
  if (recent > 90) {
    return NextResponse.json({
      stage: "RATE_LIMITED",
      customerId: "",
      name: "",
      messages: [
        {
          role: "bot",
          text: "Thoda slow karein please 🙏 Ek minute me try karein.",
          at: new Date().toISOString(),
        },
      ] as MsgOut[],
    });
  }

  // ---- dedup: same message 5s ke andar dobara? (spec #27) ----
  const msgHash = createHash("sha256")
    .update(`${text}|${att?.name ?? ""}|${att?.size ?? 0}`)
    .digest("hex")
    .slice(0, 32);
  const session = await loadSession(sessionId);

  const returnDuplicate = async (): Promise<NextResponse> => {
    // duplicate click / double execution — pichhla bot reply wapas bhejo (no double job)
    const rows = await db.webChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    const dupBot: MsgOut[] = [];
    let seenUser = false;
    for (const r of rows) {
      if (r.role === "user") {
        seenUser = true;
        continue;
      }
      if (seenUser) {
        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(r.meta || "{}");
        } catch {
          meta = {};
        }
        dupBot.unshift({
          role: "bot",
          text: r.text,
          chips: (meta.chips as string[]) ?? undefined,
          cards: (meta.cards as unknown[]) ?? undefined,
          expectFile: Boolean(meta.expectFile),
          card: meta.card,
          at: r.createdAt.toISOString(),
        });
      }
      if (dupBot.length >= 3) break;
    }
    return NextResponse.json({
      stage: session?.stage ?? "ID_NAME",
      customerId: session?.customerId ?? "",
      name: session?.name ?? "",
      duplicate: true,
      messages: dupBot,
    });
  };

  let out: MsgOut[] = [];

  if (!session) {
    await db.webChatSession.create({
      data: { sessionId, stage: "ID_NAME", tenantId: "TENANT_CSC_001", lastMsgHash: msgHash, lastMsgAt: new Date() },
    });
    out.push({ role: "bot", text: cfg.welcomeMessage, at: new Date().toISOString() });
    out.push({
      role: "bot",
      text: "Chaliye pehle aapki ID banate hein — *aapka pura naam* ya *10-digit mobile number* likhein. 😊",
      chips: ["🆕 Naya Customer", "📱 Purana Customer", ...cfg.quickActions.slice(0, 2)],
      at: new Date().toISOString(),
    });
    await saveMessages(sessionId, out);
    await trackEvent({ sessionId, eventType: "CONVERSATION_STARTED" });
    return NextResponse.json({
      stage: "ID_NAME",
      customerId: "",
      name: "",
      messages: out,
    });
  }

  // ---- ATOMIC dedup claim (double-execution safe) ----
  // Sirf pehla execution claim jeet-ta he; doosra duplicate path jata he.
  if (text || att) {
    const claim = await db.webChatSession.updateMany({
      where: {
        sessionId,
        OR: [
          { lastMsgHash: { not: msgHash } },
          { lastMsgAt: null },
          { lastMsgAt: { lt: new Date(Date.now() - 5000) } },
        ],
      },
      data: { lastMsgHash: msgHash, lastMsgAt: new Date() },
    });
    if (claim.count === 0) {
      return await returnDuplicate();
    }
  }

  // ---- idempotent user-message insert (double-execution safe) ----
  // Deterministic id: same session + same message + same 5s bucket = same row.
  // Doosra execution unique-constraint fail (P2002) se duplicate path me jaata he.
  const bucket = Math.floor(Date.now() / 5000);
  const userMsgId = createHash("sha256")
    .update(`${sessionId}|${msgHash}|${bucket}`)
    .digest("hex")
    .slice(0, 32);
  try {
    if (att) {
      await db.webChatMessage.create({
        data: {
          id: userMsgId,
          sessionId,
          role: "user",
          text: text || `📎 ${att.name}`,
          meta: JSON.stringify({
            attachment: { name: att.name, type: att.type, size: att.size },
          }),
        },
      });
      out.push({
        role: "user",
        text: text || `📎 ${att.name}`,
        attachment: { name: att.name, type: att.type, size: att.size },
        at: new Date().toISOString(),
      });
    } else if (text) {
      await db.webChatMessage.create({
        data: { id: userMsgId, sessionId, role: "user", text, meta: "{}" },
      });
      out.push({ role: "user", text, at: new Date().toISOString() });
    }
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return await returnDuplicate();
    }
    throw e;
  }

  const result = await processInput(session, { text, attachment: att });

  await db.webChatSession.update({
    where: { sessionId },
    data: {
      stage: result.patch.stage ?? session.stage,
      name: result.patch.name ?? session.name,
      phone: result.patch.phone ?? session.phone,
      customerId: result.patch.customerId ?? session.customerId,
      state: JSON.stringify(result.patch.state ?? session.state ?? {}),
    },
  });

  for (const r of result.replies) {
    out.push({
      role: "bot",
      text: r.text,
      chips: r.chips,
      cards: r.cards,
      expectFile: r.expectFile,
      card: r.card,
      at: new Date().toISOString(),
    });
  }
  // user message already explicitly inserted (deterministic id) — sirf bot replies save karo
  await saveMessages(sessionId, out.filter((m) => m.role === "bot"));

  return NextResponse.json({
    stage: result.patch.stage ?? session.stage,
    customerId: result.patch.customerId ?? session.customerId,
    name: result.patch.name ?? session.name,
    messages: out,
  });
}
