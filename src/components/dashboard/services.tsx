"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, KeyRound, UserCheck } from "lucide-react";
import { fetchJson, inr, SERVICE_EMOJI } from "@/lib/csc-utils";

type Svc = {
  service_id: string;
  service_name: string;
  category: string;
  description: string;
  gov_fee: number;
  service_charge: number;
  gst: number;
  total_fee: number;
  portal_url: string;
  portal_type: string;
  operator_required: boolean;
  otp_required: boolean;
  status_tracking: boolean;
  active: boolean;
  processing_steps: unknown;
  fields: number;
  docs: number;
};

export function Services() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<{ services: Svc[] }>({
    queryKey: ["services"],
    queryFn: () => fetchJson("/api/services"),
    refetchInterval: 60000,
  });

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;

  const services = data.services.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(s.service_name ?? "").toLowerCase().includes(q) ||
      String(s.service_id ?? "").toLowerCase().includes(q) ||
      String(s.category ?? "").toLowerCase().includes(q)
    );
  });
  const activeCount = data.services.filter((s) => s.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Seva search karo…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
          {activeCount} / {data.services.length} active
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((s) => (
          <div
            key={s.service_id}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-2xl">{SERVICE_EMOJI[s.service_id] ?? "📄"}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{s.service_name}</p>
                  <p className="text-[11px] text-slate-400">{s.category}</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={`shrink-0 text-[10px] ${
                  s.active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                {s.active ? "ACTIVE" : "OFF"}
              </Badge>
            </div>

            <p className="mt-2 line-clamp-2 text-xs text-slate-500">{s.description}</p>

            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{s.fields} fields</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{s.docs} docs</span>
              {s.operator_required && (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                  <UserCheck className="h-3 w-3" /> Operator
                </span>
              )}
              {s.otp_required && (
                <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">
                  <KeyRound className="h-3 w-3" /> OTP
                </span>
              )}
              {s.status_tracking && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  <MapPin className="h-3 w-3" /> Tracking
                </span>
              )}
            </div>

            <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
              <div className="text-[11px] text-slate-400">
                Gov fee {inr(s.gov_fee)} + charge {inr(s.service_charge)} + GST {inr(s.gst)}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-emerald-700">{inr(s.total_fee)}</p>
                <p className="text-[10px] text-slate-400">customer pays</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
