'use client'

import { useState, useEffect } from 'react'
import { Login, useAuth, NAV_ITEMS, ViewKey } from './Login'
import { Dashboard } from './Dashboard'
import { Applications } from './Applications'
import { Tasks } from './Tasks'
import { Services } from './Services'
import { Payments } from './Payments'
import { Conversations } from './Conversations'
import { Settings } from './Settings'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { LayoutDashboard, FileText, ClipboardCheck, Grid3X3, Wallet, MessagesSquare, Settings2, ShieldCheck, LogOut, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  layout: LayoutDashboard, file: FileText, check: ClipboardCheck, grid: Grid3X3,
  wallet: Wallet, chat: MessagesSquare, gear: Settings2,
}

function NavList({ view, onNavigate }: { view: ViewKey; onNavigate: (v: string) => void }) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon] || LayoutDashboard
        const active = view === item.key
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
              active ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/60 border border-transparent'
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          </button>
        )
      })}
    </nav>
  )
}

export function PortalApp() {
  const { authed, logout } = useAuth()
  const [view, setView] = useState<ViewKey>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [view])

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <ShieldCheck className="h-10 w-10 text-emerald-600 animate-pulse" />
      </div>
    )
  }
  if (!authed) return <Login onLogin={() => window.location.reload()} />

  const navigate = (v: string) => { setView(v as ViewKey); setMobileOpen(false) }
  const currentTitle = NAV_ITEMS.find((n) => n.key === view)

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-slate-950 fixed inset-y-0 z-40">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800/80">
          <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">CSC Smart Seva</p>
            <p className="text-[10px] text-slate-500">Admin Portal v1.0</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList view={view} onNavigate={navigate} />
        </div>
        <div className="px-3 pb-4">
          <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 mb-2">
            <p className="text-xs text-slate-400">System Status</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-300 font-medium">WhatsApp Bot — Online</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">16 services · MOCK payment mode</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-500 hover:text-white hover:bg-slate-800 gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden fixed top-3 left-3 z-50 bg-white shadow-sm h-10 w-10">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-slate-950 border-slate-800 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800/80">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <p className="font-bold text-white text-sm">CSC Smart Seva</p>
          </div>
          <div className="px-3 py-4">
            <NavList view={view} onNavigate={navigate} />
          </div>
          <div className="px-3">
            <Button variant="ghost" size="sm" className="w-full justify-start text-slate-500 hover:text-white gap-2" onClick={logout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0 w-full">
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="pl-12 lg:pl-0">
            <h1 className="font-semibold text-slate-900">{currentTitle?.label}</h1>
            <p className="text-xs text-slate-400 hidden sm:block">{currentTitle?.hint}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-700">Bot Live</span>
            </div>
            <div className="h-9 w-9 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold">A</div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {view === 'dashboard' && <Dashboard onNavigate={navigate} />}
          {view === 'applications' && <Applications />}
          {view === 'tasks' && <Tasks />}
          {view === 'services' && <Services />}
          {view === 'payments' && <Payments />}
          {view === 'conversations' && <Conversations />}
          {view === 'settings' && <Settings />}
        </main>

        <footer className="mt-auto border-t border-slate-200 bg-white px-6 py-3.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <p>CSC Smart Seva — WhatsApp Seva Kendra Admin Portal</p>
            <p>25 n8n workflows · 16 services · India 🇮🇳</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
