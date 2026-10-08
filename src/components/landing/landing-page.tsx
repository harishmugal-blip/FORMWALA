"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  ShieldCheck,
  Clock,
  FileCheck,
  Smartphone,
  BadgeCheck,
  Wallet,
  Lock,
  Bot,
} from "lucide-react";
import { ChatWidget, ChatLauncher } from "@/components/landing/chat-panel";

type Svc = {
  service_id: string;
  service_name: string;
  category: string;
  description: string;
  total_fee: number;
  government_fee: number;
  service_charge: number;
};

const STEPS = [
  {
    icon: MessageCircle,
    title: "1. Chat me ID banao",
    desc: "Chat kholein — FormBot Assistant aapki customer ID 2 minute me bana dega (naam + mobile).",
  },
  {
    icon: FileCheck,
    title: "2. Seva chuno & details do",
    desc: "PAN, ITR, certificate jo chahiye select karo — sawalo ke jawab aur documents photo me bhejo.",
  },
  {
    icon: Wallet,
    title: "3. Payment karo",
    desc: "Fee breakdown dekhkar pay karo — verification ke baad application queue me jaati he.",
  },
  {
    icon: BadgeCheck,
    title: "4. Token se status dekho",
    desc: "Har application ka token milta he (FB-… ) — chat me token bhejo, real status dekho.",
  },
];

export function LandingPage() {
  const [services, setServices] = useState<Svc[]>([]);
  const [cat, setCat] = useState("All");
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/catalog");
        const j = await r.json();
        setServices(j.services || []);
      } catch {
        setServices([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const set = new Set(services.map((s) => s.category).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [services]);

  const filtered = useMemo(
    () => (cat === "All" ? services : services.filter((s) => s.category === cat)),
    [services, cat]
  );

  const openChat = (text?: string) => {
    setChatOpen(true);
    if (text) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("formbot:open", { detail: { text } }));
      }, 350);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-sm font-extrabold text-white">
              F
            </div>
            <div>
              <p className="text-sm font-extrabold leading-tight text-slate-900">FormBot</p>
              <p className="text-[10px] leading-tight text-slate-500">Sarkari seva, ghar baithe</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex" aria-label="Main">
            <a href="#services" className="transition hover:text-emerald-700">Sevaayein</a>
            <a href="#kaise" className="transition hover:text-emerald-700">Kaise kaam hota he</a>
            <a href="#contact" className="transition hover:text-emerald-700">Contact</a>
          </nav>
          <a
            href="#operator"
            className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700 sm:flex"
          >
            <Lock className="h-3 w-3" /> Operator
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* hero + chat CTA */}
        <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/80 via-teal-50/40 to-white">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 md:px-6 md:py-14 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                16+ sarkari sevaayein • ek chat me
              </span>
              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
                Sarkari kaam ab{" "}
                <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  chat se
                </span>{" "}
                hoga
              </h1>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">
                PAN card, ITR, GST, income/caste certificate, Ayushman card — bas chat kholein,
                apni ID banayein aur kaam shuru. WhatsApp par bhi yehi seva milti he.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => openChat()}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat shuru karo
                </button>
                <a
                  href="#services"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  Sevaayein dekho
                </a>
              </div>
              <div className="mt-8 grid grid-cols-3 gap-3 text-center">
                {[
                  { icon: Clock, t: "24×7", s: "kabhi bhi" },
                  { icon: ShieldCheck, t: "100%", s: "document safe" },
                  { icon: Smartphone, t: "2 min", s: "me ID ready" },
                ].map((b, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-emerald-100 bg-white/70 px-2 py-3"
                  >
                    <b.icon className="mx-auto h-4 w-4 text-emerald-600" />
                    <p className="mt-1 text-sm font-extrabold text-slate-900">{b.t}</p>
                    <p className="text-[11px] text-slate-500">{b.s}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* chat preview card (widget right-bottom me khulta he) */}
            <div className="lg:pl-4">
              <button
                onClick={() => openChat()}
                className="group block w-full overflow-hidden rounded-2xl border border-emerald-100 bg-white text-left shadow-xl shadow-emerald-900/5 transition hover:-translate-y-0.5 hover:shadow-2xl"
                aria-label="FormBot Assistant kholein"
              >
                <div className="flex items-center gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
                    F
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-emerald-600 bg-lime-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-white">FormBot</p>
                    <p className="text-[11px] text-emerald-50/90">
                      AI Service Assistant • <span className="text-lime-300">● Online</span>
                    </p>
                  </div>
                  <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold text-white transition group-hover:bg-white/25">
                    OPEN →
                  </span>
                </div>
                <div className="space-y-2.5 bg-emerald-50/40 px-4 py-5">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-3.5 py-2 text-[13px] text-slate-800 shadow-sm">
                    Namaste 👋<br />
                    Main FormBot Assistant hoon.
                  </div>
                  <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-[13px] text-white">
                    mujhe mool niwas banana he
                  </div>
                  <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-emerald-100 bg-white px-3.5 py-2 text-[13px] text-slate-800 shadow-sm">
                    Bilkul! Pehle aapki ID banate hein — <b>aapka pura naam</b> likhein 😊
                  </div>
                  <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-dashed border-emerald-300 bg-emerald-50/70 px-3.5 py-2 text-[12px] font-bold text-emerald-800">
                    📋 Customer ID: CUST-2026-XXXXX
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-emerald-100 bg-white px-4 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <Bot className="h-3.5 w-3.5" /> Har application ka token + real status
                  </p>
                  <span className="text-[11px] font-extrabold text-emerald-600 opacity-0 transition group-hover:opacity-100">
                    Chat kholein →
                  </span>
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* services */}
        <section id="services" className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Sevaayein</p>
              <h2 className="mt-1 text-2xl font-extrabold text-slate-900 md:text-3xl">
                Kaunsa kaam karana he?
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Price me sarkari fee + hamari service charge + GST sab included he — koi hidden charge nahi.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    cat === c
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {filtered.map((s) => (
                <button
                  key={s.service_id}
                  onClick={() => openChat(s.service_name)}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      {s.category || "Seva"}
                    </span>
                    <span className="text-sm font-extrabold text-slate-900">₹{s.total_fee}</span>
                  </div>
                  <p className="mt-2.5 text-[15px] font-bold text-slate-900 group-hover:text-emerald-700">
                    {s.service_name}
                  </p>
                  <p className="mt-1 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500">
                    {s.description}
                  </p>
                  <p className="mt-3 text-[11px] font-bold text-emerald-600 opacity-0 transition group-hover:opacity-100">
                    Chat me mangao →
                  </p>
                </button>
              ))}
              {!filtered.length && (
                <p className="col-span-full rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  Seva list load ho rahi he… thoda ruk jayein ya chat me pooch lein 😊
                </p>
              )}
            </div>
          )}
        </section>

        {/* how it works */}
        <section id="kaise" className="bg-slate-50/80 py-12 md:py-16">
          <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Process</p>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900 md:text-3xl">
              4 step me kaam complete
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-emerald-300 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-extrabold text-slate-900">{s.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{s.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm leading-relaxed text-slate-700">
              <strong className="font-bold text-slate-900">WhatsApp pasand he?</strong>{" "}
              Wahi bot wahan bhi he — 917668483205 par message karein, same sevaayein,
              same process. Chat aur WhatsApp dono me aapki ID ek jaisi kaam karti he.
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-12 md:px-6 md:py-16">
          <div className="rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-10 text-center md:py-12">
            <h2 className="text-2xl font-extrabold text-white md:text-3xl">
              Aaj hi shuru karein — ID 2 minute me ban jayegi
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-50">
              Na koi app download, na koi office ke chakkar. Chat kholein, kaam batayein — bas.
            </p>
            <button
              onClick={() => openChat()}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-extrabold text-emerald-700 shadow-lg transition hover:bg-emerald-50"
            >
              <MessageCircle className="h-4 w-4" />
              Ab chat karo
            </button>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer id="contact" className="mt-auto border-t border-slate-100 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:grid-cols-3 md:px-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 text-xs font-extrabold text-white">
                F
              </div>
              <p className="text-sm font-extrabold text-slate-900">FormBot</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Digital seva Kendra — government services aapke mobile par.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            <p className="text-sm font-bold text-slate-900">Contact</p>
            <p className="mt-2">📱 WhatsApp: 917668483205</p>
            <p className="mt-1">💬 Web chat: right-bottom corner</p>
            <p className="mt-1">🕘 Timing: 24×7 chat, operator 10AM-7PM</p>
          </div>
          <div className="text-xs text-slate-500">
            <p className="text-sm font-bold text-slate-900">Legal</p>
            <p className="mt-2">Aapke documents encrypted store hote hein aur sirf kaam ke liye use hote hein.</p>
            <a
              href="#operator"
              className="mt-3 inline-flex items-center gap-1 font-semibold text-slate-400 transition hover:text-emerald-600"
            >
              <Lock className="h-3 w-3" /> Operator Login
            </a>
          </div>
        </div>
        <div className="border-t border-slate-100 py-3 text-center text-[11px] text-slate-400">
          © 2026 FormBot • Made with ❤️ for customers
        </div>
      </footer>

      {/* floating chat widget */}
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} />
      <ChatLauncher open={chatOpen} onOpen={() => setChatOpen(true)} />
    </div>
  );
}
