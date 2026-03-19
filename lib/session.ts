/**
 * session.ts — Edge-compatible (sem imports Node.js).
 * Pode ser importado tanto no middleware quanto nos route handlers.
 */
import { sealData, unsealData } from 'iron-session'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export const COOKIE_NAME = 'budgetokr_session'
export const SESSION_SECRET =
  process.env.SESSION_SECRET || 'budgetokr-change-this-secret-in-production-32c'

export type SessionUser = {
  userId: string
  role: 'master' | 'dept'
  department?: string // somente para role=dept
}

// ─── Seal / Unseal ─────────────────────────────────────────────────────────────

export async function sealSession(user: SessionUser): Promise<string> {
  return sealData(user, { password: SESSION_SECRET })
}

export async function unsealSession(sealed: string): Promise<SessionUser | null> {
  try {
    const user = await unsealData<SessionUser>(sealed, { password: SESSION_SECRET })
    if (!user?.userId) return null
    return user
  } catch {
    return null
  }
}

// ─── Lê a sessão em Route Handlers (server-side, usa next/headers) ──────────────

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const val = cookieStore.get(COOKIE_NAME)?.value
  if (!val) return null
  return unsealSession(val)
}

// ─── Lê a sessão no Middleware (request direto, Edge-compatible) ────────────────

export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const val = req.cookies.get(COOKIE_NAME)?.value
  if (!val) return null
  return unsealSession(val)
}

// ─── Helper para API routes: lê o header injetado pelo middleware ───────────────

export function getUserFromHeaders(req: NextRequest | Request): SessionUser | null {
  const role = req.headers.get('x-user-role')
  if (!role) return null
  const userId = req.headers.get('x-user-id') || ''
  const department = req.headers.get('x-user-dept') || undefined
  return { userId, role: role as 'master' | 'dept', department }
}
