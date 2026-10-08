import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isAuthed, unauthorized } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized()
  const { id } = await params

  const service = await db.serviceCatalog.findFirst({
    where: { serviceId: id },
    include: {
      fields: { orderBy: { fieldOrder: 'asc' } },
      documents: { orderBy: { docOrder: 'asc' } },
      pricing: true,
      _count: { select: { fields: true, documents: true, applications: true } },
    },
  })
  if (!service) return Response.json({ ok: false, error: 'Service nahi mili' }, { status: 404 })

  const recentApps = await db.application.findMany({
    where: { serviceId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { applicationId: true, applicationNumber: true, customerPhone: true, status: true, createdAt: true },
  })

  return Response.json({ ok: true, service, recentApps })
}

// PATCH: update pricing / active / description
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { govFee, serviceCharge, gstPercent, active } = body as {
    govFee?: number; serviceCharge?: number; gstPercent?: number; active?: string
  }

  const service = await db.serviceCatalog.findFirst({ where: { serviceId: id } })
  if (!service) return Response.json({ ok: false, error: 'Service nahi mili' }, { status: 404 })

  // update pricing if any pricing field given
  if (govFee !== undefined || serviceCharge !== undefined || gstPercent !== undefined) {
    const pricing = await db.servicePricing.findFirst({ where: { serviceId: id } })
    const g = govFee ?? pricing?.govFee ?? 0
    const sc = serviceCharge ?? pricing?.serviceCharge ?? 0
    const gp = gstPercent ?? pricing?.gstPercent ?? 18
    const gstAmt = Math.round(sc * gp) / 100
    const total = g + sc + gstAmt

    if (pricing) {
      await db.servicePricing.update({
        where: { serviceId: id },
        data: { govFee: g, serviceCharge: sc, gstPercent: gp, gstAmount: gstAmt, totalFee: total },
      })
    } else {
      await db.servicePricing.create({
        data: { serviceId: id, govFee: g, serviceCharge: sc, gstPercent: gp, gstAmount: gstAmt, totalFee: total },
      })
    }

    await db.serviceCatalog.update({
      where: { serviceId: id },
      data: { governmentFee: g, serviceCharge: sc, gstPercent: gp, totalFee: total },
    })

    await db.auditLog.create({
      data: {
        eventId: 'EVT' + Date.now().toString(36).toUpperCase(),
        eventType: 'PRICING_UPDATE', actor: 'PORTAL_ADMIN', applicationId: '', phone: '',
        payload: JSON.stringify({ serviceId: id, govFee: g, serviceCharge: sc, gstPercent: gp, totalFee: total }),
      },
    })
  }

  if (active !== undefined) {
    await db.serviceCatalog.update({ where: { serviceId: id }, data: { active } })
    await db.auditLog.create({
      data: {
        eventId: 'EVT' + Date.now().toString(36).toUpperCase(),
        eventType: 'SERVICE_TOGGLE', actor: 'PORTAL_ADMIN', applicationId: '', phone: '',
        payload: JSON.stringify({ serviceId: id, active }),
      },
    })
  }

  const updated = await db.serviceCatalog.findFirst({
    where: { serviceId: id },
    include: { pricing: true, _count: { select: { fields: true, documents: true, applications: true } } },
  })
  return Response.json({ ok: true, service: updated })
}
