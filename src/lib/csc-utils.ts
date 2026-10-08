"use client";

// shared helpers for the CSC dashboard

export async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String((data as { error?: string })?.error || r.status));
  return data as T;
}

export function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

// ISO string -> "2 min pehle" style (IST)
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  let d = new Date(iso);
  if (isNaN(d.getTime())) d = new Date(iso + "Z");
  if (isNaN(d.getTime())) return "—";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "abhi";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ghante`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd} din`;
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

export function istTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  let d = new Date(iso);
  if (isNaN(d.getTime())) d = new Date(iso + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// badge tone per status
export function statusTone(status: string | null | undefined): string {
  const s = String(status ?? "").toUpperCase();
  if (["PAID", "SUCCESS", "DONE", "SUBMITTED", "RESOLVED", "TRUE", "ACTIVE"].includes(s))
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (["PENDING", "DRAFT", "NEW"].includes(s)) return "bg-amber-100 text-amber-800 border-amber-200";
  if (["IN_PROGRESS", "TAKEN"].includes(s)) return "bg-teal-100 text-teal-800 border-teal-200";
  if (["FAILED", "CANCELLED", "CANCELED", "ERROR", "FALSE"].includes(s))
    return "bg-red-100 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

// friendly conversation state names
export function stateLabel(s: string | null | undefined): string {
  const map: Record<string, string> = {
    "": "Idle",
    NEW: "Naya customer",
    OFFER: "Seva offer",
    FIELDS: "Form bhar rahe he",
    DOCS: "Documents",
    PAYMENT: "Payment",
    CONFIRM: "Confirm wait",
    CLOSED: "Band",
    IDLE: "Idle",
    DONE: "Complete",
  };
  return map[String(s ?? "").toUpperCase()] ?? String(s ?? "—");
}

export const SERVICE_EMOJI: Record<string, string> = {
  PAN_CARD: "🪪",
  ITR_FILING: "📊",
  GST_REG: "🧾",
  GST_RETURN: "📁",
  INCOME_CERT: "📜",
  CASTE_CERT: "📜",
  DOMICILE_CERT: "🏠",
  VOTER_ID: "🗳️",
  AYUSHMAN: "🏥",
  E_SHRAM: "👷",
  SCHOLARSHIP: "🎓",
  GOVT_JOB_FORM: "📋",
  RATION_CARD: "🍚",
  PASSPORT: "🛂",
};
