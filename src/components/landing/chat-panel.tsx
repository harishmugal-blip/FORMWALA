"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Send,
  Bot,
  User,
  RefreshCcw,
  X,
  FileText,
  BadgeCheck,
  Clock,
  Wallet,
  Headset,
} from "lucide-react";

type SvcCard = {
  service_id: string;
  service_name: string;
  category: string;
  description: string;
  total_fee: number;
};

type CardData = {
  type: "summary" | "status" | "token" | "payment" | "handoff" | "docs_list" | "human_action";
  // summary
  service?: string;
  applicant?: string;
  fields?: { label: string; value: string }[];
  docs?: { label: string; done: boolean; required: boolean }[];
  fees?: { gov: number; service: number; gst: number; total: number };
  // status
  token?: string;
  status?: string;
  emoji?: string;
  label?: string;
  note?: string;
  timeline?: { label: string; at: string }[];
  // payment
  total?: number;
  gov?: number;
  serviceFee?: number;
  gst?: number;
  upi?: string;
  mode?: string;
  instructions?: string;
  // docs_list — docs reuse karta he
  // handoff / human_action — note reuse karta he
};

type ChatMsg = {
  role: "bot" | "user";
  text: string;
  chips?: string[];
  cards?: SvcCard[];
  expectFile?: boolean;
  card?: CardData;
  attachment?: { name: string; type: string; size: number; dataUrl?: string };
  at?: string;
};

type WidgetConfig = {
  businessName: string;
  assistantName: string;
  tagline: string;
  quickActions: string[];
  businessHours: string;
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

// ---------- structured cards (spec #28) ----------

function SummaryCard({ card }: { card: CardData }) {
  const f = card.fees ?? { gov: 0, service: 0, gst: 0, total: 0 };
  return (
    <div className="w-full overflow-hidden rounded-xl border border-emerald-200 bg-white">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-50">Application Summary</p>
        <p className="text-sm font-extrabold text-white">{card.service}</p>
      </div>
      <div className="divide-y divide-slate-100">
        <div className="flex items-center justify-between px-3.5 py-2">
          <span className="text-[11px] font-semibold text-slate-500">Applicant</span>
          <span className="text-xs font-bold text-slate-800">{card.applicant}</span>
        </div>
        {(card.fields ?? []).map((fl, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-1.5">
            <span className="shrink-0 text-[11px] font-semibold text-slate-500">{fl.label}</span>
            <span className="truncate text-right text-xs font-bold text-slate-800">{fl.value}</span>
          </div>
        ))}
        <div className="px-3.5 py-2">
          <p className="mb-1 text-[11px] font-semibold text-slate-500">Documents</p>
          <div className="flex flex-wrap gap-1.5">
            {(card.docs ?? []).map((d, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  d.done ? "bg-emerald-50 text-emerald-700" : d.required ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {d.done ? "✓" : d.required ? "• pending" : "○ optional"} {d.label}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-0.5 bg-slate-50/70 px-3.5 py-2 text-[11px]">
          <div className="flex justify-between"><span className="text-slate-500">Service Fee</span><span className="font-bold text-slate-700">₹{f.service}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Government Fee</span><span className="font-bold text-slate-700">₹{f.gov}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="font-bold text-slate-700">₹{f.gst}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1"><span className="font-bold text-slate-700">Total</span><span className="text-sm font-extrabold text-emerald-700">₹{f.total}</span></div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ card }: { card: CardData }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-emerald-200 bg-white">
      <div className="border-b border-slate-100 px-3.5 py-2">
        <p className="font-mono text-[11px] font-bold text-slate-500">{card.token}</p>
        <p className="text-sm font-extrabold text-slate-800">{card.service}</p>
      </div>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span className="text-2xl">{card.emoji}</span>
        <div>
          <p className="text-sm font-extrabold text-slate-900">{card.label}</p>
          <p className="whitespace-pre-line text-[11px] leading-snug text-slate-500">{card.note}</p>
        </div>
      </div>
      {card.timeline && card.timeline.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Timeline</p>
          <div className="space-y-0.5">
            {card.timeline.map((t, i) => (
              <p key={i} className="text-[11px] text-slate-600">
                {t.label}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TokenCard({ card }: { card: CardData }) {
  return (
    <div className="w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-3 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
        <BadgeCheck className="h-3 w-3" /> Application Token
      </p>
      <p className="mt-1 font-mono text-lg font-extrabold tracking-wide text-emerald-800">{card.token}</p>
      <p className="text-[10px] text-slate-500">{card.service} • save kar lein, isi se status milega</p>
    </div>
  );
}

function PaymentCard({ card }: { card: CardData }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-emerald-200 bg-white">
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3.5 py-2">
        <Wallet className="h-3.5 w-3.5 text-emerald-600" />
        <p className="text-xs font-bold text-slate-700">Payment</p>
        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">
          {card.mode === "LIVE" ? "SECURE LINK" : "UPI + OPERATOR VERIFY"}
        </span>
      </div>
      <div className="space-y-0.5 px-3.5 py-2 text-[11px]">
        <div className="flex justify-between"><span className="text-slate-500">Service Fee</span><span className="font-bold text-slate-700">₹{card.serviceFee}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Government Fee</span><span className="font-bold text-slate-700">₹{card.gov}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="font-bold text-slate-700">₹{card.gst}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1"><span className="font-bold text-slate-700">Total</span><span className="text-sm font-extrabold text-emerald-700">₹{card.total}</span></div>
      </div>
      {card.upi ? (
        <div className="border-t border-slate-100 bg-emerald-50/50 px-3.5 py-2">
          <p className="text-[10px] font-semibold text-slate-500">UPI ID</p>
          <p className="font-mono text-xs font-extrabold text-emerald-800">{card.upi}</p>
        </div>
      ) : null}
      <p className="border-t border-slate-100 px-3.5 py-1.5 text-[10px] leading-snug text-slate-400">
        {card.instructions}
      </p>
    </div>
  );
}

function DocsListCard({ card }: { card: CardData }) {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1 text-xs font-extrabold text-slate-800">
        <FileText className="h-3.5 w-3.5 text-emerald-600" /> {card.service} — Documents
      </p>
      <div className="mt-2 space-y-1">
        {(card.docs ?? []).map((d, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
            <span className="text-[11px] font-semibold text-slate-700">📄 {d.label}</span>
            <span className={`text-[9px] font-extrabold uppercase ${d.required ? "text-emerald-600" : "text-slate-400"}`}>
              {d.done ? "✓ mil gaya" : d.required ? "required" : "optional"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HandoffCard({ card }: { card: CardData }) {
  return (
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50/70 p-3">
      <p className="flex items-center gap-1 text-xs font-extrabold text-amber-800">
        <Headset className="h-3.5 w-3.5" /> Operator connected
      </p>
      <p className="mt-1 text-[11px] leading-snug text-amber-700">{card.note || "Aapki request operator ko bhej di gayi he."}</p>
    </div>
  );
}

function BotCard({ card }: { card: CardData }) {
  switch (card.type) {
    case "summary": return <SummaryCard card={card} />;
    case "status": return <StatusCard card={card} />;
    case "token": return <TokenCard card={card} />;
    case "payment": return <PaymentCard card={card} />;
    case "docs_list": return <DocsListCard card={card} />;
    case "handoff": return <HandoffCard card={card} />;
    case "human_action": return <HandoffCard card={card} />;
    default: return null;
  }
}

// chip click → engine ke expected canonical text
function chipToText(chip: string): string {
  const map: [RegExp, string][] = [
    [/confirm application|confirm karo|^✅ confirm/i, "confirm"],
    [/edit information|^✏️/i, "edit"],
    [/paid ho gaya|^✅ paid/i, "paid ho gaya"],
    [/payment help|payment me doubt/i, "payment help"],
    [/status check|apni application/i, "application status"],
    [/talk to operator/i, "operator se baat karni he"],
    [/nayi seva|menu wapas|^📋 menu/i, "menu"],
    [/sawaal puchhna/i, "mujhe ek sawal puchhna he"],
    [/^reload$/i, "reload"],
  ];
  for (const [re, txt] of map) if (re.test(chip)) return txt;
  return chip.replace(/^[^\w\u0900-\u097F]+/, "").trim() || chip;
}

const QUICK_ICON: Record<string, typeof Bot> = {
  apply: FileText,
  status: Clock,
  documents: FileText,
  payment: Wallet,
  operator: Headset,
};

function quickIconFor(a: string) {
  const l = a.toLowerCase();
  if (l.includes("apply")) return QUICK_ICON.apply;
  if (l.includes("status")) return QUICK_ICON.status;
  if (l.includes("document")) return QUICK_ICON.documents;
  if (l.includes("payment")) return QUICK_ICON.payment;
  if (l.includes("operator")) return QUICK_ICON.operator;
  return FileText;
}

function quickTextFor(a: string): string {
  const l = a.toLowerCase();
  if (l.includes("apply")) return "menu";
  if (l.includes("status")) return "application status";
  if (l.includes("document")) return "required documents";
  if (l.includes("payment")) return "payment help";
  if (l.includes("operator")) return "operator se baat karni he";
  return a;
}

// ============================================================
// ChatWidget — floating panel (desktop bottom-right / mobile full)
// ============================================================

export function ChatWidget({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [wcfg, setWcfg] = useState<WidgetConfig>({
    businessName: "FormBot",
    assistantName: "FormBot Assistant",
    tagline: "AI Service Assistant",
    quickActions: [
      "Apply for a Service",
      "Check Application Status",
      "Required Documents",
      "Payment Help",
      "Talk to Operator",
    ],
    businessHours: "Chat 24×7 • Operator 10AM-7PM",
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, []);

  // init: session restore + config
  useEffect(() => {
    if (!open || initedRef.current) return;
    initedRef.current = true;
    (async () => {
      try {
        const rc = await fetch("/api/chat-config");
        if (rc.ok) {
          const c = await rc.json();
          setWcfg((w) => ({ ...w, ...c }));
        }
      } catch {
        /* defaults */
      }
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
  }, [open, scrollDown]);

  // external open events (landing CTA / service card click)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text?: string } | undefined;
      if (detail?.text) {
        // wait for session init then send
        const t = setInterval(() => {
          if (sessionId) {
            clearInterval(t);
            send({ text: detail.text! });
          }
        }, 400);
        setTimeout(() => clearInterval(t), 6000);
      }
    };
    window.addEventListener("formbot:open", handler);
    return () => window.removeEventListener("formbot:open", handler);
  }, [sessionId]);

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
      abortRef.current = new AbortController();
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
          signal: abortRef.current.signal,
        });
        const j = await r.json();
        if (j.customerId) setCustomerId(j.customerId);
        const botMsgs: ChatMsg[] = (j.messages || []).filter((m: ChatMsg) => m.role === "bot");
        setMessages((m) => [...m, ...botMsgs]);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setMessages((m) => [
            ...m,
            { role: "bot", text: "⚠️ Message nahi pahuncha — internet check karke dobara bhejein.", chips: ["🔄 Reload"] },
          ]);
        }
      } finally {
        setBusy(false);
        setTyping(false);
        scrollDown();
      }
    },
    [busy, sessionId, scrollDown]
  );

  const onChip = (chip: string) => {
    const txt = chipToText(chip);
    if (txt === "reload") return window.location.reload();
    send({ text: txt });
  };

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
    const ok = /^image\//.test(f.type) || f.type === "application/pdf" || /\.(jpe?g|png|webp|pdf|heic)$/i.test(f.name);
    if (!ok) {
      setMessages((m) => [...m, { role: "bot", text: "Sirf *photo (JPG/PNG)* ya *PDF* chalta he." }]);
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
    initedRef.current = false;
    setMessages([]);
    setCustomerId("");
    setSessionId(sid);
    initedRef.current = false;
    // re-init
    setTimeout(() => {
      initedRef.current = false;
    }, 0);
    (async () => {
      try {
        const r2 = await fetch("/api/webchat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid }),
        });
        const j2 = await r2.json();
        setMessages(j2.messages || []);
      } catch {
        /* ignore */
      }
    })();
  };

  const showQuickActions = !busy && messages.length <= 2;

  return (
    <div
      className={`flex flex-col overflow-hidden bg-white ${
        open
          ? "fb-widget-open fixed inset-0 z-[60] overflow-hidden bg-white"
          : "hidden"
      }`}
      role="dialog"
      aria-label="FormBot chat"
    >
      {/* header */}
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
          F
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-emerald-600 bg-lime-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-white">{wcfg.businessName}</p>
          <p className="truncate text-[11px] text-emerald-50/90">
            {wcfg.tagline} • <span className="text-lime-300">● Online</span>
          </p>
          {customerId ? (
            <p className="truncate text-[10px] text-emerald-100/70">ID: {customerId}</p>
          ) : null}
        </div>
        <button
          onClick={reset}
          title="Nayi chat shuru karein"
          className="rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="Nayi chat"
        >
          <RefreshCcw className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          title="Chat band karein"
          className="rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="Chat band karein"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* messages */}
      <div className="chat-scroll flex-1 space-y-3 overflow-y-auto bg-emerald-50/40 px-3 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <Bot className="h-7 w-7" />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-700">{wcfg.assistantName}</p>
            <p className="mt-1 text-xs text-slate-500">{wcfg.businessHours}</p>
          </div>
        ) : null}
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
              <div className="min-w-0 max-w-[88%] space-y-2">
                <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                  <RichText text={m.text} />
                </div>
                {m.card ? <BotCard card={m.card} /> : null}
                {m.cards && m.cards.length > 0 ? (
                  <div className="chat-scroll grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-xl p-0.5">
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

      {/* quick actions */}
      {showQuickActions ? (
        <div className="flex gap-1.5 overflow-x-auto border-t border-emerald-100 bg-white px-3 pt-2 pb-1 [scrollbar-width:none]">
          {wcfg.quickActions.map((a, i) => {
            const Icon = quickIconFor(a);
            return (
              <button
                key={i}
                onClick={() => send({ text: quickTextFor(a) })}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-600 hover:text-white"
              >
                <Icon className="h-3.5 w-3.5" />
                {a}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* input */}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-emerald-100 bg-white px-3 py-2.5"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
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
          onClick={() => fileRef.current?.click()}
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
          placeholder="Message likhein… (jaise: mool niwas banana he)"
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

// ============================================================
// Floating launcher — bottom-right (desktop + mobile)
// ============================================================

export function ChatLauncher({ onOpen, open }: { onOpen: () => void; open: boolean }) {
  return (
    <button
      onClick={onOpen}
      className={`fixed bottom-5 right-5 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-600/30 transition-all hover:scale-105 hover:bg-emerald-700 ${
        open ? "pointer-events-none scale-0 opacity-0" : "scale-100 opacity-100"
      }`}
      aria-label="FormBot chat kholein"
      title="FormBot Assistant — chat kholein"
    >
      <Send className="h-6 w-6" />
      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-extrabold text-emerald-900">
        1
      </span>
    </button>
  );
}
