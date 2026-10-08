"use client";

import { useState } from "react";
import { Providers } from "@/components/providers";
import { Overview } from "@/components/dashboard/overview";
import { Applications } from "@/components/dashboard/applications";
import { Tasks } from "@/components/dashboard/tasks";
import { Conversations } from "@/components/dashboard/conversations";
import { Services } from "@/components/dashboard/services";
import { Requests } from "@/components/dashboard/requests";
import { WhatsAppSetup } from "@/components/dashboard/whatsapp";
import { ChatbotSettings } from "@/components/dashboard/chatbot";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  MessagesSquare,
  Grid3X3,
  Inbox,
  Smartphone,
  Home,
  Bot,
} from "lucide-react";

const NAV = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "tasks", label: "Operator Tasks", icon: ClipboardList },
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
  { id: "services", label: "Services", icon: Grid3X3 },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "chatbot", label: "Chatbot Settings", icon: Bot },
  { id: "whatsapp", label: "WhatsApp Setup", icon: Smartphone },
];

function Shell({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState("overview");
  const active = NAV.find((n) => n.id === view) ?? NAV[0];

  return (
    <div className="flex min-h-screen bg-slate-100/70">
      {/* sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white shadow">
            CS
          </div>
          <div>
            <p className="text-sm font-extrabold leading-tight text-slate-900">CSC Smart Seva</p>
            <p className="text-[11px] text-slate-400">Control Panel</p>
          </div>
        </div>
        <nav className="space-y-1" aria-label="Main navigation">
          {NAV.map((n) => {
            const Icon = n.icon;
            const isActive = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {n.label}
              </button>
            );
          })}
          <button
            onClick={onExit}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <Home className="h-4 w-4 shrink-0" />
            Landing page
          </button>
        </nav>
        <div className="mt-auto rounded-xl bg-emerald-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
            <Smartphone className="h-3.5 w-3.5" /> Bot mode: ON
          </p>
          <p className="mt-1 text-[11px] leading-snug text-emerald-700">
            WhatsApp bot + Web chatbot dono chal rahe he. Ye dashboard dono ka control panel he.
          </p>
        </div>
      </aside>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                CS
              </div>
              <p className="text-sm font-extrabold text-slate-900">CSC Control Panel</p>
            </div>
            <h1 className="hidden text-lg font-bold text-slate-900 md:block">{active.label}</h1>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
                ● Live
              </span>
              <button
                onClick={onExit}
                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-500 transition hover:text-emerald-700"
              >
                ← Landing
              </button>
            </div>
          </div>
          {/* mobile nav */}
          <nav className="mt-3 flex gap-1.5 overflow-x-auto pb-1 md:hidden" aria-label="Mobile navigation">
            {NAV.map((n) => {
              const isActive = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {n.label}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-6 md:py-6">
          {view === "overview" && <Overview onNavigate={setView} />}
          {view === "applications" && <Applications />}
          {view === "tasks" && <Tasks />}
          {view === "conversations" && <Conversations />}
          {view === "services" && <Services />}
          {view === "requests" && <Requests />}
          {view === "chatbot" && <ChatbotSettings />}
          {view === "whatsapp" && <WhatsAppSetup />}
        </main>

        <footer className="mt-auto border-t border-slate-200 bg-white px-4 py-3 text-center text-[11px] text-slate-400">
          CSC Smart Seva Control Panel • WhatsApp bot + Web chatbot • pura automation
        </footer>
      </div>
    </div>
  );
}

export function AdminShell({ onExit }: { onExit: () => void }) {
  return (
    <Providers>
      <Shell onExit={onExit} />
    </Providers>
  );
}
