'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, inr, prettyPhone, fmtDateTime } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatusBadge } from './shared'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Wallet, TrendingUp, CreditCard, Search } from 'lucide-react'

type Payment = {
  paymentId: string; applicationId: string; customerPhone: string; amount: number
  gateway: string; transactionId: string; status: string; createdAt: string; paidAt: string | null
  application: { applicationNumber: string; serviceId: string; service: { serviceName: string } } | null
}

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('PAID')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      const res = await api<{ payments: Payment[]; totalCollected: number }>(`/api/payments?${params}`)
      setPayments(res.payments)
      setTotal(res.totalCollected)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  const filtered = payments.filter((p) =>
    !q || p.customerPhone.includes(q) || p.transactionId.toLowerCase().includes(q.toLowerCase()) ||
    (p.application?.applicationNumber || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-11 w-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Wallet className="h-5 w-5" /></div>
            <div>
              <p className="text-xl font-bold text-slate-900">{inr(total)}</p>
              <p className="text-xs text-slate-500">Total Collected (Paid)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-11 w-11 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center"><TrendingUp className="h-5 w-5" /></div>
            <div>
              <p className="text-xl font-bold text-slate-900">{payments.filter(p => p.status === 'PAID').length}</p>
              <p className="text-xs text-slate-500">Successful Transactions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone / transaction id / application no..." className="pl-9 bg-white" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="all">Sab</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left font-medium px-4 py-3">Transaction</th>
                <th className="text-left font-medium px-4 py-3 hidden md:table-cell">Application</th>
                <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Customer</th>
                <th className="text-left font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3 hidden lg:table-cell">Paid At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-300" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400"><CreditCard className="h-8 w-8 mx-auto text-slate-200 mb-2" />Koi transaction nahi</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.paymentId} className="border-b last:border-0 hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.transactionId || p.paymentId}</p>
                    <p className="text-xs text-slate-400">{p.gateway}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-slate-700">{p.application?.applicationNumber || '—'}</p>
                    <p className="text-xs text-slate-400">{p.application?.service?.serviceName || p.application?.serviceId}</p>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">{prettyPhone(p.customerPhone)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{inr(p.amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-500">{fmtDateTime(p.paidAt || p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
