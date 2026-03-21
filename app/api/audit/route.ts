import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserFromHeaders } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (user?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const sp = new URL(req.url).searchParams
    const page   = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const tabela = sp.get('tabela')
    const regId  = sp.get('registro_id')
    const acao   = sp.get('acao')
    const limit  = 50
    const offset = (page - 1) * limit

    const db = getDb()
    const conditions: string[] = []
    const params: unknown[] = []
    if (tabela) { conditions.push('tabela = ?'); params.push(tabela) }
    if (regId)  { conditions.push('registro_id = ?'); params.push(parseInt(regId)) }
    if (acao)   { conditions.push('acao = ?'); params.push(acao) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM audit_log ${where}`).get(...params) as { total: number }
    const rows = db.prepare(`
      SELECT * FROM audit_log ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    return NextResponse.json({ rows, total, page, pages: Math.ceil(total / limit) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
