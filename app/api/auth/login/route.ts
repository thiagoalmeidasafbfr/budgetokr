import { NextRequest, NextResponse } from 'next/server'
import { sealSession, COOKIE_NAME } from '@/lib/session'
import { validateUser } from '@/lib/users'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { userId, password } = await req.json()

  const user = validateUser(userId?.trim(), password)
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
