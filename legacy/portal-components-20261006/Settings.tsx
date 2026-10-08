'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, fmtDateTime } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, Settings2, KeyRound, Info } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type Config = { id: number; configKey: string; configValue: string; description: string; updatedAt: string; masked: boolean }

const GROUPS: { name: string; keys: string[]; hint: string }[] = [
  { name: 'WhatsApp Cloud API', keys: ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_API_VERSION', 'ADMIN_WHATSAPP_NUMBER'], hint: 'Meta business account se milta hai. Live karne ke liye actual token daalein.' },
  { name: 'Payments (Razorpay)', keys: ['PAYMENT_MODE', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'], hint: 'PAYMENT_MODE=RAZORPAY_LIVE karne se real payment shuru hota hai.' },
  { name: 'System', keys: ['PORTAL_MODE', 'GST_PERCENT', 'APP_NUMBER_PREFIX', 'REMINDER_MAX_PER_APP', 'REMINDER_QUIET_START', 'REMINDER_QUIET_END'], hint: 'Bot ke general behavior settings.' },
]

export function Settings() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ configs: Config[] }>('/api/config')
      setConfigs(res.configs)
      setDrafts({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (key: string) => {
    setBusy(key)
    try {
      await api('/api/config', { method: 'PATCH', body: JSON.stringify({ configKey: key, configValue: drafts[key] }) })
      toast({ title: 'Config save ho gaya ✅', description: key })
      await load()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Save fail', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>

  const byKey = Object.fromEntries(configs.map((c) => [c.configKey, c]))

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
        <Info className="h-4 w-4 text-sky-600 mt-0.5 shrink-0" />
        <p className="text-sm text-sky-900">
          Ye values <b>n8n workflows</b> bhi padhte hain (system_config table). Yahan se token/keys update karte hi bot naye settings use karega — n8n restart ki zaroorat nahi.
        </p>
      </div>

      {GROUPS.map((g) => (
        <Card key={g.name} className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-1">
              {g.name.includes('WhatsApp') ? <KeyRound className="h-4 w-4 text-emerald-600" /> : <Settings2 className="h-4 w-4 text-emerald-600" />}
              <h3 className="font-semibold text-slate-800">{g.name}</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">{g.hint}</p>
            <div className="space-y-3">
              {g.keys.map((k) => {
                const c = byKey[k]
                if (!c) return null
                const draft = drafts[k]
                const changed = draft !== undefined && draft !== c.configValue
                return (
                  <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="sm:w-64 shrink-0">
                      <p className="text-sm font-medium text-slate-700 font-mono text-xs">{k}</p>
                      <p className="text-xs text-slate-400 truncate">{c.description}</p>
                    </div>
                    <Input
                      className="flex-1 bg-white font-mono text-sm"
                      value={draft ?? c.configValue}
                      onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })}
                      placeholder="Value daalein"
                    />
                    <div className="flex items-center gap-2 sm:w-36 sm:justify-end">
                      {c.masked && c.configValue && !c.configValue.startsWith('SET_YOUR') && <Badge variant="outline" className="text-[10px] bg-slate-50">masked</Badge>}
                      <Button size="sm" className={'gap-1.5 ' + (changed ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-200 text-slate-400 hover:bg-slate-200')} disabled={!changed || busy === k} onClick={() => save(k)}>
                        {busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-slate-400 text-center">Last refreshed: {fmtDateTime(new Date())}</p>
    </div>
  )
}
