import { NextRequest, NextResponse } from 'next/server'
import { sealSession, COOKIE_NAME, SESSION_TTL_MS } from '@/lib/session'
import { validateUser } from '@/lib/users'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ─── Rate Limiting (in-memory + database fallback) ───────────────────────────
const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000 // 15 minutos

const attempts = new Map<string, { count: number; firstAttempt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const record = attempts.get(ip)
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAttempt: now })
    return false
  }
  record.count++
  return record.count > MAX_ATTEMPTS
}

// Limpa entradas expiradas a cada 5 minutos para evitar memory leak
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of attempts) {
    if (now - record.firstAttempt > WINDOW_MS) attempts.delete(ip)
  }
}, 5 * 60 * 1000)

function getClientIp(req: NextRequest): string {
  // x-real-ip is set directly by Vercel/nginx and cannot be forged by the client
  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  // x-forwarded-for is a comma-separated chain: "client, proxy1, proxy2, vercel"
  // The LAST entry is appended by the trusted proxy (Vercel) — use that, not [0]
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',')
    const last  = parts[parts.length - 1]?.trim()
    if (last) return last
  }

  return 'unknown'
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  // Rate limit check (in-memory)
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde 15 minutos.' },
      { status: 429 }
    )
  }

  const body = await req.json()
  const userId   = (body.userId ?? '').trim()
  const password = body.password ?? ''
  const ua = req.headers.get('user-agent') ?? ''

  // Database-backed rate limit check (survives cold starts)
  try {
    const supabase = getSupabase()
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('login_logs')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('success', false)
      .gte('created_at', since)
    if ((count ?? 0) >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Aguarde 15 minutos.' },
        { status: 429 }
      )
    }
  } catch { /* fallback to in-memory only */ }

  const user = await validateUser(userId, password)

  // Record login attempt
  try {
    const supabase = getSupabase()
    await supabase.from('login_logs').insert({
      user_id:    userId,
      role:       user?.role ?? null,
      department: user?.department ?? null,
      success:    !!user,
      ip,
      user_agent: ua.substring(0, 255),
    })
  } catch { /* log failure should not block login */ }

  if (!user) {
    return NextResponse.json({ error: 'Usuário ou senha inválidos' }, { status: 401 })
  }

  // Login bem-sucedido: reseta o rate limit deste IP
  attempts.delete(ip)

  const sealed = await sealSession(user)

  const res = NextResponse.json({ ok: true, role: user.role, department: user.department })
  res.cookies.set(COOKIE_NAME, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
  return res
}
