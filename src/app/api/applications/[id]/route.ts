import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isAuthed, unauthorized } from '@/lib/auth'

// GET application full detail
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized()
  const { id } = await params

  const app = await db.application.findFirst({
    where: { OR: [{ applicationId: id }, { applicationNumber: id }] },
    include: {
      service: true,
      fieldValues: { orderBy: { id: 'asc' } },
      documents: { orderBy: { id: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      receipts: true,
      tasks: { orderBy: { createdAt: 'desc' } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!app) return Response.json({ ok: false, error: 'Application nahi mili' }, { status: 404 })

  // attach service field/doc definitions for labels
  const [fieldDefs, docDefs] = await Promise.all([
    db.serviceField.findMany({ where: { serviceId: app.serviceId }, orderBy: { fieldOrder: 'asc' } }),
    db.serviceDocument.findMany({ where: { serviceId: app.serviceId }, orderBy: { docOrder: 'asc' } }),
  ])

  // recent messages from this customer
  const messages = await db.messageLog.findMany({ where: { phone: app.customerPhone }, orderBy: { createdAt: 'desc' }, take: 10 })

  return Response.json({ ok: true, application: app, fieldDefs, docDefs, messages })
}

// PATCH update application status (admin action)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { status, note } = body as { status?: string; note?: string }
  if (!status) return Response.json({ ok: false, error: 'Status required' }, { status: 400 })

  const VALID = ['DRAFT', 'SUBMITTED', 'PAID', 'IN_PROGRESS', 'APPROVED', 'DELIVERED', 'REJECTED']
  if (!VALID.includes(status)) return Response.json({ ok: false, error: 'Invalid status' }, { status: 400 })

  const app = await db.application.findFirst({ where: { OR: [{ applicationId: id }, { applicationNumber: id }] } })
  if (!app) return Response.json({ ok: false, error: 'Application nahi mili' }, { status: 404 })

  const updated = await db.application.update({
    where: { applicationId: app.applicationId },
    data: { status },
  })

  await db.applicationStatusHistory.create({
    data: {
      applicationId: app.applicationId,
      applicationNumber: app.applicationNumber,
      oldStatus: app.status,
      newStatus: status,
      note: note || 'Portal se update',
    },
  })

  await db.auditLog.create({
    data: {
      eventId: 'EVT' + Date.now().toString(36).toUpperCase(),
      eventType: 'STATUS_CHANGE',
      actor: 'PORTAL_ADMIN',
      phone: app.customerPhone,
      applicationId: app.applicationId,
      payload: JSON.stringify({ from: app.status, to: status, note: note || '' }),
    },
  })

  return Response.json({ ok: true, application: updated })
}
