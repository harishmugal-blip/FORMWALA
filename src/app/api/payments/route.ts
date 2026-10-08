import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isAuthed, unauthorized } from '@/lib/auth'
import { verifyPayment } from '@/lib/payment-verify'

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized()
  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || ''

  const where = status ? { status } : {}
  const payments = await db.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 150,
    include: {
      application: {
        select: {
          applicationNumber: true, serviceId: true,
          service: { select: { serviceName: true } },
        },
      },
    },
  })

  const agg = await db.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } })
  return Response.json({ ok: true, payments, totalCollected: agg._sum.amount || 0 })
}

// POST — operator "verify payment" action (dashboard)
// Ye PAID transition ka authorized operator path he (webhook ke alawa).
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized()
  const body = await req.json().catch(() => ({})) as { applicationNumber?: string; action?: string }
  const appNumber = String(body.applicationNumber || '').trim().toUpperCase()
  if (!appNumber || body.action !== 'verify') {
    return Response.json({ ok: false, error: 'applicationNumber + action=verify required' }, { status: 400 })
  }
  const result = await verifyPayment({
    applicationNumber: appNumber,
    source: 'OPERATOR',
    gateway: 'UPI_MANUAL',
    eventId: `op_verify_${appNumber}_${Date.now()}`,
  })
  if (!result.ok) {
    return Response.json({ ok: false, error: result.message }, { status: 400 })
  }
  return Response.json({ ok: true, status: 'QUEUED', alreadyVerified: result.alreadyVerified })
}
