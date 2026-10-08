"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, FileText, BadgeCheck } from "lucide-react";
import { fetchJson, inr, istTime, statusTone, SERVICE_EMOJI } from "@/lib/csc-utils";

type App = {
  application_id: string;
  application_number: string;
  service_id: string;
  customer_phone: string;
  status: string;
  total_fee: number;
  gov_fee: number;
  service_charge: number;
  gst: number;
  createdAt: string;
  updatedAt: string;
};

type Detail = {
  app: App & { form_data?: unknown };
  fields: { field_key: string; field_value: string; validated: string }[];
  docs: { doc_key: string; media_id: string; mime_type: string; status: string; createdAt: string }[];
  history: { old_status: string; new_status: string; note: string; created_at: string }[];
  payments: { payment_id: string; amount: number; status: string; gateway: string; paid_at: string }[];
  tasks: { task_id: string; status: string; note: string }[];
};

export function Applications() {
  const [sel, setSel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ applications: App[] }>({
    queryKey: ["apps"],
    queryFn: () => fetchJson("/api/applications"),
    refetchInterval: 12000,
  });

  const detail = useQuery<Detail>({
    queryKey: ["app", sel],
    queryFn: () => fetchJson(`/api/applications?id=${encodeURIComponent(sel!)}`),
    enabled: !!sel,
  });

  const verifyPayment = async (appNumber: string) => {
    setVerifying(true);
    setVerifyMsg("");
    try {
      const r = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationNumber: appNumber, action: "verify" }),
      });
      const j = await r.json();
      if (j.ok) {
        setVerifyMsg(j.alreadyVerified ? "Pehle hi verified he" : "Verified ✅ — application QUEUED");
        await detail.refetch();
        qc.invalidateQueries({ queryKey: ["apps"] });
      } else {
        setVerifyMsg(j.error || "Verify fail");
      }
    } catch {
      setVerifyMsg("Network error");
    } finally {
      setVerifying(false);
    }
  };

  if (isLoading || !data) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  const apps = data.applications.filter((a) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      String(a.application_number ?? "").toLowerCase().includes(s) ||
      String(a.service_id ?? "").toLowerCase().includes(s) ||
      String(a.customer_phone ?? "").includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search: application number, service, phone…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {apps.length === 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-400">
            Koi application nahi mila. Customer CONFIRM bolte hi application banti he.
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_0.8fr_0.7fr] gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:grid">
          <span>Application</span>
          <span>Customer</span>
          <span>Status</span>
          <span className="text-right">Fee</span>
          <span className="text-right">Date</span>
        </div>
        <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
          {apps.map((a) => (
            <button
              key={a.application_id}
              onClick={() => setSel(a.application_id)}
              className="grid w-full grid-cols-1 gap-1 px-4 py-3 text-left transition hover:bg-emerald-50/50 md:grid-cols-[1.4fr_1fr_1fr_0.8fr_0.7fr] md:gap-3 md:py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span>{SERVICE_EMOJI[String(a.service_id)] ?? "📄"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {a.application_number || a.application_id.slice(0, 12)}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400 md:hidden">
                    {a.customer_phone} • {istTime(a.createdAt)}
                  </span>
                </span>
              </span>
              <span className="truncate text-xs text-slate-500 md:self-center">
                {a.customer_phone}
                <span className="block text-[10px] text-slate-400">{a.service_id}</span>
              </span>
              <span className="md:self-center">
                <Badge variant="outline" className={`text-[10px] ${statusTone(a.status)}`}>
                  {String(a.status).toUpperCase()}
                </Badge>
              </span>
              <span className="text-sm font-semibold text-slate-700 md:text-right md:self-center">
                {inr(Number(a.total_fee ?? 0))}
              </span>
              <span className="hidden text-right text-[11px] text-slate-400 md:block md:self-center">
                {istTime(a.createdAt)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* detail sheet */}
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="p-0">
            <SheetTitle className="flex items-center gap-2 text-left">
              <FileText className="h-4 w-4 text-emerald-600" />
              {detail.data?.app?.application_number || "Application"}
            </SheetTitle>
          </SheetHeader>
          {detail.isLoading || !detail.data ? (
            <div className="space-y-3 pt-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-5 pt-2">
              {/* summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <Badge variant="outline" className={`text-[10px] ${statusTone(detail.data.app.status)}`}>
                    {String(detail.data.app.status).toUpperCase()}
                  </Badge>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-slate-500">Service</span>
                  <span className="font-medium text-slate-800">{detail.data.app.service_id}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-slate-500">Phone</span>
                  <span className="font-medium text-slate-800">{detail.data.app.customer_phone}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-slate-500">Total fee</span>
                  <span className="font-bold text-emerald-800">
                    {inr(
                      Number(detail.data.app.total_fee ?? 0) ||
                        detail.data.payments.reduce((s, p) => s + Number(p.amount ?? 0), 0) ||
                        0
                    )}
                  </span>
                </div>
              </div>

              {/* form data */}
              {detail.data.fields.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Form details</p>
                  <div className="space-y-1.5">
                    {detail.data.fields.map((f, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                        <span className="shrink-0 text-slate-500">{f.field_key}</span>
                        <span className="text-right font-medium text-slate-800">{String(f.field_value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* docs */}
              {detail.data.docs.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Documents</p>
                  <div className="space-y-1.5">
                    {detail.data.docs.map((d, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                        <span className="text-slate-700">📎 {d.doc_key}</span>
                        <Badge variant="outline" className={`text-[10px] ${statusTone(d.status)}`}>
                          {String(d.status || "RECEIVED").toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* payments */}
              {detail.data.payments.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Payments</p>
                  <div className="space-y-1.5">
                    {detail.data.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                        <span className="font-semibold text-emerald-800">{inr(Number(p.amount ?? 0))}</span>
                        <span className="text-xs text-slate-500">
                          {String(p.status).toUpperCase()} • {p.gateway || "razorpay"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {detail.data.payments.some((p) => String(p.status).toUpperCase() === "PENDING") &&
                    detail.data.app?.application_number && (
                      <div className="mt-2">
                        <button
                          onClick={() => verifyPayment(String(detail.data!.app.application_number))}
                          disabled={verifying}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <BadgeCheck className="h-4 w-4" />
                          {verifying ? "Verifying…" : "Verify Payment (PAID → QUEUED)"}
                        </button>
                        {verifyMsg ? (
                          <p className="mt-1 text-center text-[11px] font-semibold text-slate-500">{verifyMsg}</p>
                        ) : null}
                      </div>
                    )}
                </div>
              )}

              {/* status history */}
              {detail.data.history.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Status history</p>
                  <div className="space-y-2 border-l-2 border-emerald-200 pl-4">
                    {detail.data.history.map((h, i) => (
                      <div key={i} className="relative text-sm">
                        <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <p className="font-medium text-slate-700">
                          {String(h.new_status).toUpperCase()}
                          {h.note ? <span className="ml-1 font-normal text-slate-400">— {h.note}</span> : null}
                        </p>
                        <p className="text-[11px] text-slate-400">{istTime(h.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
