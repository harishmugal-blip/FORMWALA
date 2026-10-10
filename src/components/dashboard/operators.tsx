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
  Store,
  Plus,
  Search,
  Smartphone,
  KeyRound,
  Calendar,
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  Share2,
  Trash2,
  Edit,
  Clock,
  IndianRupee,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { fetchJson, postJson, patchJson, inr } from "@/lib/csc-utils";
import { useToast } from "@/hooks/use-toast";

export type Operator = {
  id: number;
  operator_id: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  whatsapp_number: string;
  pin: string;
  role: string;
  city: string;
  state: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  plan: "BASIC" | "PRO" | "ENTERPRISE";
  plan_price: number;
  valid_till: string;
  auto_notify: boolean;
  total_applications: number;
  created_at: string;
};

export function Operators() {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isFetching, refetch } = useQuery<{ ok: boolean; operators: Operator[] }>({
    queryKey: ["operators"],
    queryFn: () => fetchJson("/api/operators"),
    refetchInterval: 30000,
  });

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;

  const operators = data.operators || [];

  const filtered = operators.filter((op) => {
    if (planFilter !== "ALL" && op.plan !== planFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      op.shop_name.toLowerCase().includes(q) ||
      op.owner_name.toLowerCase().includes(q) ||
      op.phone.includes(q) ||
      op.operator_id.toLowerCase().includes(q) ||
      (op.city && op.city.toLowerCase().includes(q))
    );
  });

  const activeCount = operators.filter((o) => o.status === "ACTIVE").length;
  const totalApps = operators.reduce((acc, o) => acc + (o.total_applications || 0), 0);
  const monthlyRevenue = operators.reduce((acc, o) => acc + (o.status === "ACTIVE" ? o.plan_price || 999 : 0), 0);

  const togglePin = (id: string) => {
    setRevealedPins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "कॉपी हो गया! 📋", description: `${label}: ${text}` });
  };

  const shareWhatsAppDetails = (op: Operator) => {
    const rawPhone = op.phone.replace(/\D/g, "").slice(-10);
    const domain = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const text = encodeURIComponent(
      `नमस्ते ${op.owner_name} जी!\n\n` +
      `🎉 आपका *CSC Smart Seva & AI FormBot* पोर्टल सफलतापूर्वक एक्टिवेट हो गया है!\n\n` +
      `🏪 दुकान का नाम: *${op.shop_name}*\n` +
      `🆔 पार्टनर आईडी: *${op.operator_id}*\n` +
      `🔑 लॉगिन PIN: *${op.pin}*\n` +
      `🌐 लॉगिन लिंक: ${domain}/#operator\n` +
      `📅 वैधता: ${op.valid_till || "30 दिन"}\n\n` +
      `अब आपके ग्राहक आपके पोर्टल व AI बॉट के ज़रिये 16 सरकारी दस्तावेज़ बनवा सकेंगे। किसी भी सहायता के लिए संपर्क करें! 🙏`
    );
    window.open(`https://wa.me/91${rawPhone}?text=${text}`, "_blank");
  };

  const toggleStatus = async (op: Operator) => {
    const nextStatus = op.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await patchJson("/api/operators", {
        operator_id: op.operator_id,
        status: nextStatus,
      });
      toast({
        title: nextStatus === "ACTIVE" ? "दुकान चालू की गई ✅" : "दुकान बंद/सस्पेंड की गई ⚠️",
        description: `${op.shop_name} की स्थिति अब ${nextStatus} है।`,
      });
      queryClient.invalidateQueries({ queryKey: ["operators"] });
    } catch (e: any) {
      toast({ title: "त्रुटि", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                <Store className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                दुकानदार एवं साझेदार प्रबंधन (Multi-Dukandar & Partner SaaS)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              यहाँ से नए CSC संचालक / साइबर कैफे दुकानदार जोड़ें। हर दुकानदार को अलग लॉगिन PIN और उनका WhatsApp नंबर सेट करके यह पोर्टल बेचें।
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
            <Button
              size="sm"
              onClick={() => setIsAddOpen(true)}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
            >
              <Plus className="h-4 w-4" /> + नया दुकानदार जोड़ें
            </Button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-100/80 pt-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/80 p-3 border border-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">कुल जुड़े दुकानदार</p>
            <p className="text-lg font-extrabold text-slate-900">{operators.length} दुकानें</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 border border-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">सक्रिय दुकानें (Active)</p>
            <p className="text-lg font-extrabold text-emerald-700">{activeCount} एक्टिव</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 border border-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">मासिक सदस्यता आय (MRR)</p>
            <p className="text-lg font-extrabold text-slate-900">{inr(monthlyRevenue)}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-3 border border-emerald-100">
            <p className="text-[11px] font-medium text-slate-500">कुल प्रोसेस्ड आवेदन</p>
            <p className="text-lg font-extrabold text-teal-700">{totalApps} फॉर्म्स</p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="दुकानदार, मोबाइल नंबर, शहर या ऑपरेटर ID खोजें..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm shadow-xs outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {["ALL", "BASIC", "PRO", "ENTERPRISE"].map((p) => (
            <button
              key={p}
              onClick={() => setPlanFilter(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                planFilter === p
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {p === "ALL" ? "सभी प्लान" : p}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Store className="mx-auto h-8 w-8 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-700">कोई दुकानदार नहीं मिला</p>
          <p className="mt-1 text-xs text-slate-400">नया दुकानदार जोड़ने के लिए ऊपर दिए गए बटन पर क्लिक करें।</p>
        </div>
      )}

      {/* Operator Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((op) => {
          const isRevealed = revealedPins[op.operator_id];
          const cleanPhone = op.phone.replace(/\D/g, "").slice(-10);

          return (
            <div
              key={op.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                    <Store className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-slate-900">{op.shop_name}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                      <span>{op.owner_name}</span>
                      {op.city && <span className="text-slate-400">• {op.city}</span>}
                    </p>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] font-bold ${
                    op.status === "ACTIVE"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {op.status === "ACTIVE" ? "सक्रिय" : "बंद"}
                </Badge>
              </div>

              {/* Details Pill Box */}
              <div className="mt-3.5 space-y-2 rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Smartphone className="h-3.5 w-3.5 text-slate-400" /> WhatsApp / फोन:
                  </span>
                  <span className="font-semibold text-slate-800 font-mono">+91 {cleanPhone}</span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <KeyRound className="h-3.5 w-3.5 text-slate-400" /> लॉगिन PIN:
                  </span>
                  <div className="flex items-center gap-1 font-mono">
                    <span className="font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {isRevealed ? op.pin : "••••"}
                    </span>
                    <button
                      onClick={() => togglePin(op.operator_id)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => copyText(op.pin, "लॉगिन PIN")}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> प्लान एवं वैधता:
                  </span>
                  <span className="font-medium text-slate-700">
                    <Badge variant="secondary" className="text-[10px] bg-slate-200 mr-1">
                      {op.plan}
                    </Badge>
                    {op.valid_till ? `तक ${op.valid_till}` : "लाइफटाइम"}
                  </span>
                </div>
              </div>

              {/* Stats & Applications counter */}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="font-mono text-[11px] text-slate-400">ID: {op.operator_id}</span>
                <span className="font-semibold text-emerald-700">
                  {op.total_applications} आवेदन पूरे किए
                </span>
              </div>

              {/* Action Buttons Footer */}
              <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => shareWhatsAppDetails(op)}
                  className="flex-1 gap-1.5 border-emerald-300 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <Share2 className="h-3.5 w-3.5" /> WhatsApp शेयर
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingOperator(op)}
                  className="gap-1 border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Edit className="h-3 w-3" /> एडिट
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleStatus(op)}
                  className={`text-xs ${
                    op.status === "ACTIVE"
                      ? "text-amber-600 hover:bg-amber-50"
                      : "text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {op.status === "ACTIVE" ? "सस्पेंड" : "सक्रिय"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Operator Dialog */}
      {isAddOpen && (
        <AddOperatorDialog
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["operators"] });
            setIsAddOpen(false);
          }}
        />
      )}

      {/* Edit Operator Dialog */}
      {editingOperator && (
        <EditOperatorDialog
          operator={editingOperator}
          open={!!editingOperator}
          onClose={() => setEditingOperator(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["operators"] });
            setEditingOperator(null);
          }}
        />
      )}
    </div>
  );
}

function AddOperatorDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [plan, setPlan] = useState("PRO");
  const [durationDays, setDurationDays] = useState(30);
  const [pin, setPin] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  const handleGeneratePin = () => {
    setPin(String(Math.floor(1000 + Math.random() * 9000)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName || !ownerName || !phone) {
      toast({ title: "कृपया सभी आवश्यक फ़ील्ड भरें", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await postJson<{ ok: boolean; message?: string; error?: string }>("/api/operators", {
        shop_name: shopName,
        owner_name: ownerName,
        phone,
        whatsapp_number: phone,
        pin,
        city,
        plan,
        duration_days: durationDays,
      });

      toast({
        title: "दुकानदार सफलतापूर्वक जुड़ गए! 🎉",
        description: res.message || `${shopName} को एक्टिवेट कर दिया गया है।`,
      });
      onSuccess();
    } catch (err: any) {
      toast({
        title: "जोड़ने में त्रुटि",
        description: err?.message || "कृपया दोबारा प्रयास करें।",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                नया दुकानदार / पार्टनर जोड़ें (+ Add Dukandar)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                दुकानदार का विवरण भरें। उसका व्यक्तिगत 4-अंकों का लॉगिन PIN जनरेट होगा।
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                दुकान / केंद्र का नाम *
              </label>
              <input
                type="text"
                required
                placeholder="उदा. शर्मा जन सेवा केंद्र"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                संचालक / मालिक का नाम *
              </label>
              <input
                type="text"
                required
                placeholder="उदा. रमेश शर्मा"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                WhatsApp / मोबाइल नंबर *
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                शहर / जिला
              </label>
              <input
                type="text"
                placeholder="उदा. बरेली, मेरठ, लखनऊ"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {/* Generated PIN */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-800">
                  व्यक्तिगत लॉगिन PIN (4 डिजिट)
                </label>
                <p className="text-[10px] text-slate-500">
                  इस गुप्त पिन से दुकानदार अपने डैशबोर्ड में लॉगिन करेगा।
                </p>
              </div>
              <button
                type="button"
                onClick={handleGeneratePin}
                className="text-[11px] font-semibold text-emerald-700 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> नया पिन बनाएँ
              </button>
            </div>
            <input
              type="text"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-2 w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-center text-lg font-mono font-extrabold text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          {/* Subscription Plan & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">सदस्यता प्लान</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-500"
              >
                <option value="BASIC">Basic (₹499/माह - 50 फॉर्म)</option>
                <option value="PRO">Pro (₹999/माह - असीमित)</option>
                <option value="ENTERPRISE">Enterprise (₹1,499/माह)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">वैधता अवधि</label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-500"
              >
                <option value={7}>7 दिन (फ्री ट्रायल)</option>
                <option value={30}>30 दिन (1 माह)</option>
                <option value={90}>90 दिन (3 माह)</option>
                <option value={365}>365 दिन (1 वर्ष)</option>
              </select>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              रद्द करें
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              {isSubmitting ? "एक्टिवेट हो रहा है..." : "दुकानदार एक्टिवेट करें"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditOperatorDialog({
  operator,
  open,
  onClose,
  onSuccess,
}: {
  operator: Operator;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [shopName, setShopName] = useState(operator.shop_name);
  const [ownerName, setOwnerName] = useState(operator.owner_name);
  const [pin, setPin] = useState(operator.pin);
  const [plan, setPlan] = useState(operator.plan);
  const [validTill, setValidTill] = useState(operator.valid_till || "");
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await patchJson("/api/operators", {
        operator_id: operator.operator_id,
        shop_name: shopName,
        owner_name: ownerName,
        pin,
        plan,
        valid_till: validTill,
      });

      toast({ title: "सफल! ✅", description: `${shopName} का विवरण सुरक्षित कर लिया गया है।` });
      onSuccess();
    } catch (e: any) {
      toast({ title: "त्रुटि", description: e?.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            {operator.shop_name} — विवरण एडिट करें
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-mono">
            ID: {operator.operator_id} | फोन: {operator.phone}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="block text-xs font-bold text-slate-700">दुकान का नाम</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">संचालक का नाम</label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">लॉगिन PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-bold outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700">प्लान</label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none"
              >
                <option value="BASIC">BASIC</option>
                <option value="PRO">PRO</option>
                <option value="ENTERPRISE">ENTERPRISE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700">वैधता की तारीख</label>
              <input
                type="date"
                value={validTill}
                onChange={(e) => setValidTill(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-3 gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            रद्द करें
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            {isSaving ? "सेव हो रहा है..." : "सुरक्षित करें"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
