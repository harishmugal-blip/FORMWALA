"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Hand, Lightbulb, CheckCircle2, Phone } from "lucide-react";
import { fetchJson, postJson, ago, istTime, statusTone } from "@/lib/csc-utils";

type Handoff = {
  id: number;
  phone: string;
  name: string;
  reason: string;
  status: string;
  taken_by: string;
  created_at: string;
  resolved_at: string;
};

type Research = {
  research_id: string;
  phone: string;
  user_message: string;
  proposed_service: string;
  ai_analysis: string;
  status: string;
  created_at: string;
};

export function Requests() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const handoff = useQuery<{ handoffs: Handoff[] }>({
    queryKey: ["handoff"],
    queryFn: () => fetchJson("/api/handoff"),
    refetchInterval: 12000,
  });

  const research = useQuery<{ research: Research[] }>({
    queryKey: ["research"],
    queryFn: () => fetchJson("/api/research"),
    refetchInterval: 20000,
  });

  const act = useMutation({
    mutationFn: (p: { id: number; action: string }) => postJson("/api/handoff", p),
    onSuccess: (_d, v) => {
      toast({
        title: v.action === "take" ? "Aapne baat le li ✅" : "Handoff resolve ho gaya ✅",
        description:
          v.action === "take"
            ? "Bot ne customer ko chhod diya — ab aap WhatsApp par baat karo."
            : "Bot phir se customer ko handle karega.",
      });
      qc.invalidateQueries({ queryKey: ["handoff"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (e: Error) =>
      toast({ title: "Action fail", description: e.message, variant: "destructive" }),
  });

  if (handoff.isLoading || research.isLoading || !handoff.data || !research.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  const hs = handoff.data.handoffs;
  const rs = research.data.research;

  return (
    <div className="space-y-6">
      {/* handoff queue */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <Hand className="h-4 w-4 text-red-500" /> Human handoff queue
          <span className="text-xs font-normal text-slate-400">
            (customer human se baat karna chahta he)
          </span>
        </h2>
        {hs.length === 0 ? (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 text-center text-sm text-slate-400">
              Koi handoff request nahi — bot sab sambhal raha he 💪
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {hs.map((h) => {
              const st = String(h.status).toUpperCase();
              return (
                <div
                  key={h.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        <Phone className="h-3.5 w-3.5 text-slate-400" /> {h.name || h.phone}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${statusTone(h.status)}`}>
                        {st}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{h.reason || "Koi reason nahi diya"}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {istTime(h.created_at)} • {ago(h.created_at)} pehle
                      {h.taken_by ? ` • taken by ${h.taken_by}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {["PENDING", "WAITING", "NEW"].includes(st) && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: h.id, action: "take" })}
                      >
                        <Hand className="mr-1 h-3.5 w-3.5" /> Take over
                      </Button>
                    )}
                    {st !== "RESOLVED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: h.id, action: "resolve" })}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolve (bot wapas)
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* service research */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <Lightbulb className="h-4 w-4 text-teal-600" /> Naye service ideas
          <span className="text-xs font-normal text-slate-400">
            (customers ne jo manga par catalog me nahi he)
          </span>
        </h2>
        {rs.length === 0 ? (
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 text-center text-sm text-slate-400">
              Abhi koi unknown-service request nahi aayi.
            </CardContent>
          </Card>
        ) : (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {rs.map((r) => (
              <div key={r.research_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">{r.phone}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${statusTone(r.status)}`}>
                      {String(r.status).toUpperCase()}
                    </Badge>
                    <span className="text-[11px] text-slate-400">{ago(r.created_at)}</span>
                  </span>
                </div>
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  “{r.user_message}”
                </p>
                {r.ai_analysis && (
                  <p className="mt-2 line-clamp-3 text-xs text-slate-500">
                    <span className="font-semibold text-teal-700">AI research:</span> {String(r.ai_analysis)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
