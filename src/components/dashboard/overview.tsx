"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ClipboardList,
  IndianRupee,
  MessagesSquare,
  ClipboardCheck,
  Hand,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import { fetchJson, inr, ago } from "@/lib/csc-utils";

type Overview = {
  kpis: {
    totalApps: number;
    appsToday: number;
    pendingTasks: number;
    doneTasks: number;
    revenueTotal: number;
    revenueToday: number;
    activeConvs: number;
    msgsToday: number;
    handoffPending: number;
    researchNew: number;
  };
  chart7d: { day: string; label: string; in: number; out: number }[];
  serviceBreakdown: { id: string; name: string; count: number }[];
  feed: { at: string; kind: string; text: string; sub: string }[];
  health: { bridge: string; n8n: string; agent: string };
};

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{sub}</p>
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Overview({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["overview"],
    queryFn: () => fetchJson("/api/overview"),
    refetchInterval: 15000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const maxBar = Math.max(1, ...data.chart7d.map((d) => d.in + d.out));
  const maxSvc = Math.max(1, ...data.serviceBreakdown.map((s) => s.count));

  const dot = (s: string) => (s === "up" ? "bg-emerald-500" : "bg-red-400");

  return (
    <div className="space-y-4">
      {/* health strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-sm">
        <span className="font-semibold text-slate-600">System health:</span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dot(data.health.bridge)}`} /> WhatsApp Bridge (:8080)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> SQLite Brain (custom.db)
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${dot(data.health.agent)}`} /> Ravi AI Brain (:8090)
        </span>
        <span className="ml-auto text-slate-400">Auto-refresh: 15s</span>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<FileText className="h-4 w-4 text-emerald-700" />}
          label="Applications"
          value={String(k.totalApps)}
          sub={`${k.appsToday} aaj ke`}
          tone="bg-emerald-100"
        />
        <Kpi
          icon={<ClipboardList className="h-4 w-4 text-amber-700" />}
          label="Pending Tasks"
          value={String(k.pendingTasks)}
          sub={`${k.doneTasks} complete`}
          tone="bg-amber-100"
        />
        <Kpi
          icon={<IndianRupee className="h-4 w-4 text-teal-700" />}
          label="Revenue (paid)"
          value={inr(k.revenueTotal)}
          sub={`aaj: ${inr(k.revenueToday)}`}
          tone="bg-teal-100"
        />
        <Kpi
          icon={<MessagesSquare className="h-4 w-4 text-emerald-700" />}
          label="Messages aaj"
          value={String(k.msgsToday)}
          sub={`${k.activeConvs} active chats`}
          tone="bg-emerald-100"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 7-day chart */}
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Pichhle 7 din ke WhatsApp messages
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex h-40 items-end gap-3">
              {data.chart7d.map((d) => {
                const total = d.in + d.out;
                const hPct = (total / maxBar) * 100;
                const inPct = total ? (d.in / total) * hPct : 0;
                const outPct = total ? (d.out / total) * hPct : 0;
                return (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-slate-500">{total || ""}</span>
                    <div
                      className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-md bg-slate-100"
                      style={{ height: "112px" }}
                    >
                      <div className="w-full bg-emerald-500" style={{ height: `${outPct}%` }} title={`OUT: ${d.out}`} />
                      <div className="w-full bg-teal-300" style={{ height: `${inPct}%` }} title={`IN: ${d.in}`} />
                    </div>
                    <span className="text-[10px] text-slate-400">{d.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-teal-300" /> Customer se aaye (IN)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-emerald-500" /> Bot ne bheje (OUT)
              </span>
            </div>
          </CardContent>
        </Card>

        {/* service breakdown */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Seva-wise applications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 p-4 pt-0">
            {data.serviceBreakdown.length === 0 && (
              <p className="text-sm text-slate-400">Abhi koi application nahi.</p>
            )}
            {data.serviceBreakdown.slice(0, 7).map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium text-slate-600">{s.name}</span>
                  <span className="ml-2 shrink-0 font-semibold text-slate-800">{s.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(s.count / maxSvc) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* activity feed */}
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {data.feed.length === 0 && (
                <p className="text-sm text-slate-400">
                  Abhi koi activity nahi — customers ke message ka wait ho raha he 😄
                </p>
              )}
              {data.feed.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                >
                  <span className="mt-0.5 text-base">
                    {f.kind === "application" ? "📄" : f.kind === "payment" ? "💰" : "🔧"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">{f.text}</p>
                    <p className="truncate text-xs text-slate-400">{f.sub}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{ago(f.at)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* attention */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Dhyan dene wali baatein
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <button
              onClick={() => onNavigate("tasks")}
              className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left transition hover:bg-amber-100"
            >
              <ClipboardList className="h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900">{k.pendingTasks} tasks pending</p>
                <p className="text-xs text-amber-700">Portal par submit karna he</p>
              </div>
            </button>
            <button
              onClick={() => onNavigate("requests")}
              className="flex w-full items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-left transition hover:bg-red-100"
            >
              <Hand className="h-4 w-4 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-900">{k.handoffPending} handoff wait</p>
                <p className="text-xs text-red-700">Customer ko human baat karna chahta he</p>
              </div>
            </button>
            <button
              onClick={() => onNavigate("requests")}
              className="flex w-full items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 text-left transition hover:bg-teal-100"
            >
              <Lightbulb className="h-4 w-4 shrink-0 text-teal-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-teal-900">{k.researchNew} naye service requests</p>
                <p className="text-xs text-teal-700">Catalog me nahi he — add kar sakte ho</p>
              </div>
            </button>
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <div>
                <p className="text-sm font-semibold text-emerald-900">Bot live he</p>
                <p className="text-xs text-emerald-700">WhatsApp par customers se baat kar raha he</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
