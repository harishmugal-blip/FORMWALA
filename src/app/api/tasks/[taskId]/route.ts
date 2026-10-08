import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isAuthed, unauthorized } from '@/lib/auth'

// PATCH: approve / reject / progress an operator task
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  if (!isAuthed(req)) return unauthorized()
  const { taskId } = await params
  const body = await req.json().catch(() => ({}))
  const { action, note } = body as { action: 'APPROVE' | 'REJECT' | 'PROGRESS'; note?: string }
  if (!action || !['APPROVE', 'REJECT', 'PROGRESS'].includes(action)) {
    return Response.json({ ok: false, error: 'Invalid action' }, { status: 400 })
  }

  const task = await db.operatorTask.findFirst({ where: { taskId } })
  if (!task) return Response.json({ ok: false, error: 'Task nahi mila' }, { status: 404 })

  const app = await db.application.findFirst({ where: { applicationId: task.applicationId } })
  if (!app) return Response.json({ ok: false, error: 'Application nahi mili' }, { status: 404 })

  const now = new Date()
  const newAppStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'IN_PROGRESS'
  const newTaskStatus = action === 'APPROVE' ? 'DONE' : action === 'REJECT' ? 'REJECTED' : 'IN_PROGRESS'

  await db.operatorTask.update({
    where: { id: task.id },
    data: { status: newTaskStatus, note: note || '', updatedAt: now },
  })

  await db.application.update({
    where: { applicationId: app.applicationId },
    data: { status: newAppStatus },
  })

  await db.applicationStatusHistory.create({
    data: {
      applicationId: app.applicationId, applicationNumber: app.applicationNumber,
      oldStatus: app.status, newStatus: newAppStatus,
      note: note || `Operator task ${action.toLowerCase()}d`,
    },
  })

  await db.auditLog.create({
    data: {
      eventId: 'EVT' + Date.now().toString(36).toUpperCase(),
      eventType: `TASK_${action}`,
      actor: 'PORTAL_ADMIN', phone: app.customerPhone, applicationId: app.applicationId,
      payload: JSON.stringify({ taskId: task.taskId, note: note || '' }),
    },
  })

  return Response.json({ ok: true, newStatus: newAppStatus })
}
