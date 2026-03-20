import { NextRequest, NextResponse } from 'next/server'
import { sealSession, COOKIE_NAME } from '@/lib/session'
import { validateUser } from '@/lib/users'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const userId   = (body.userId ?? '').trim()
  const password = body.password ?? ''

  const ip = getClientIp(req)
  const ua = req.headers.get('user-agent') ?? ''

  const user = validateUser(userId, password)

  // Record login attempt
  try {
    const db = getDb()
    db.prepare(`
      INSERT INTO login_logs (user_id, role, department, success, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      user?.role ?? null,
      user?.department ?? null,
      user ? 1 : 0,
      ip,
      ua.substring(0, 255),
    )
  } catch { /* log failure should not block login */ }

  if (!user) {
    return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 })
  }

  const sealed = await sealSession(user)

  const res = NextResponse.json({ ok: true, role: user.role, department: user.department })
  res.cookies.set(COOKIE_NAME, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 horas
  })
  return res
}
