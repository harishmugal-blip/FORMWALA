import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processInput, type EngineSession, type Attachment } from "@/lib/webchat-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WELCOME =
  "Namaste! 🙏 Main *Ravi* hoon — CSC Smart Seva ka assistant.\n\n" +
  "Sarkari kaam ghar baithe: PAN card, ITR, GST, income/caste certificate, " +
  "Ayushman card aur bhi 14+ sevaayein.\n\n" +
  "Chaliye shuru karte hein — *aapka pura naam* likhein? 😊";

type MsgOut = {
  role: "bot" | "user";
  text: string;
  chips?: string[];
  cards?: unknown[];
  expectFile?: boolean;
  attachment?: { name: string; type: string; size: number; dataUrl: string };
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
      cards: meta.cards,
      expectFile: Boolean(meta.expectFile),
      attachment: meta.attachment as MsgOut["attachment"],
      at: r.createdAt.toISOString(),
    };
  });
  return NextResponse.json({
    exists: Boolean(session),
    stage: session?.stage ?? "ID_NAME",
    customerId: session?.customerId ?? "",
    name: session?.name ?? "",
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

  const session = await loadSession(sessionId);
  const out: MsgOut[] = [];

  if (!session) {
    await db.webChatSession.create({
      data: { sessionId, stage: "ID_NAME" },
    });
    out.push({ role: "bot", text: WELCOME, at: new Date().toISOString() });
    await saveMessages(sessionId, out);
    return NextResponse.json({
      stage: "ID_NAME",
      customerId: "",
      name: "",
      messages: out,
    });
  }

  if (att) {
    await db.webChatMessage.create({
      data: {
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
      data: { sessionId, role: "user", text, meta: "{}" },
    });
    out.push({ role: "user", text, at: new Date().toISOString() });
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
      at: new Date().toISOString(),
    });
  }
  await saveMessages(sessionId, out);

  return NextResponse.json({
    stage: result.patch.stage ?? session.stage,
    customerId: session.customerId,
    name: session.name,
    messages: out,
  });
}
