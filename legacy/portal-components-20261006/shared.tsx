'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── API helper ───────────────────────────────────────────────
export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

// ── Status badge ─────────────────────────────────────────────
export const STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  SUBMITTED: { label: 'Submitted', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  PAID: { label: 'Paid', className: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  DELIVERED: { label: 'Delivered', className: 'bg-green-100 text-green-800 border-green-300', dot: 'bg-green-600' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  // conversation states
  NEW: { label: 'New', className: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  FIELDS: { label: 'Fields', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  DOCS: { label: 'Documents', className: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  PAYMENT: { label: 'Payment', className: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  PENDING: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  DONE: { label: 'Done', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] || { label: status, className: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' }
  return (
    <Badge variant="outline" className={cn('font-medium', meta.className, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full mr-1.5 inline-block', meta.dot)} />
      {meta.label}
    </Badge>
  )
}

// ── Format helpers ───────────────────────────────────────────
export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'abhi'
  if (mins < 60) return `${mins}m pehle`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h pehle`
  const days = Math.floor(hrs / 24)
  return `${days}d pehle`
}

export function prettyPhone(p: string | null | undefined): string {
  if (!p) return '—'
  const digits = p.replace(/\D/g, '')
  if (digits.length === 12) return `+91 ${digits.substring(2, 7)} ${digits.substring(7)}`
  return p
}

// ── Field label helper ───────────────────────────────────────
export function fieldLabel(key: string, defs: { fieldKey: string; label: string }[]): string {
  const def = defs.find((d) => d.fieldKey === key)
  return def?.label || key
}

export function docLabel(key: string, defs: { docKey: string; label: string }[]): string {
  const def = defs.find((d) => d.docKey === key)
  return def?.label || key
}

export const DOC_STATUS_META: Record<string, { className: string; label: string }> = {
  RECEIVED: { className: 'bg-teal-50 text-teal-700 border-teal-200', label: 'Received' },
  VERIFIED: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Verified' },
  INVALID: { className: 'bg-red-50 text-red-700 border-red-200', label: 'Invalid' },
}
