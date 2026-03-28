/**
 * session.ts — 100% Edge-compatible (Web Crypto API, sem dependências externas).
 * Funciona no middleware (Edge runtime) e nos route handlers (Node.js).
 */
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

export const COOKIE_NAME = 'budgetokr_session'
if (!process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET não definido. Gere um com: openssl rand -base64 64'
  )
}
export const SESSION_SECRET = process.env.SESSION_SECRET

export type SessionUser = {
  userId: string
  role: 'master' | 'dept'
  department?: string    // primeiro departamento (compatibilidade)
  departments?: string[] // todos os departamentos atribuídos
}

// ─── Helpers Web Crypto ─────────────────────────────────────────────────────────

const enc = new TextEncoder()

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  return bytes.buffer as ArrayBuffer
}

// ─── Seal / Unseal ─────────────────────────────────────────────────────────────

export async function sealSession(user: SessionUser): Promise<string> {
  const payload = toBase64(enc.encode(JSON.stringify(user)))
  const key = await getKey(SESSION_SECRET)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return `${payload}.${toBase64(sig)}`
}

export async function unsealSession(sealed: string): Promise<SessionUser | null> {
  try {
    const dot = sealed.lastIndexOf('.')
    if (dot === -1) return null
    const payload = sealed.slice(0, dot)
    const sigBytes = fromBase64(sealed.slice(dot + 1))
    const key = await getKey(SESSION_SECRET)
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload))
    if (!valid) return null
    const user = JSON.parse(new TextDecoder().decode(new Uint8Array(fromBase64(payload)))) as SessionUser
    if (!user?.userId) return null
    return user
  } catch {
    return null
  }
}

// ─── Lê a sessão em Route Handlers ─────────────────────────────────────────────

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const val = cookieStore.get(COOKIE_NAME)?.value
  if (!val) return null
  return unsealSession(val)
}

// ─── Lê a sessão no Middleware ──────────────────────────────────────────────────

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
  const deptRaw = req.headers.get('x-user-dept') || ''
  const department = deptRaw ? (decodeURIComponent(deptRaw) || undefined) : undefined
  const deptsRaw = req.headers.get('x-user-depts') || ''
  const departments = deptsRaw
    ? decodeURIComponent(deptsRaw).split(',').filter(Boolean)
    : (department ? [department] : undefined)
  return { userId, role: role as 'master' | 'dept', department, departments }
}
