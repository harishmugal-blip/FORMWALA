import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_PASSWORD, COOKIE_NAME, signToken, isAuthed } from '@/lib/auth'
import { q1, phys } from '@/lib/csc-db'

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  const OPERATOR_PIN = process.env.OPERATOR_PIN || '2026'
  const trimmed = String(password || '').trim()

  // 1. Master Admin / Default PIN check
  if (trimmed === ADMIN_PASSWORD || trimmed === OPERATOR_PIN) {
    const token = signToken({ role: 'admin', name: 'Master Admin' })
    const res = NextResponse.json({ ok: true, user: { name: 'Master Admin', role: 'admin', shopName: 'Head Office' } })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600, path: '/',
    })
    return res
  }

  // 2. Dukandar / Partner personal PIN check
  try {
    const op = q1<any>(`SELECT * FROM ${phys('operators')} WHERE pin = ? AND status = 'ACTIVE'`, trimmed)
    if (op) {
      if (op.valid_till && new Date(op.valid_till) < new Date()) {
        return Response.json({ ok: false, error: 'Aapka subscription plan samapt ho gaya hai. Kripya renew karein.' }, { status: 403 })
      }
      const token = signToken({
        role: String(op.role || 'dukandar').toLowerCase(),
        operator_id: op.operator_id,
        shop_name: op.shop_name,
        name: op.owner_name,
        phone: op.phone,
      })
      const res = NextResponse.json({
        ok: true,
        user: {
          name: op.owner_name,
          shopName: op.shop_name,
          role: op.role || 'DUKANDAR',
          operatorId: op.operator_id,
          phone: op.phone,
        },
      })
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600, path: '/',
      })
      return res
    }
  } catch {}

  return Response.json({ ok: false, error: 'Galat PIN ya password. Dobara try karein.' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  return Response.json({ ok: true, authed: isAuthed(req) })
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return res
}
