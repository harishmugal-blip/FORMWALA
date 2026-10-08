'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, inr, fmtDateTime, StatusBadge } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Grid3X3, Save, ExternalLink, Layers, FileText, Hash, Eye } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type Service = {
  serviceId: string; serviceName: string; category: string; description: string
  governmentFee: number; serviceCharge: number; gstPercent: number; totalFee: number
  portalUrl: string; portalType: string; active: string; processingSteps: string
  _count: { fields: number; documents: number; applications: number }
  pricing: { govFee: number; serviceCharge: number; gstPercent: number; gstAmount: number; totalFee: number } | null
}

type ServiceDetail = Service & {
  fields: { id: number; fieldKey: string; label: string; fieldType: string; question: string; required: string; fieldOrder: number }[]
  documents: { id: number; docKey: string; label: string; question: string; required: string; acceptedTypes: string; docOrder: number }[]
}

export function Services() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ServiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [feeDraft, setFeeDraft] = useState<{ govFee: number; serviceCharge: number; gstPercent: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ services: Service[] }>('/api/services')
      setServices(res.services)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await api<{ service: ServiceDetail }>(`/api/services/${id}`)
      setDetail(res.service)
      const p = res.service.pricing
      setFeeDraft({ govFee: p?.govFee ?? 0, serviceCharge: p?.serviceCharge ?? 0, gstPercent: p?.gstPercent ?? 18 })
    } finally {
      setDetailLoading(false)
    }
  }

  const savePricing = async () => {
    if (!detail || !feeDraft) return
    setBusy(true)
    try {
      await api(`/api/services/${detail.serviceId}`, { method: 'PATCH', body: JSON.stringify(feeDraft) })
      toast({ title: 'Pricing update ho gayi ✅', description: `${detail.serviceName} ka naya total auto-calculate ho gaya` })
      setDetail(null)
      load()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Save fail', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (svc: Service) => {
    const next = svc.active === 'TRUE' ? 'FALSE' : 'TRUE'
    try {
      await api(`/api/services/${svc.serviceId}`, { method: 'PATCH', body: JSON.stringify({ active: next }) })
      toast({ title: next === 'TRUE' ? 'Service on kar di' : 'Service off kar di', description: svc.serviceName })
      load()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Toggle fail', variant: 'destructive' })
    }
  }

  const draftTotal = feeDraft
    ? feeDraft.govFee + feeDraft.serviceCharge + Math.round(feeDraft.serviceCharge * feeDraft.gstPercent) / 100
    : 0

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {services.map((s) => (
            <Card key={s.serviceId} className={'border-slate-200 shadow-sm hover:shadow-md transition-shadow ' + (s.active !== 'TRUE' ? 'opacity-60' : '')}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[10px]">{s.category}</Badge>
                    <h3 className="font-semibold text-slate-800 mt-1.5 truncate">{s.serviceName}</h3>
                    <p className="text-xs text-slate-400 font-mono">{s.serviceId}</p>
                  </div>
                  <Switch checked={s.active === 'TRUE'} onCheckedChange={() => toggleActive(s)} />
                </div>

                <div className="flex items-baseline justify-between mt-3">
                  <div>
                    <p className="text-xl font-bold text-emerald-700">{inr(s.pricing?.totalFee ?? s.totalFee)}</p>
                    <p className="text-[11px] text-slate-400">Gov {inr(s.governmentFee)} + Service {inr(s.serviceCharge)} + GST {inr(s.pricing?.gstAmount ?? 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {s._count.fields} fields</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {s._count.documents} docs</span>
                  <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {s._count.applications} apps</span>
                </div>

                <Button size="sm" variant="outline" className="w-full mt-4 gap-1.5" onClick={() => openDetail(s.serviceId)}>
                  <Eye className="h-3.5 w-3.5" /> Configure Karein
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(open) => { if (!open && !detailLoading) setDetail(null) }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          {detailLoading || !detail ? (
            <>
              <DialogTitle className="sr-only">Service Configuration</DialogTitle>
              <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6"><Grid3X3 className="h-5 w-5 text-emerald-600" /> {detail.serviceName}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-3">
                  <span className="font-mono">{detail.serviceId}</span>
                  <Badge variant="outline" className="bg-slate-50">{detail.category}</Badge>
                  {detail.portalUrl && <a href={detail.portalUrl} target="_blank" rel="noreferrer" className="text-emerald-600 underline flex items-center gap-1">{detail.portalType || 'Portal'} <ExternalLink className="h-3 w-3" /></a>}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="pricing">
                <TabsList className="bg-slate-100">
                  <TabsTrigger value="pricing">Pricing</TabsTrigger>
                  <TabsTrigger value="fields">Fields ({detail.fields.length})</TabsTrigger>
                  <TabsTrigger value="docs">Documents ({detail.documents.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pricing" className="pt-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">Government Fee (₹)</label>
                      <Input type="number" value={feeDraft?.govFee ?? 0} onChange={(e) => setFeeDraft({ ...feeDraft!, govFee: Number(e.target.value) })} className="bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">Service Charge (₹)</label>
                      <Input type="number" value={feeDraft?.serviceCharge ?? 0} onChange={(e) => setFeeDraft({ ...feeDraft!, serviceCharge: Number(e.target.value) })} className="bg-white" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 block mb-1.5">GST %</label>
                      <Input type="number" value={feeDraft?.gstPercent ?? 18} onChange={(e) => setFeeDraft({ ...feeDraft!, gstPercent: Number(e.target.value) })} className="bg-white" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                    <div className="text-sm text-emerald-800">
                      Naya Total: <b className="text-lg">{inr(draftTotal)}</b>
                      <span className="text-xs text-emerald-600 block">GST auto-calculate hota hai service charge par</span>
                    </div>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={savePricing} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Karein
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="fields" className="pt-4">
                  <div className="rounded-lg border max-h-80 overflow-y-auto divide-y">
                    {detail.fields.map((f) => (
                      <div key={f.id} className="px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-700">{f.fieldOrder + 1}. {f.label}</p>
                          <div className="flex gap-1.5 items-center">
                            <Badge variant="outline" className="text-[10px] bg-slate-50">{f.fieldType}</Badge>
                            {f.required === 'TRUE' && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">required</Badge>}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{f.question}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="docs" className="pt-4">
                  <div className="rounded-lg border max-h-80 overflow-y-auto divide-y">
                    {detail.documents.map((d) => (
                      <div key={d.id} className="px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-700">{d.docOrder + 1}. {d.label}</p>
                          <div className="flex gap-1.5">
                            <Badge variant="outline" className="text-[10px] bg-slate-50">{d.acceptedTypes}</Badge>
                            {d.required === 'TRUE' && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">required</Badge>}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{d.question}</p>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              {detail._count?.applications ? (
                <p className="text-xs text-slate-400 mt-2">Is service ke {detail._count.applications} applications system mein hain</p>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
