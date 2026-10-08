"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Save, Loader2 } from "lucide-react";
import { fetchJson } from "@/lib/csc-utils";

type Cfg = {
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

export function ChatbotSettings() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const j = await fetchJson<{ config: Cfg }>("/api/chatbot-config");
        setCfg(j.config);
      } catch {
        setMsg("Config load fail");
      }
    })();
  }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg("");
    try {
      const r = await fetch("/api/chatbot-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const j = await r.json();
      if (j.ok) {
        setCfg(j.config);
        setMsg("Save ho gaya ✅ — chat me turant lagu");
      } else setMsg("Save fail");
    } catch {
      setMsg("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <p className="text-center text-xs text-slate-400">{msg}</p>
      </div>
    );
  }

  const field = (
    label: string,
    key: keyof Cfg,
    opts?: { multiline?: boolean; placeholder?: string }
  ) => (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {opts?.multiline ? (
        <textarea
          value={String(cfg[key] ?? "")}
          onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
          rows={3}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400"
        />
      ) : (
        <input
          value={String(cfg[key] ?? "")}
          placeholder={opts?.placeholder}
          onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-extrabold text-slate-900">Chatbot Settings</p>
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">
                {cfg.enabled ? "ON" : "OFF"}
              </span>
              <button
                onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
                className={`relative h-6 w-11 rounded-full transition ${
                  cfg.enabled ? "bg-emerald-600" : "bg-slate-300"
                }`}
                aria-label="Chatbot on/off"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    cfg.enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Ye settings web chatbot (landing page) ke liye he. Security rules configurable nahi he.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("Business name", "businessName")}
            {field("Assistant name", "assistantName")}
            {field("Tagline", "tagline")}
            {field("Business hours", "businessHours")}
          </div>

          <div className="mt-3">{field("Welcome message", "welcomeMessage", { multiline: true })}</div>
          <div className="mt-3">{field("Fallback message", "fallbackMessage", { multiline: true })}</div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("Token prefix (default FB)", "tokenPrefix", { placeholder: "FB" })}
            {field("UPI ID (MOCK mode)", "paymentUpiId", { placeholder: "cscseva@upi" })}
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Payment mode
            </label>
            <div className="flex gap-2">
              {(["MOCK", "LIVE"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setCfg({ ...cfg, paymentMode: m })}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    cfg.paymentMode === m
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {m === "MOCK" ? "MOCK (UPI + operator verify)" : "LIVE (Razorpay keys required)"}
                </button>
              ))}
            </div>
            {cfg.paymentMode === "LIVE" && (
              <p className="mt-1 text-[10px] text-amber-600">
                ⚠️ RAZORPAY_KEY_SECRET env me honi chahiye, warna webhook fail hoga.
              </p>
            )}
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Quick actions (chat ke top buttons)
            </label>
            <div className="space-y-2">
              {cfg.quickActions.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={a}
                    onChange={(e) => {
                      const qa = [...cfg.quickActions];
                      qa[i] = e.target.value;
                      setCfg({ ...cfg, quickActions: qa });
                    }}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
                  />
                  <button
                    onClick={() =>
                      setCfg({ ...cfg, quickActions: cfg.quickActions.filter((_, k) => k !== i) })
                    }
                    className="rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-400 transition hover:text-red-500"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {cfg.quickActions.length < 6 ? (
                <button
                  onClick={() => setCfg({ ...cfg, quickActions: [...cfg.quickActions, "New action"] })}
                  className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-400 transition hover:border-emerald-400 hover:text-emerald-600"
                >
                  + Add
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            {msg ? <p className="text-xs font-semibold text-slate-500">{msg}</p> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
