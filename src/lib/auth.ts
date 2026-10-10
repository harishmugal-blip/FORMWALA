import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

const SECRET = process.env.PORTAL_SECRET || 'csc-portal-secret-2026'
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'csc-admin-2026'
export const COOKIE_NAME = 'csc_admin_token'

export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url')
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken(token: string): boolean {
  const [body, sig] = token.split('.')
  if (!body || !sig) return false
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url')
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (Date.now() - payload.iat > 7 * 24 * 3600 * 1000) return false // 7 day expiry
    const r = String(payload.role || '').toLowerCase()
    return ['admin', 'dukandar', 'operator'].includes(r)
  } catch {
    return false
  }
}

export function isAuthed(req: NextRequest): boolean {
  const token = req.cookies.get(COOKIE_NAME)?.value
  return !!token && verifyToken(token)
}

export function unauthorized() {
  return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}
