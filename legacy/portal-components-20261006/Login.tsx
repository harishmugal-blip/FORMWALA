'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from './shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api('/api/auth', { method: 'POST', body: JSON.stringify({ password }) })
      onLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="h-14 w-14 rounded-2xl bg-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-600/30">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">CSC Smart Seva</h1>
            <p className="text-sm text-slate-500 mt-1">Admin Portal — sab kuch ek jagah</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="password" className="text-sm font-medium text-slate-700 mb-1.5 block">Admin Password</label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password daalein"
                className="h-11"
                autoFocus
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            <Button type="submit" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Login Karein'}
            </Button>
          </form>
          <p className="text-xs text-center text-slate-400 mt-6">Default password: <code className="bg-slate-100 px-1.5 py-0.5 rounded">csc-admin-2026</code></p>
        </div>
      </div>
    </div>
  )
}

export type ViewKey = 'dashboard' | 'applications' | 'tasks' | 'services' | 'payments' | 'conversations' | 'settings'

export const NAV_ITEMS: { key: ViewKey; label: string; hint: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', hint: 'Overview & stats', icon: 'layout' },
  { key: 'applications', label: 'Applications', hint: 'Saari applications', icon: 'file' },
  { key: 'tasks', label: 'Operator Tasks', hint: 'Verify & approve', icon: 'check' },
  { key: 'services', label: 'Services', hint: '14 services config', icon: 'grid' },
  { key: 'payments', label: 'Payments', hint: 'Transactions', icon: 'wallet' },
  { key: 'conversations', label: 'Conversations', hint: 'Live chats', icon: 'chat' },
  { key: 'settings', label: 'Settings', hint: 'System config', icon: 'gear' },
]

export function useAuth() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    api<{ authed: boolean }>('/api/auth')
      .then((res) => { if (alive) setAuthed(res.authed) })
      .catch(() => { if (alive) setAuthed(false) })
    return () => { alive = false }
  }, [])
  const logout = useCallback(async () => {
    await api('/api/auth', { method: 'DELETE' }).catch(() => {})
    setAuthed(false)
  }, [])
  return { authed, logout, refreshAuth: () => {} }
}
