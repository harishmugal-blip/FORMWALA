"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  MapPin,
  KeyRound,
  UserCheck,
  Edit3,
  IndianRupee,
  CheckCircle2,
  SlidersHorizontal,
  LayoutGrid,
  Table as TableIcon,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { fetchJson, patchJson, inr, SERVICE_EMOJI } from "@/lib/csc-utils";
import { useToast } from "@/hooks/use-toast";

export type Svc = {
  service_id: string;
  service_name: string;
  category: string;
  description: string;
  gov_fee: number;
  service_charge: number;
  gst_percent?: number;
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
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [editingService, setEditingService] = useState<Svc | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isFetching, refetch } = useQuery<{ services: Svc[] }>({
    queryKey: ["services"],
    queryFn: () => fetchJson("/api/services"),
    refetchInterval: 60000,
  });

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;

  const allServices = data.services;
  const categories = ["ALL", ...Array.from(new Set(allServices.map((s) => s.category).filter(Boolean)))];

  const filteredServices = allServices.filter((s) => {
    const matchesCat = selectedCategory === "ALL" || s.category === selectedCategory;
    if (!matchesCat) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(s.service_name ?? "").toLowerCase().includes(q) ||
      String(s.service_id ?? "").toLowerCase().includes(q) ||
      String(s.category ?? "").toLowerCase().includes(q)
    );
  });

  const activeCount = allServices.filter((s) => s.active).length;
  const avgFee = Math.round(
    allServices.reduce((acc, s) => acc + (s.total_fee || 0), 0) / (allServices.length || 1)
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Strip */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                <IndianRupee className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                दस्तावेज़ एवं सेवा शुल्क प्रबंधन (Service Fees Manager)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              यहाँ से किसी भी सरकारी दस्तावेज़ की सरकारी फीस, सेवा शुल्क या कुल शुल्क बदलें। यह रेट तुरंत WhatsApp बॉट, वेब चैटबॉट और पेमेंट लिंक पर लाइव लागू हो जाएगा।
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5 border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              रीफ्रेश
            </Button>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === "grid"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> ग्रिड
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  viewMode === "table"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" /> टेबल
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-100/80 pt-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">कुल दस्तावेज़ (Total)</p>
            <p className="text-lg font-extrabold text-slate-900">{allServices.length} Sevaayein</p>
          </div>
          <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">सक्रिय दस्तावेज़ (Active)</p>
            <p className="text-lg font-extrabold text-emerald-700">{activeCount} चालू</p>
          </div>
          <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">औसत ग्राहक शुल्क (Avg Fee)</p>
            <p className="text-lg font-extrabold text-slate-900">{inr(avgFee)}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-2.5 border border-emerald-100 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500">सिंक स्थिति (Sync)</p>
              <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> 100% Live Sync
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="दस्तावेज़ या सेवा खोजें (उदा. PAN, Aay, Ration)..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-xs outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {cat === "ALL" ? "सभी सेवाएँ" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredServices.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">कोई सेवा नहीं मिली</p>
          <p className="mt-1 text-xs text-slate-400">कृपया अपना सर्च शब्द या फ़िल्टर बदलकर दोबारा देखें।</p>
        </div>
      )}

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredServices.map((s) => (
            <div
              key={s.service_id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-2xl border border-slate-100">
                    {SERVICE_EMOJI[s.service_id] ?? "📄"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{s.service_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{s.category || s.service_id}</p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] font-bold ${
                    s.active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  {s.active ? "सक्रिय (ON)" : "बंद (OFF)"}
                </Badge>
              </div>

              <p className="mt-2.5 line-clamp-2 text-xs text-slate-500 min-h-8">{s.description || "सरकारी पोर्टल सेवा"}</p>

              <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-0.5">{s.fields} फ़ील्ड्स</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5">{s.docs} दस्तावेज़</span>
                {s.operator_required && (
                  <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-amber-700">
                    <UserCheck className="h-3 w-3" /> ऑपरेटर
                  </span>
                )}
                {s.otp_required && (
                  <span className="flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-teal-700">
                    <KeyRound className="h-3 w-3" /> OTP
                  </span>
                )}
                {s.status_tracking && (
                  <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    <MapPin className="h-3 w-3" /> ट्रैकिंग
                  </span>
                )}
              </div>

              {/* Fee Breakdown Box */}
              <div className="mt-4 rounded-lg bg-slate-50/80 p-2.5 border border-slate-100">
                <div className="grid grid-cols-3 gap-1 text-[11px] text-slate-500 text-center">
                  <div>
                    <span className="block text-[10px] text-slate-400">सरकारी फीस</span>
                    <span className="font-semibold text-slate-700">{inr(s.gov_fee)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">सेवा शुल्क</span>
                    <span className="font-semibold text-slate-700">{inr(s.service_charge)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">GST (18%)</span>
                    <span className="font-semibold text-slate-700">{inr(s.gst)}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Card Footer */}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">कुल ग्राहक शुल्क</p>
                  <p className="text-xl font-extrabold text-emerald-700">{inr(s.total_fee)}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingService(s)}
                  className="gap-1.5 border-emerald-300 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 shadow-xs"
                >
                  <Edit3 className="h-3.5 w-3.5" /> फीस बदलें
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table Matrix View */}
      {viewMode === "table" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3.5">दस्तावेज़ / सेवा (Service)</th>
                  <th className="px-3 py-3.5">श्रेणी</th>
                  <th className="px-3 py-3.5 text-right">सरकारी फीस</th>
                  <th className="px-3 py-3.5 text-right">CSC शुल्क</th>
                  <th className="px-3 py-3.5 text-right">GST</th>
                  <th className="px-3 py-3.5 text-right font-bold text-slate-900">कुल फीस (Total)</th>
                  <th className="px-3 py-3.5 text-center">स्थिति</th>
                  <th className="px-4 py-3.5 text-right">कार्रवाई</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredServices.map((s) => (
                  <tr key={s.service_id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{SERVICE_EMOJI[s.service_id] ?? "📄"}</span>
                        <div>
                          <p className="font-bold text-slate-800">{s.service_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{s.service_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px]">
                        {s.category || "General"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-slate-600">{inr(s.gov_fee)}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-600">{inr(s.service_charge)}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-400">{inr(s.gst)}</td>
                    <td className="px-3 py-3 text-right text-sm font-extrabold text-emerald-700">
                      {inr(s.total_fee)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold ${
                          s.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        {s.active ? "चालू" : "बंद"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingService(s)}
                        className="h-8 gap-1 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> फीस एडिट
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fee Edit Modal */}
      {editingService && (
        <EditFeeDialog
          service={editingService}
          open={!!editingService}
          onClose={() => setEditingService(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["services"] });
            queryClient.invalidateQueries({ queryKey: ["overview"] });
            setEditingService(null);
          }}
        />
      )}
    </div>
  );
}

function EditFeeDialog({
  service,
  open,
  onClose,
  onSuccess,
}: {
  service: Svc;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [govFee, setGovFee] = useState<number>(service.gov_fee || 0);
  const [serviceCharge, setServiceCharge] = useState<number>(service.service_charge || 0);
  const [gstPercent, setGstPercent] = useState<number>(service.gst_percent ?? 18);
  const [active, setActive] = useState<boolean>(service.active);
  const [isCustomTotal, setIsCustomTotal] = useState<boolean>(false);
  const [customTotal, setCustomTotal] = useState<number>(service.total_fee || 0);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  // Calculated numbers
  const calculatedGst = Math.round(((serviceCharge || 0) * (gstPercent || 0)) / 100);
  const calculatedTotal = Math.round((govFee || 0) + (serviceCharge || 0) + calculatedGst);
  const finalTotalFee = isCustomTotal ? customTotal : calculatedTotal;

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await patchJson<{ ok: boolean; message?: string }>("/api/services", {
        service_id: service.service_id,
        gov_fee: Number(govFee),
        service_charge: Number(serviceCharge),
        gst_percent: Number(gstPercent),
        total_fee: Number(finalTotalFee),
        active: active,
      });

      toast({
        title: "फीस अपडेट सफल! 🎉",
        description: `${service.service_name} की नई फीस ₹${finalTotalFee} सफलतापूर्वक सुरक्षित कर दी गई है।`,
      });

      onSuccess();
    } catch (err: any) {
      toast({
        title: "अपडेट विफल (Error)",
        description: err?.message || "फीस सेव करने में समस्या आई।",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-2xl border border-emerald-100">
              {SERVICE_EMOJI[service.service_id] ?? "📄"}
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {service.service_name} — शुल्क अपडेट
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 font-mono">
                Service ID: {service.service_id} | {service.category}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Inputs Row 1: Gov Fee & Service Charge */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                सरकारी शुल्क (Govt Fee ₹)
              </label>
              <input
                type="number"
                min="0"
                value={govFee}
                onChange={(e) => setGovFee(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <span className="text-[10px] text-slate-400">पोर्टल / सरकारी चालान चार्ज</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                CSC सेवा शुल्क (Service Charge ₹)
              </label>
              <input
                type="number"
                min="0"
                value={serviceCharge}
                onChange={(e) => setServiceCharge(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <span className="text-[10px] text-slate-400">कमीशन / ऑपरेटर शुल्क</span>
            </div>
          </div>

          {/* Inputs Row 2: GST % */}
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                GST प्रतिशत (% Rate)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={gstPercent}
                onChange={(e) => setGstPercent(Math.max(0, Number(e.target.value)))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <span className="text-[10px] text-slate-400">कमीशन पर GST (मानक 18%)</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <span className="block text-[10px] font-medium text-slate-500">निकाला गया GST</span>
              <span className="text-sm font-bold text-slate-800">{inr(calculatedGst)}</span>
            </div>
          </div>

          {/* Live Breakdown Math Card */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
            <p className="font-semibold text-emerald-900 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              लाइव शुल्क गणना (Live Fee Calculation)
            </p>
            <div className="mt-2 flex items-center justify-between text-slate-600 font-mono text-[11px]">
              <span>Govt ₹{govFee}</span>
              <span>+</span>
              <span>CSC ₹{serviceCharge}</span>
              <span>+</span>
              <span>GST ₹{calculatedGst}</span>
              <span>=</span>
              <span className="font-bold text-emerald-800 text-xs">₹{calculatedTotal}</span>
            </div>
          </div>

          {/* Final Total Fee & Custom Override */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-900">
                  अंतिम ग्राहक शुल्क (Final Customer Fee ₹)
                </label>
                <p className="text-[10px] text-slate-400">
                  {isCustomTotal ? "कस्टम शुल्क सेट किया गया है" : "ऑटो-कैलकुलेटेड राशि"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCustomTotal(!isCustomTotal);
                  if (!isCustomTotal) setCustomTotal(calculatedTotal);
                }}
                className="text-[11px] font-semibold text-emerald-700 hover:underline"
              >
                {isCustomTotal ? "ऑटो-कैलकुलेट करें" : "कस्टम वैल्यू सेट करें"}
              </button>
            </div>

            {isCustomTotal ? (
              <input
                type="number"
                min="0"
                value={customTotal}
                onChange={(e) => setCustomTotal(Math.max(0, Number(e.target.value)))}
                className="mt-2 w-full rounded-xl border border-emerald-400 bg-emerald-50/30 px-3 py-2 text-base font-extrabold text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-200"
              />
            ) : (
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-emerald-700">{inr(calculatedTotal)}</span>
                <span className="text-xs text-slate-400 font-medium">ग्राहक को यह चार्ज दिखेगा</span>
              </div>
            )}
          </div>

          {/* Active Status Switch */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div>
              <p className="text-xs font-bold text-slate-800">सेवा चालू रखें (Active on Portal)</p>
              <p className="text-[10px] text-slate-500">बंद करने पर नागरिक इस सेवा के लिए नया आवेदन नहीं कर पाएंगे।</p>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                active ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  active ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            रद्द करें (Cancel)
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isSaving ? "सेव हो रहा है..." : "शुल्क सुरक्षित करें (Save Fees)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
