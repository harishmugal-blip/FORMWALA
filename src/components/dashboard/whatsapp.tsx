"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Smartphone, QrCode, KeyRound, ArrowUp, ArrowDown } from "lucide-react";
import { fetchJson, postJson } from "@/lib/csc-utils";

type WaStatus = {
  bridge_online: boolean;
  connected: boolean;
  user?: string;
  hasQr?: boolean;
  qrAgeSec?: number | null;
  forwarded?: number;
  sent?: number;
  uptimeSec?: number;
};

export function WhatsAppSetup() {
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [pairErr, setPairErr] = useState("");
  const [pairing, setPairing] = useState(false);

  const { data: st, isLoading } = useQuery<WaStatus>({
    queryKey: ["wa"],
    queryFn: () => fetchJson("/api/wa"),
    refetchInterval: 5000,
  });

  // clear stale pairing code once connected
  const [wasConnected, setWasConnected] = useState(false);
  useEffect(() => {
    if (st?.connected && !wasConnected) {
      setPairCode("");
      setPairErr("");
      setWasConnected(true);
    } else if (!st?.connected && wasConnected) {
      setWasConnected(false);
    }
  }, [st?.connected, wasConnected]);

  async function getPairCode() {
    setPairErr("");
    setPairCode("");
    if (!/^\d{10,13}$/.test(phone.replace(/\D/g, ""))) {
      setPairErr("10-digit number likhein (e.g. 9876543210)");
      return;
    }
    setPairing(true);
    try {
      const j = await postJson<{ code?: string; error?: string }>("/api/wa", { action: "pair", phone });
      if (j.code) setPairCode(j.code);
      else setPairErr(j.error || "Pairing code nahi mila");
    } catch (e) {
      setPairErr((e as Error).message);
    }
    setPairing(false);
  }

  if (isLoading || !st) return <Skeleton className="h-72 rounded-xl" />;

  const connected = st.connected && st.bridge_online;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* status */}
      <Card className={`shadow-sm ${connected ? "border-emerald-300 bg-emerald-50/60" : "border-amber-300 bg-amber-50/60"}`}>
        <CardContent className="flex items-center gap-3 p-4">
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                connected ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">
              {!st.bridge_online
                ? "Bridge offline — server pe bridge restart karo"
                : connected
                  ? "WhatsApp connected ✓"
                  : "Connect nahi he — QR scan ya pairing code use karo"}
            </p>
            {connected && st.user && (
              <p className="text-xs text-slate-500">
                Business number: +{String(st.user).split(":")[0]}
              </p>
            )}
          </div>
          <Smartphone className={`h-5 w-5 shrink-0 ${connected ? "text-emerald-600" : "text-amber-600"}`} />
        </CardContent>
      </Card>

      {/* counters */}
      {connected && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <ArrowDown className="mx-auto h-4 w-4 text-teal-600" />
              <p className="mt-1 text-2xl font-bold text-slate-900">{st.forwarded ?? 0}</p>
              <p className="text-[11px] text-slate-400">customer messages aaye</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <ArrowUp className="mx-auto h-4 w-4 text-emerald-600" />
              <p className="mt-1 text-2xl font-bold text-slate-900">{st.sent ?? 0}</p>
              <p className="text-[11px] text-slate-400">bot ne replies bheje</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* QR */}
      {!connected && (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <QrCode className="h-4 w-4 text-emerald-600" /> QR se link karo
            </p>
            <div className="mx-auto w-fit rounded-xl bg-white p-3 shadow">
              <img
                src={`/api/wa/qr?t=${Math.floor(Date.now() / 25000)}`}
                alt="WhatsApp QR"
                className="h-56 w-56"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <ol className="list-inside list-decimal space-y-1 text-xs text-slate-500">
              <li>Phone me WhatsApp kholein → Settings</li>
              <li>Linked devices → Link a device</li>
              <li>Is QR ko scan karo</li>
            </ol>
            <p className="text-center text-[11px] text-slate-400">
              QR har ~30 sec me refresh hota he
            </p>
          </CardContent>
        </Card>
      )}

      {/* pairing code */}
      {!connected && (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <KeyRound className="h-4 w-4 text-teal-600" /> Phone number se link (QR ka option 2)
            </p>
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="numeric"
                placeholder="Apna WhatsApp number (9876543210)"
                className="flex-1 border-slate-200"
              />
              <Button
                onClick={getPairCode}
                disabled={pairing}
                className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {pairing ? "…" : "Get Code"}
              </Button>
            </div>
            {pairErr && <p className="text-xs text-red-500">{pairErr}</p>}
            {pairCode && (
              <div className="space-y-2">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 py-3 text-center text-3xl font-bold tracking-[0.35em] text-emerald-700">
                  {pairCode}
                </div>
                <ol className="list-inside list-decimal space-y-1 text-xs text-slate-500">
                  <li>WhatsApp → Linked devices</li>
                  <li>Link with phone number instead pe tap karo</li>
                  <li>Ye code type karo (60 sec me expire)</li>
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-[11px] text-slate-400">
        Baileys free bridge — aapka personal WhatsApp hi business number he. Bulk/spam mat karo,
        number ban ho sakta he.
      </p>
    </div>
  );
}
