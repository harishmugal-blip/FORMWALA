import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isAuthed, unauthorized } from '@/lib/auth'

const SENSITIVE = ['WHATSAPP_ACCESS_TOKEN', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_KEY_ID']

function mask(key: string, value: string): string {
  if (!SENSITIVE.includes(key) || !value) return value
  if (value.startsWith('SET_YOUR')) return value
  if (value.length <= 8) return '••••••'
  return value.substring(0, 6) + '••••••' + value.substring(value.length - 4)
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized()
  const configs = await db.systemConfig.findMany({ orderBy: { configKey: 'asc' } })
  return Response.json({
    ok: true,
    configs: configs.map((c) => ({ ...c, configValue: mask(c.configKey, c.configValue), masked: SENSITIVE.includes(c.configKey) })),
  })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const { configKey, configValue } = body as { configKey: string; configValue: string }
  if (!configKey) return Response.json({ ok: false, error: 'configKey required' }, { status: 400 })

  // don't overwrite masked values with the masked string
  if (configValue.includes('••••')) {
    return Response.json({ ok: false, error: 'Masked value ko save nahi kar sakte. Naya value likhein.' }, { status: 400 })
  }

  await db.systemConfig.upsert({
    where: { configKey },
    update: { configValue },
    create: { configKey, configValue, description: '' },
  })

  await db.auditLog.create({
    data: {
      eventId: 'EVT' + Date.now().toString(36).toUpperCase(),
      eventType: 'CONFIG_UPDATE', actor: 'PORTAL_ADMIN', applicationId: '', phone: '',
      payload: JSON.stringify({ configKey }),
    },
  })

  return Response.json({ ok: true })
}
