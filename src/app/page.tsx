"use client";

import { useEffect, useState } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { Lock } from "lucide-react";

// OPERATOR PIN — Harish ke liye (customers ko nahi batana)
const OPERATOR_PIN = "2026";

function PinGate({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === OPERATOR_PIN) {
      // dashboard APIs ka auth cookie set karo (same PIN = dashboard password)
      try {
        await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pin }),
        });
      } catch {
        /* cookie fail — views empty state dikhayenge */
      }
      onOk();
    } else {
      setErr(true);
      setPin("");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="mt-3 text-center text-lg font-extrabold text-slate-900">Operator Login</h1>
        <p className="mt-1 text-center text-xs text-slate-500">
          Ye area sirf operators ke liye he.
        </p>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setErr(false);
          }}
          placeholder="PIN"
          autoFocus
          className={`mt-4 h-11 w-full rounded-xl border px-4 text-center text-lg font-bold tracking-widest outline-none transition ${
            err ? "border-red-300 bg-red-50" : "border-slate-200 focus:border-emerald-400"
          }`}
          aria-label="Operator PIN"
        />
        {err ? (
          <p className="mt-2 text-center text-xs font-semibold text-red-500">PIN galat he</p>
        ) : null}
        <button
          type="submit"
          className="mt-4 h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700"
        >
          Login
        </button>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = "";
            window.location.reload();
          }}
          className="mt-3 block text-center text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          ← Landing page wapas
        </a>
      </form>
    </div>
  );
}

export default function Page() {
  const [mode, setMode] = useState<"landing" | "pin" | "admin">("landing");

  useEffect(() => {
    const apply = () => {
      const h = window.location.hash;
      if (h === "#operator") {
        setMode((m) => (m === "admin" ? "admin" : "pin"));
      } else if (h === "#admin") {
        setMode((m) => (m === "admin" ? "admin" : "pin"));
      } else {
        setMode("landing");
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  if (mode === "admin") return <AdminShell onExit={() => setMode("landing")} />;
  if (mode === "pin") return <PinGate onOk={() => setMode("admin")} />;
  return <LandingPage />;
}
