import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const sp      = new URL(req.url).searchParams
  const page    = Math.max(1, parseInt(sp.get('page') ?? '1'))
  const q       = sp.get('q') ?? ''
  const success = sp.get('success') // '0' | '1' | null
  const limit   = 100
  const offset  = (page - 1) * limit

  const db = getDb()

  const conditions: string[] = []
  const params: unknown[] = []

  if (q) {
    conditions.push(`(LOWER(user_id) LIKE LOWER(?) OR LOWER(ip) LIKE LOWER(?))`)
    params.push(`%${q}%`, `%${q}%`)
  }
  if (success !== null && success !== '') {
    conditions.push(`success = ?`)
    params.push(parseInt(success))
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM login_logs ${where}`).get(...params) as { total: number }

  const rows = db.prepare(`
    SELECT id, user_id, role, department, success, ip, user_agent, created_at
    FROM login_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `).all(...params)

  return NextResponse.json({ rows, total, page, pages: Math.ceil(total / limit) })
}
