import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_PASSWORD, COOKIE_NAME, signToken, isAuthed } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }))
  const OPERATOR_PIN = process.env.OPERATOR_PIN || '2026'
  if (password !== ADMIN_PASSWORD && password !== OPERATOR_PIN) {
    return Response.json({ ok: false, error: 'Galat password. Dobara try karein.' }, { status: 401 })
  }
  const token = signToken({ role: 'admin' })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600, path: '/',
  })
  return res
}

export async function GET(req: NextRequest) {
  return Response.json({ ok: true, authed: isAuthed(req) })
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return res
}
