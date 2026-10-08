'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, inr, prettyPhone, fmtDate, fmtDateTime, StatusBadge, fieldLabel, docLabel, DOC_STATUS_META } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Search, Eye, Loader2, ChevronLeft, ChevronRight, MessageSquare, FileImage, CheckCircle2, XCircle, Clock, User, CreditCard, History } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type AppRow = {
  applicationId: string; applicationNumber: string; customerPhone: string; serviceId: string
  status: string; govFee: number | null; serviceCharge: number | null; gst: number | null; totalFee: number | null
  createdAt: string; updatedAt: string
  service: { serviceName: string; category: string }
  payments: { amount: number; paidAt: string }[]
  _count: { documents: number; fieldValues: number }
}

type Detail = {
  application: AppRow & { payments: { paymentId: string; amount: number; gateway: string; transactionId: string; status: string; createdAt: string; paidAt: string | null }[]; receipts: { receiptId: string; amount: number }[]; tasks: { taskId: string; status: string; note: string; createdAt: string }[]; statusHistory: { id: number; oldStatus: string; newStatus: string; note: string; createdAt: string }[] }
  fieldDefs: { fieldKey: string; label: string; fieldType: string }[]
  docDefs: { docKey: string; label: string }[]
  messages: { id: number; direction: string; body: string; createdAt: string }[]
}

const STATUS_FILTERS = ['SUBMITTED', 'PAID', 'IN_PROGRESS', 'APPROVED', 'DELIVERED', 'REJECTED', 'DRAFT']
const NEXT_ACTIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['IN_PROGRESS', 'APPROVED', 'REJECTED'],
  PAID: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['APPROVED', 'REJECTED'],
  APPROVED: ['DELIVERED', 'REJECTED'],
  DELIVERED: [],
  REJECTED: ['IN_PROGRESS'],
}

export function Applications() {
  const [apps, setApps] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [service, setService] = useState('')
  const [services, setServices] = useState<{ serviceId: string; serviceName: string }[]>([])
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const { toast } = useToast()
  const perPage = 12

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (service) params.set('service', service)
      if (q) params.set('q', q)
      const res = await api<{ applications: AppRow[] }>(`/api/applications?${params}`)
      setApps(res.applications)
    } finally {
      setLoading(false)
    }
  }, [status, service, q])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
  useEffect(() => { api<{ services: { serviceId: string; serviceName: string }[] }>('/api/services').then(r => setServices(r.services)).catch(() => {}) }, [])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setActionNote('')
    try {
      const res = await api<Detail>(`/api/applications/${id}`)
      setDetail(res)
    } finally {
      setDetailLoading(false)
    }
  }

  const doStatus = async (newStatus: string) => {
    if (!detail) return
    setActionBusy(true)
    try {
      await api(`/api/applications/${detail.application.applicationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, note: actionNote }),
      })
      toast({ title: 'Status update ho gaya', description: `${detail.application.applicationNumber || detail.application.applicationId} → ${newStatus}` })
      setDetail(null)
      load()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Update fail', variant: 'destructive' })
    } finally {
      setActionBusy(false)
    }
  }

  const paged = apps.slice(page * perPage, (page + 1) * perPage)
  const totalPages = Math.max(1, Math.ceil(apps.length / perPage))
  const app = detail?.application
  const actions = app ? (NEXT_ACTIONS[app.status] || []) : []

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Application no / phone se search karein..." className="pl-9 bg-white" />
        </div>
        <Select value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(0) }}>
          <SelectTrigger className="w-full sm:w-44 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sab Status</SelectItem>
            {STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={service || 'all'} onValueChange={(v) => { setService(v === 'all' ? '' : v); setPage(0) }}>
          <SelectTrigger className="w-full sm:w-52 bg-white"><SelectValue placeholder="Service" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Sab Services</SelectItem>
            {services.map((s) => <SelectItem key={s.serviceId} value={s.serviceId}>{s.serviceName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left font-medium px-4 py-3">Application</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Service</th>
                <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Customer</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Fees</th>
                <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Docs</th>
                <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-400">Koi application nahi mili</td></tr>
              ) : paged.map((a) => (
                <tr key={a.applicationId} className="border-b last:border-0 hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{a.applicationNumber || '—'}</p>
                    <p className="text-xs text-slate-400">{a.serviceId}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">{a.service?.serviceName || a.serviceId}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{prettyPhone(a.customerPhone)}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 hidden md:table-cell font-medium">{inr(a.payments?.[0]?.amount ?? a.totalFee)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{a._count.documents} docs</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{fmtDate(a.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openDetail(a.applicationId)}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {apps.length > perPage && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50">
            <p className="text-xs text-slate-500">{page * perPage + 1}–{Math.min((page + 1) * perPage, apps.length)} of {apps.length}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(open) => { if (!open && !detailLoading) setDetail(null) }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          {detailLoading || !app ? (
            <>
              <DialogTitle className="sr-only">Application Detail</DialogTitle>
              <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                  {app.applicationNumber || app.applicationId}
                  <StatusBadge status={app.status} />
                </DialogTitle>
                <DialogDescription>
                  {detail.application.service?.serviceName} · {prettyPhone(app.customerPhone)} · {fmtDateTime(app.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid md:grid-cols-2 gap-4 mt-2">
                {/* Form fields */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><User className="h-4 w-4 text-emerald-600" /> Form Data ({detail.application._count?.fieldValues ?? detail.fieldDefs.length})</h4>
                  <div className="rounded-lg border bg-slate-50/50 divide-y max-h-52 overflow-y-auto">
                    {detail.application.fieldValues?.length === 0 && <p className="text-xs text-slate-400 p-3">Koi field data nahi</p>}
                    {detail.application.fieldValues?.map((fv) => (
                      <div key={fv.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                        <span className="text-slate-500">{fieldLabel(fv.fieldKey, detail.fieldDefs)}</span>
                        <span className="font-medium text-slate-800 text-right break-all">{fv.fieldValue}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Documents */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><FileImage className="h-4 w-4 text-emerald-600" /> Documents ({detail.application.documents?.length || 0})</h4>
                  <div className="rounded-lg border bg-slate-50/50 divide-y max-h-52 overflow-y-auto">
                    {detail.application.documents?.length === 0 && <p className="text-xs text-slate-400 p-3">Koi document nahi</p>}
                    {detail.application.documents?.map((d) => {
                      const dm = DOC_STATUS_META[d.status] || DOC_STATUS_META.RECEIVED
                      return (
                        <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{docLabel(d.docKey, detail.docDefs)}</p>
                            <p className="text-xs text-slate-400">{d.mimeType || 'file'}</p>
                          </div>
                          <Badge variant="outline" className={dm.className}>{dm.label}</Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Payment */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-emerald-600" /> Payment</h4>
                  <div className="rounded-lg border bg-slate-50/50 p-3 text-sm space-y-1.5">
                    {app.payments?.length === 0 && <p className="text-xs text-slate-400">Koi payment nahi</p>}
                    {app.payments?.slice(0, 2).map((p) => (
                      <div key={p.paymentId} className="flex justify-between gap-2">
                        <span className="text-slate-500">{p.gateway} · {p.transactionId}</span>
                        <span className="font-medium">{inr(p.amount)} <StatusBadge status={p.status} className="ml-1" /></span>
                      </div>
                    ))}
                    {app.govFee !== null && (
                      <div className="pt-1.5 border-t text-xs text-slate-500">
                        Gov fee {inr(app.govFee)} + Service {inr(app.serviceCharge)} + GST {inr(app.gst)} = <b className="text-slate-700">{inr(app.totalFee)}</b>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><History className="h-4 w-4 text-emerald-600" /> Status Timeline</h4>
                  <div className="rounded-lg border bg-slate-50/50 p-3 max-h-40 overflow-y-auto space-y-2">
                    {detail.application.statusHistory?.map((h) => (
                      <div key={h.id} className="flex items-start gap-2 text-sm">
                        <Clock className="h-3.5 w-3.5 text-slate-300 mt-0.5" />
                        <div>
                          <p className="text-slate-700">{h.oldStatus ? `${h.oldStatus} → ` : ''}<b>{h.newStatus}</b></p>
                          <p className="text-xs text-slate-400">{fmtDateTime(h.createdAt)} {h.note && `· ${h.note}`}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Customer messages */}
              {detail.messages.length > 0 && (
                <div className="mt-1">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-emerald-600" /> Recent WhatsApp Messages</h4>
                  <div className="rounded-lg border bg-slate-50/50 divide-y max-h-36 overflow-y-auto">
                    {detail.messages.map((m) => (
                      <div key={m.id} className="px-3 py-2 text-sm flex gap-2 items-start">
                        <Badge variant="outline" className={m.direction === 'IN' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}>{m.direction === 'IN' ? '←' : '→'}</Badge>
                        <span className="text-slate-600 flex-1">{m.body}</span>
                        <span className="text-xs text-slate-400 shrink-0">{fmtDateTime(m.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {actions.length > 0 && (
                <div className="mt-2 pt-4 border-t">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Actions — Status Change</h4>
                  <Textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} placeholder="Note (optional) — jaise: document verify ho gaya" className="mb-3 min-h-[60px]" />
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <Button key={a} size="sm" className={a === 'REJECTED' ? 'bg-red-600 hover:bg-red-700 gap-1.5' : 'bg-emerald-600 hover:bg-emerald-700 gap-1.5'} disabled={actionBusy} onClick={() => doStatus(a)}>
                        {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : a === 'REJECTED' ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {a === 'REJECTED' ? 'Reject Karein' : a.replace('_', ' ')}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
