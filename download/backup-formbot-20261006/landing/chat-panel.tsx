"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Send, Bot, User, RefreshCcw } from "lucide-react";

type SvcCard = {
  service_id: string;
  service_name: string;
  category: string;
  description: string;
  total_fee: number;
};

type ChatMsg = {
  role: "bot" | "user";
  text: string;
  chips?: string[];
  cards?: SvcCard[];
  expectFile?: boolean;
  attachment?: { name: string; type: string; size: number; dataUrl?: string };
  at?: string;
};

const SESSION_KEY = "csc_webchat_session_v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "s-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i} className="font-bold">
            {p.slice(1, -1)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

export function ChatPanel() {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initedRef = useRef(false);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, []);

  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    (async () => {
      let sid = "";
      try {
        sid = localStorage.getItem(SESSION_KEY) || "";
      } catch {
        sid = "";
      }
      if (!sid) {
        sid = uuid();
        try {
          localStorage.setItem(SESSION_KEY, sid);
        } catch {
          /* private mode */
        }
      }
      setSessionId(sid);
      try {
        const r = await fetch(`/api/webchat?sessionId=${encodeURIComponent(sid)}`);
        const j = await r.json();
        setCustomerId(j.customerId || "");
        if (j.messages && j.messages.length) {
          setMessages(j.messages);
        } else {
          const r2 = await fetch("/api/webchat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sid }),
          });
          const j2 = await r2.json();
          setMessages(j2.messages || []);
        }
      } catch {
        setMessages([
          {
            role: "bot",
            text: "Network issue lag raha he 🙏 Ek baar *Reload* dabayein.",
            chips: ["🔄 Reload"],
          },
        ]);
      }
      scrollDown();
    })();
  }, [scrollDown]);

  const send = useCallback(
    async (opts: {
      text?: string;
      attachment?: { name: string; type: string; size: number; dataUrl: string };
    }) => {
      if (busy || !sessionId) return;
      const { text, attachment } = opts;
      if (!text && !attachment) return;
      setBusy(true);
      setTyping(true);
      setMessages((m) => [
        ...m,
        attachment
          ? {
              role: "user" as const,
              text: text || `📎 ${attachment.name}`,
              attachment: {
                name: attachment.name,
                type: attachment.type,
                size: attachment.size,
                dataUrl: /^image\//.test(attachment.type) ? attachment.dataUrl : undefined,
              },
            }
          : { role: "user" as const, text: text || "" },
      ]);
      setInput("");
      scrollDown();
      try {
        const r = await fetch("/api/webchat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, text, attachment }),
        });
        const j = await r.json();
        if (j.customerId) setCustomerId(j.customerId);
        const botMsgs: ChatMsg[] = (j.messages || []).filter(
          (m: ChatMsg) => m.role === "bot"
        );
        setMessages((m) => [...m, ...botMsgs]);
      } catch {
        setMessages((m) => [
          ...m,
          { role: "bot", text: "⚠️ Message nahi pahuncha — internet check karke dobara bhejein." },
        ]);
      } finally {
        setBusy(false);
        setTyping(false);
        scrollDown();
      }
    },
    [busy, sessionId, scrollDown]
  );

  const onChip = (chip: string) => {
    if (chip === "🔄 Reload") {
      window.location.reload();
      return;
    }
    if (chip === "✅ Confirm karo") return send({ text: "confirm" });
    if (chip === "📋 Menu wapas" || chip === "🆕 Nayi seva") return send({ text: "menu" });
    if (chip === "✅ Paid ho gaya") return send({ text: "paid" });
    if (chip === "❓ Payment me doubt" || chip === "❓ Sawaal puchhna he")
      return send({ text: "mujhe ek sawal puchhna he" });
    const clean = chip.replace(/^[^\w\u0900-\u097F]+/, "").trim();
    send({ text: clean || chip });
  };

  const onPickFile = () => fileRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "⚠️ File 4MB se chhoti honi chahiye. Photo compress karke bhejein." },
      ]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      send({
        attachment: {
          name: f.name,
          type: f.type || "application/octet-stream",
          size: f.size,
          dataUrl: String(reader.result || ""),
        },
      });
    };
    reader.readAsDataURL(f);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (t) send({ text: t });
  };

  const reset = () => {
    const sid = uuid();
    try {
      localStorage.setItem(SESSION_KEY, sid);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  return (
    <div
      id="chat"
      className="flex h-[600px] flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-xl shadow-emerald-900/5 sm:h-[640px]"
    >
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
          र
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-emerald-600 bg-lime-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">Ravi — CSC Assistant</p>
          <p className="truncate text-[11px] text-emerald-50/90">
            {customerId ? `Aapki ID: ${customerId}` : "Online • turant jawab milta he"}
          </p>
        </div>
        <button
          onClick={reset}
          title="Nayi chat shuru karein"
          className="rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="Nayi chat"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="chat-scroll flex-1 space-y-3 overflow-y-auto bg-emerald-50/40 px-3 py-4">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex items-end justify-end gap-2">
              <div className="max-w-[82%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-sm text-white shadow-sm">
                {m.attachment?.dataUrl ? (
                  <img
                    src={m.attachment.dataUrl}
                    alt={m.attachment.name}
                    className="mb-1 max-h-40 rounded-lg border border-emerald-500/40 object-cover"
                  />
                ) : null}
                {m.attachment && !m.attachment.dataUrl ? (
                  <p className="mb-0.5 flex items-center gap-1 text-xs text-emerald-100">
                    <Paperclip className="h-3 w-3" /> {m.attachment.name}
                  </p>
                ) : null}
                <RichText text={m.text} />
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-emerald-800">
                <User className="h-3.5 w-3.5" />
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 max-w-[86%] space-y-2">
                <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                  <RichText text={m.text} />
                </div>
                {m.cards && m.cards.length > 0 ? (
                  <div className="chat-scroll grid max-h-72 grid-cols-1 gap-2 overflow-y-auto rounded-xl p-0.5 sm:grid-cols-2">
                    {m.cards.map((c) => (
                      <button
                        key={c.service_id}
                        onClick={() => send({ text: c.service_name })}
                        className="group rounded-xl border border-emerald-100 bg-white p-2.5 text-left transition hover:border-emerald-400 hover:shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-bold text-slate-800 group-hover:text-emerald-700">
                            {c.service_name}
                          </p>
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            ₹{c.total_fee}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                          {c.description || c.category}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : null}
                {m.chips && m.chips.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {m.chips.map((c, k) => (
                      <button
                        key={k}
                        onClick={() => onChip(c)}
                        className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )
        )}
        {typing ? (
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-3.5 py-3 shadow-sm">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:300ms]" />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-emerald-100 bg-white px-3 py-2.5"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onFile}
        />
        <button
          type="button"
          onClick={onPickFile}
          disabled={busy}
          title="Photo/PDF bhejein"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40"
          aria-label="Document attach karein"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message likhein… (jaise: PAN card chahiye)"
          className="h-10 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-emerald-400 focus:bg-white"
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-40"
          aria-label="Bhejein"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
