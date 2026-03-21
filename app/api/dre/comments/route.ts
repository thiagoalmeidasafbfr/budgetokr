import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

// GET /api/dre/comments?periodos=2026-01,2026-02
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const periodos = sp.get('periodos')
    const dreLinha = sp.get('dre_linha')

    const user = getUserFromHeaders(req)
    const db = getDb()
    const conditions: string[] = []
    const params: unknown[] = []

    // Dept users only see their own comments + master comments
    if (user?.role === 'dept') {
      conditions.push(`(user_role = 'master' OR departamento = ?)`)
      params.push(user.department ?? '')
    }

    if (periodos) {
      const list = periodos.split(',').filter(Boolean)
      if (list.length) {
        // Include comments with no specific period (periodo IS NULL) alongside period-filtered ones
        conditions.push(`(periodo IN (${list.map(() => '?').join(',')}) OR periodo IS NULL)`)
        params.push(...list)
      }
    }
    if (dreLinha) { conditions.push('dre_linha = ?'); params.push(dreLinha) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = db.prepare(`SELECT * FROM dre_comments ${where} ORDER BY created_at DESC`).all(...params)
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/dre/comments
export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const body = await req.json()
    const { dre_linha, agrupamento, conta, periodo, texto } = body
    if (!dre_linha || !texto) return NextResponse.json({ error: 'dre_linha e texto obrigatórios' }, { status: 400 })

    const db = getDb()
    const r = db.prepare(`
      INSERT INTO dre_comments (dre_linha, agrupamento, conta, periodo, texto, usuario, user_role, departamento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dre_linha, agrupamento ?? null, conta ?? null, periodo ?? null, texto,
      user?.userId ?? null, user?.role ?? 'master', user?.department ?? null
    )

    const row = db.prepare('SELECT * FROM dre_comments WHERE id = ?').get(r.lastInsertRowid)
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PUT /api/dre/comments
export async function PUT(req: NextRequest) {
  try {
    const { id, texto } = await req.json()
    if (!id || !texto) return NextResponse.json({ error: 'id e texto obrigatórios' }, { status: 400 })

    const db = getDb()
    db.prepare('UPDATE dre_comments SET texto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(texto, id)
    const row = db.prepare('SELECT * FROM dre_comments WHERE id = ?').get(id)
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/dre/comments?id=X
export async function DELETE(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    // Dept users can only delete their own comments
    if (user?.role === 'dept') {
      getDb().prepare('DELETE FROM dre_comments WHERE id = ? AND departamento = ?').run(id, user.department ?? '')
    } else {
      getDb().prepare('DELETE FROM dre_comments WHERE id = ?').run(id)
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
