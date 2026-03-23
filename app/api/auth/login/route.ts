import { NextRequest, NextResponse } from 'next/server'
import { sealSession, COOKIE_NAME } from '@/lib/session'
import { validateUser } from '@/lib/users'
import { getSupabase } from '@/lib/supabase'

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

  const user = await validateUser(userId, password)

  // Record login attempt
  try {
    const supabase = getSupabase()
    await supabase.from('login_logs').insert({
      user_id:    userId,
      role:       user?.role ?? null,
      department: user?.department ?? null,
      success:    user ? true : false,
      ip,
      user_agent: ua.substring(0, 255),
    })
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
