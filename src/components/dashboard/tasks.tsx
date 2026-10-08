"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PlayCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { fetchJson, postJson, inr, ago, statusTone, istTime, SERVICE_EMOJI } from "@/lib/csc-utils";

type Task = {
  id: number;
  task_id: string;
  application_id: string;
  application_number: string;
  status: string;
  note: string;
  operator_phone: string;
  createdAt: string;
  service_id: string | null;
  customer_phone: string | null;
  total_fee: number | null;
};

export function Tasks() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ["tasks"],
    queryFn: () => fetchJson("/api/tasks"),
    refetchInterval: 12000,
  });

  const update = useMutation({
    mutationFn: (p: { task_id: string; status: string }) =>
      postJson("/api/tasks", p),
    onSuccess: (_d, v) => {
      toast({
        title: v.status === "DONE" ? "Task complete ✅" : "Task in-progress",
        description: v.status === "DONE" ? "Operator ne kaam submit kar diya." : "Status update ho gaya.",
      });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      setBusy(null);
    },
    onError: (e: Error) => {
      toast({ title: "Update fail", description: e.message, variant: "destructive" });
      setBusy(null);
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  const tasks = data.tasks;
  const pending = tasks.filter((t) => String(t.status).toUpperCase() === "PENDING");
  const active = tasks.filter((t) => String(t.status).toUpperCase() === "IN_PROGRESS");
  const done = tasks.filter((t) => String(t.status).toUpperCase() === "DONE");

  const Row = ({ t }: { t: Task }) => {
    const st = String(t.status).toUpperCase();
    const isBusy = busy === t.task_id;
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 text-xl">{SERVICE_EMOJI[String(t.service_id)] ?? "📄"}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-800">
                {t.application_number || t.task_id || "Task"}
              </p>
              <Badge variant="outline" className={`text-[10px] ${statusTone(t.status)}`}>
                {st}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {t.customer_phone ? `Customer: ${t.customer_phone}` : "Customer: —"}
              {t.total_fee ? ` • Fee: ${inr(Number(t.total_fee))}` : ""}
              {t.note ? ` • ${t.note}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {istTime(t.createdAt)} • {ago(t.createdAt)} pehle
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {st === "PENDING" && (
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy || update.isPending}
              className="border-teal-300 text-teal-800 hover:bg-teal-50"
              onClick={() => {
                setBusy(t.task_id);
                update.mutate({ task_id: t.task_id, status: "IN_PROGRESS" });
              }}
            >
              <PlayCircle className="mr-1 h-3.5 w-3.5" /> Shuru karo
            </Button>
          )}
          {st !== "DONE" && (
            <Button
              size="sm"
              disabled={isBusy || update.isPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                setBusy(t.task_id);
                update.mutate({ task_id: t.task_id, status: "DONE" });
              }}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
            </Button>
          )}
          {st === "DONE" && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Ho gaya
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
          <CardContent className="flex items-center gap-2 p-3">
            <RefreshCw className="h-4 w-4 text-amber-700" />
            <div>
              <p className="text-lg font-bold text-amber-900">{pending.length}</p>
              <p className="text-[11px] text-amber-700">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-teal-200 bg-teal-50/60 shadow-sm">
          <CardContent className="flex items-center gap-2 p-3">
            <PlayCircle className="h-4 w-4 text-teal-700" />
            <div>
              <p className="text-lg font-bold text-teal-900">{active.length}</p>
              <p className="text-[11px] text-teal-700">In progress</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/60 shadow-sm">
          <CardContent className="flex items-center gap-2 p-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            <div>
              <p className="text-lg font-bold text-emerald-900">{done.length}</p>
              <p className="text-[11px] text-emerald-700">Complete</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {tasks.length === 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-400">
            Koi operator task nahi. Jab customer payment karega, task yahan aayega.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {[...pending, ...active, ...done].map((t) => (
          <Row key={`${t.task_id}-${t.id}`} t={t} />
        ))}
      </div>
    </div>
  );
}
