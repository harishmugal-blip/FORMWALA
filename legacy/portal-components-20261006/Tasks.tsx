'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, inr, prettyPhone, fmtDateTime, StatusBadge } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, CheckCircle2, XCircle, PlayCircle, ClipboardCheck, User, FileImage } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type Task = {
  taskId: string; applicationNumber: string; status: string; note: string; operatorPhone: string; createdAt: string
  application: {
    applicationId: string; customerPhone: string; status: string
    service: { serviceName: string; category: string }
    _count: { documents: number; fieldValues: number }
  }
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('PENDING')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ tasks: Task[] }>(`/api/tasks${tab === 'ALL' ? '' : `?status=${tab}`}`)
      setTasks(res.tasks)
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  const act = async (taskId: string, action: 'APPROVE' | 'REJECT' | 'PROGRESS') => {
    setBusy(taskId)
    try {
      await api(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ action, note: notes[taskId] || '' }) })
      toast({ title: action === 'APPROVE' ? 'Approve ho gaya ✅' : action === 'REJECT' ? 'Reject ho gaya' : 'Task in progress', description: 'Application status bhi update ho gaya' })
      load()
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Action fail', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="PENDING" className="gap-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800"><ClipboardCheck className="h-4 w-4" /> Pending</TabsTrigger>
          <TabsTrigger value="IN_PROGRESS" className="gap-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800"><PlayCircle className="h-4 w-4" /> In Progress</TabsTrigger>
          <TabsTrigger value="DONE" className="gap-1.5 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Done</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : tasks.length === 0 ? (
        <Card className="border-slate-200"><CardContent className="py-14 text-center text-slate-400">
          <ClipboardCheck className="h-10 w-10 mx-auto text-slate-200 mb-3" />
          Is tab mein koi task nahi
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {tasks.map((t) => (
            <Card key={t.taskId} className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-800">{t.applicationNumber || t.taskId}</p>
                      <StatusBadge status={t.status} />
                      <StatusBadge status={t.application.status} className="hidden sm:inline-flex" />
                    </div>
                    <p className="text-sm text-slate-600">{t.application.service?.serviceName || t.application.serviceId}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {prettyPhone(t.application.customerPhone)}</span>
                      <span className="flex items-center gap-1"><FileImage className="h-3 w-3" /> {t.application._count.documents} documents</span>
                      <span>{t.application._count.fieldValues} form fields</span>
                      <span>{fmtDateTime(t.createdAt)}</span>
                    </div>
                  </div>

                  <div className="lg:w-96 space-y-2">
                    <Textarea
                      value={notes[t.taskId] ?? t.note}
                      onChange={(e) => setNotes({ ...notes, [t.taskId]: e.target.value })}
                      placeholder="Verification note likhein (optional)..."
                      className="min-h-[52px] text-sm"
                      disabled={t.status !== 'PENDING' && t.status !== 'IN_PROGRESS'}
                    />
                    {t.status === 'PENDING' && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 flex-1" disabled={busy === t.taskId} onClick={() => act(t.taskId, 'APPROVE')}>
                          {busy === t.taskId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50" disabled={busy === t.taskId} onClick={() => act(t.taskId, 'PROGRESS')}>
                          <PlayCircle className="h-3.5 w-3.5" /> Progress
                        </Button>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 gap-1.5" disabled={busy === t.taskId} onClick={() => act(t.taskId, 'REJECT')}>
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                    {t.status === 'DONE' && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">Verified & Approved</Badge>}
                    {t.status === 'REJECTED' && <Badge className="bg-red-50 text-red-700 border-red-200" variant="outline">Rejected</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
