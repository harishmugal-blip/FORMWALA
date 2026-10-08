"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, SendHorizontal, User, Bot } from "lucide-react";
import { fetchJson, postJson, ago, istTime, statusTone, stateLabel } from "@/lib/csc-utils";

type ConvItem = {
  phone: string;
  state: string;
  service_id: string;
  handoff_active: number;
  updatedAt: string;
  last: { body: string; direction: string; createdAt: string } | null;
};

type Msg = { direction: string; body: string; message_type: string; status: string; createdAt: string };
type ConvDetail = {
  state: { phone: string; state: string; service_id: string; handoff_active: number } | null;
  messages: Msg[];
  applications: { application_number: string; service_id: string; status: string; total_fee: number; createdAt: string }[];
};

export function Conversations() {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const list = useQuery<{ conversations: ConvItem[] }>({
    queryKey: ["convs"],
    queryFn: () => fetchJson("/api/conversations"),
    refetchInterval: 10000,
  });

  const detail = useQuery<ConvDetail>({
    queryKey: ["conv", selected],
    queryFn: () => fetchJson(`/api/conversations?phone=${encodeURIComponent(selected!)}`),
    enabled: !!selected,
    refetchInterval: 8000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail.data?.messages?.length]);

  const send = useMutation({
    mutationFn: (p: { phone: string; text: string }) => postJson("/api/send", p),
    onSuccess: () => {
      toast({ title: "Message bhej diya ✅", description: "WhatsApp par customer ko pahunch gaya." });
      setDraft("");
      qc.invalidateQueries({ queryKey: ["conv", selected] });
      qc.invalidateQueries({ queryKey: ["convs"] });
    },
    onError: (e: Error) => {
      toast({ title: "Send fail hua", description: e.message, variant: "destructive" });
    },
  });

  if (list.isLoading || !list.data) {
    return (
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const convs = list.data.conversations;
  const msgs = detail.data?.messages ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* conversation list */}
      <Card className={`border-slate-200 shadow-sm ${selected ? "hidden lg:block" : ""}`}>
        <CardContent className="p-3">
          <p className="px-1 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Conversations ({convs.length})
          </p>
          <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
            {convs.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-slate-400">
                Abhi koi conversation nahi.
              </p>
            )}
            {convs.map((c) => (
              <button
                key={c.phone}
                onClick={() => setSelected(c.phone)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  selected === c.phone
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-100 bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800">
                    +{c.phone.replace(/^\+?/, "")}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">{ago(c.updatedAt)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-teal-200 bg-teal-50 text-teal-800">
                    {stateLabel(c.state)}
                  </Badge>
                  {Number(c.handoff_active) === 1 && (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-700">
                      Human mode
                    </Badge>
                  )}
                </div>
                {c.last && (
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {c.last.direction === "IN" ? "" : "Aap: "}
                    {c.last.body.slice(0, 48)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* transcript */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex h-[68vh] flex-col p-0">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
              <Bot className="h-10 w-10 text-slate-300" />
              <p className="text-sm">Left se koi conversation select karo</p>
              <p className="text-xs">Chat transcript dekho aur seedha reply bhejo</p>
            </div>
          ) : (
            <>
              {/* header */}
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="lg:hidden"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">+{selected}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] border-teal-200 bg-teal-50 text-teal-800">
                      {stateLabel(detail.data?.state?.state)}
                    </Badge>
                    {detail.data?.state?.service_id && (
                      <span className="text-[11px] text-slate-400">
                        {detail.data.state.service_id}
                      </span>
                    )}
                  </div>
                </div>
                {detail.data?.applications?.[0] && (
                  <span className="hidden shrink-0 text-xs text-slate-400 sm:block">
                    {detail.data.applications[0].application_number}
                  </span>
                )}
              </div>

              {/* messages */}
              <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2]/40 px-4 py-4">
                {msgs.length === 0 && (
                  <p className="pt-8 text-center text-sm text-slate-400">Koi message nahi.</p>
                )}
                {msgs.map((m, i) => {
                  const out = String(m.direction).toUpperCase() !== "IN";
                  return (
                    <div key={i} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-xl px-3 py-2 text-sm shadow-sm ${
                          out
                            ? "rounded-br-sm bg-[#d9fdd3] text-slate-800"
                            : "rounded-bl-sm bg-white text-slate-800"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body || `(${m.message_type || "media"})`}</p>
                        <p className="mt-0.5 text-right text-[10px] text-slate-400">
                          {istTime(m.createdAt)}
                          {out && Number(m.status) === 0 && m.status === "0" ? "" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* composer */}
              <form
                className="flex items-center gap-2 border-t border-slate-100 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  send.mutate({ phone: selected, text: draft.trim() });
                }}
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Customer ko message likho… (bot ko roke bina)"
                  className="flex-1 border-slate-200"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={send.isPending || !draft.trim()}
                  className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
                  aria-label="Send message"
                >
                  <SendHorizontal className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
