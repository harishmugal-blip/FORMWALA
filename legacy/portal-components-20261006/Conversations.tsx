'use client'

import { useEffect, useState } from 'react'
import { api, prettyPhone, fmtDateTime, StatusBadge, timeAgo } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, MessagesSquare, LifeBuoy, Cpu } from 'lucide-react'

type Convo = {
  id: number; phone: string; state: string; serviceId: string; serviceName?: string
  contextData: string; handoffActive: string; updatedAt: string
}
type Handoff = { id: number; phone: string; name: string; reason: string; status: string; takenBy: string; createdAt: string }

const STATE_DESC: Record<string, string> = {
  NEW: 'Naya customer — service choose kar raha hai',
  CONFIRMED: 'Service confirm hui, fields shuru honge',
  FIELDS: 'Form fields collect ho rahe hain',
  DOCS: 'Documents collect ho rahe hain',
  PAYMENT: 'Payment ka wait hai',
  PAID: 'Payment ho gaya — task ban gaya',
}

export function Conversations() {
  const [convos, setConvos] = useState<Convo[]>([])
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    api<{ conversations: Convo[]; handoffs: Handoff[] }>('/api/conversations')
      .then((r) => { setConvos(r.conversations); setHandoffs(r.handoffs) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>

  return (
    <div className="space-y-4">
      {/* Handoffs first */}
      {handoffs.length > 0 && (
        <Card className="border-amber-200 shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-3"><LifeBuoy className="h-4 w-4" /> Human Handoff Queue ({handoffs.filter(h => h.status === 'WAITING').length} waiting)</h3>
            <div className="space-y-2">
              {handoffs.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{h.name || prettyPhone(h.phone)}</p>
                    <p className="text-xs text-slate-500">{h.reason} · {fmtDateTime(h.createdAt)}</p>
                  </div>
                  <Badge variant="outline" className={h.status === 'WAITING' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>{h.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3"><MessagesSquare className="h-4 w-4 text-emerald-600" /> Live Conversations ({convos.length})</h3>
          <div className="space-y-2">
            {convos.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">Koi active conversation nahi</p>}
            {convos.map((c) => {
              let ctx: Record<string, unknown> = {}
              try { ctx = JSON.parse(c.contextData || '{}') } catch { ctx = {} }
              const ctxKeys = Object.keys(ctx)
              return (
                <div key={c.id} className="rounded-lg border border-slate-100 overflow-hidden">
                  <button className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-slate-50 text-left" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{prettyPhone(c.phone)}</p>
                      <p className="text-xs text-slate-400 truncate">{c.serviceName || c.serviceId || '—'} · {STATE_DESC[c.state] || c.state}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.handoffActive === 'TRUE' && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">handoff</Badge>}
                      <StatusBadge status={c.state} />
                      <span className="text-xs text-slate-400 w-16 text-right">{timeAgo(c.updatedAt)}</span>
                    </div>
                  </button>
                  {expanded === c.id && (
                    <div className="border-t bg-slate-50/60 px-3 py-2.5 text-xs">
                      <p className="flex items-center gap-1.5 text-slate-500 font-medium mb-1.5"><Cpu className="h-3 w-3" /> Context Data (bot memory)</p>
                      {ctxKeys.length === 0 ? <p className="text-slate-400">Khali</p> : (
                        <div className="grid sm:grid-cols-2 gap-1.5">
                          {ctxKeys.map((k) => (
                            <div key={k} className="flex justify-between gap-2 bg-white rounded border border-slate-100 px-2 py-1">
                              <span className="text-slate-400 font-mono">{k}</span>
                              <span className="text-slate-700 font-medium truncate max-w-[180px]">{String(ctx[k]).substring(0, 40)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
