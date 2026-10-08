'use client'

import { useEffect, useState } from 'react'
import { api, inr, timeAgo, StatusBadge } from './shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { FileText, Wallet, ClipboardCheck, MessageSquare, TrendingUp, LayoutGrid } from 'lucide-react'

type Stats = {
  kpis: { totalApps: number; paidApps: number; pendingTasks: number; activeConvos: number; services: number; revenue: number; todayRevenue: number }
  revenueTrend: { label: string; amount: number; count: number; date: string }[]
  byService: { service: string; count: number }[]
  byStatus: { status: string; count: number }[]
  activity: { id: number; applicationNumber: string; service: string; phone: string; newStatus: string; time: string }[]
}

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: '#f59e0b', PAID: '#14b8a6', IN_PROGRESS: '#f97316',
  APPROVED: '#10b981', DELIVERED: '#16a34a', REJECTED: '#ef4444', DRAFT: '#94a3b8',
}

export function Dashboard({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Stats>('/api/stats').then(setStats).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const kpis = [
    { label: 'Total Applications', value: stats.kpis.totalApps, sub: `${stats.kpis.paidApps} paid pipeline mein`, icon: FileText, color: 'text-emerald-600 bg-emerald-50', view: 'applications' },
    { label: 'Total Revenue', value: inr(stats.kpis.revenue), sub: `Aaj: ${inr(stats.kpis.todayRevenue)}`, icon: Wallet, color: 'text-teal-600 bg-teal-50', view: 'payments' },
    { label: 'Pending Tasks', value: stats.kpis.pendingTasks, sub: 'Operator verification', icon: ClipboardCheck, color: 'text-amber-600 bg-amber-50', view: 'tasks' },
    { label: 'Active Conversations', value: stats.kpis.activeConvos, sub: `${stats.kpis.services} services live`, icon: MessageSquare, color: 'text-orange-600 bg-orange-50', view: 'conversations' },
  ]

  const hasTrend = stats.revenueTrend.some((d) => d.amount > 0)

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => onNavigate(k.view)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className={k.color + ' h-10 w-10 rounded-lg flex items-center justify-center'}>
                  <k.icon className="h-5 w-5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-3">{k.value}</p>
              <p className="text-sm font-medium text-slate-600">{k.label}</p>
              <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Revenue trend */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Revenue — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {hasTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.revenueTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => [inr(v), 'Revenue']} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2.5} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                <TrendingUp className="h-8 w-8 text-slate-200" />
                Abhi 7 din mein koi paid payment nahi
              </div>
            )}
          </CardContent>
        </Card>

        {/* By status donut */}
        <Card className="border-slate-200 shadow-sm min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={stats.byStatus} dataKey="count" nameKey="status" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {stats.byStatus.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center">
              {stats.byStatus.map((s) => (
                <span key={s.status} className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full inline-block" style={{ background: STATUS_COLORS[s.status] || '#94a3b8' }} />
                  {s.status.replace('_', ' ')}: {s.count}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 min-w-0">
        {/* By service */}
        <Card className="border-slate-200 shadow-sm min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-emerald-600" /> Top Services (Applications)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byService} layout="vertical" margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="service" width={120} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="border-slate-200 shadow-sm min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto space-y-1">
            {stats.activity.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">Koi activity nahi</p>}
            {stats.activity.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2 px-2 rounded-lg hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {a.applicationNumber || a.phone} <span className="text-slate-400 font-normal">→ {a.newStatus}</span>
                  </p>
                  <p className="text-xs text-slate-400">{a.service} · {a.phone}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={a.newStatus} />
                  <span className="text-xs text-slate-400 w-16 text-right">{timeAgo(a.time)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
