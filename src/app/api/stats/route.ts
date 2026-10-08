import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isAuthed, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized()

  const [totalApps, paidApps, pendingTasks, activeConvos, services] = await Promise.all([
    db.application.count(),
    db.application.count({ where: { status: { in: ['SUBMITTED', 'PAID', 'IN_PROGRESS', 'APPROVED', 'DELIVERED'] } } }),
    db.operatorTask.count({ where: { status: 'PENDING' } }),
    db.conversationState.count({ where: { state: { in: ['CONFIRMED', 'FIELDS', 'DOCS', 'PAYMENT'] } } }),
    db.serviceCatalog.count({ where: { active: 'TRUE' } }),
  ])

  // revenue = sum of PAID payments
  const paidAgg = await db.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } })
  const revenue = paidAgg._sum.amount || 0

  // revenue last 7 days by day
  const since = new Date(Date.now() - 6 * 86400000)
  since.setHours(0, 0, 0, 0)
  const recentPayments = await db.payment.findMany({ where: { status: 'PAID', paidAt: { gte: since } }, select: { amount: true, paidAt: true } })
  const days: { date: string; label: string; amount: number; count: number }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(since.getTime() + i * 86400000)
    const next = new Date(d.getTime() + 86400000)
    const dayPayments = recentPayments.filter((p) => p.paidAt && p.paidAt >= d && p.paidAt < next)
    days.push({
      date: d.toISOString().substring(0, 10),
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      amount: dayPayments.reduce((s, p) => s + p.amount, 0),
      count: dayPayments.length,
    })
  }

  // applications by service (top 8)
  const grouped = await db.application.groupBy({ by: ['serviceId'], _count: true })
  const catalog = await db.serviceCatalog.findMany({ select: { serviceId: true, serviceName: true, category: true } })
  const byService = grouped
    .map((g) => ({
      service: catalog.find((c) => c.serviceId === g.serviceId)?.serviceName || g.serviceId,
      count: g._count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // applications by status
  const statusGrouped = await db.application.groupBy({ by: ['status'], _count: true })
  const byStatus = statusGrouped.map((g) => ({ status: g.status, count: g._count }))

  // recent activity: latest status history entries
  const recentHistory = await db.applicationStatusHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
  })
  const appIds = [...new Set(recentHistory.map((h) => h.applicationId))]
  const apps = await db.application.findMany({ where: { applicationId: { in: appIds } }, select: { applicationId: true, serviceId: true, customerPhone: true } })
  const activity = recentHistory.map((h) => {
    const app = apps.find((a) => a.applicationId === h.applicationId)
    return {
      id: h.id,
      applicationNumber: h.applicationNumber,
      service: catalog.find((c) => c.serviceId === app?.serviceId)?.serviceName || app?.serviceId || '',
      phone: app?.customerPhone || '',
      newStatus: h.newStatus,
      time: h.createdAt,
    }
  })

  // today revenue
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayAgg = await db.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID', paidAt: { gte: todayStart } } })

  return Response.json({
    ok: true,
    kpis: {
      totalApps, paidApps, pendingTasks, activeConvos, services,
      revenue, todayRevenue: todayAgg._sum.amount || 0,
    },
    revenueTrend: days,
    byService, byStatus, activity,
  })
}
