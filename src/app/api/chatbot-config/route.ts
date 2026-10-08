import { NextRequest } from 'next/server'
import { isAuthed, unauthorized } from '@/lib/auth'
import { getChatbotConfig, setChatbotConfig, type ChatbotConfig } from '@/lib/fb-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized()
  const cfg = await getChatbotConfig(true)
  return Response.json({ ok: true, config: cfg })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized()
  const body = await req.json().catch(() => ({})) as Partial<Record<keyof ChatbotConfig, string | boolean>> & { quickActions?: string[] }

  const patch: Partial<Record<keyof ChatbotConfig, string>> = {}
  const strFields: (keyof ChatbotConfig)[] = [
    'businessName', 'assistantName', 'tagline', 'welcomeMessage',
    'businessHours', 'fallbackMessage', 'tokenPrefix', 'paymentMode', 'paymentUpiId',
  ]
  for (const f of strFields) {
    const v = body[f]
    if (typeof v === 'string') patch[f] = v.slice(0, 2000)
  }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled ? 'TRUE' : 'FALSE'
  if (Array.isArray(body.quickActions)) {
    patch.quickActions = JSON.stringify((body.quickActions as unknown[]).map(String).slice(0, 8))
  }

  await setChatbotConfig(patch)
  const cfg = await getChatbotConfig(true)
  return Response.json({ ok: true, config: cfg })
}
