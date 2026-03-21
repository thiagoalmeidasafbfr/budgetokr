import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

// ──────────────────────────────────────────────────────────────────────────────
// Visibility rules:
//  • Dept in DRE  → own tickets (parent_id IS NULL) + master replies to their dept
//  • Master in DRE → only master's own private notes (user_role='master', parent_id IS NULL, departamento IS NULL)
//  • Log pages (context=log) → ALL rows (master only)
//  • Dept log (context=dept-log) → dept's tickets + master replies to that dept
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const context  = sp.get('context') ?? 'dre'
    const periodos = sp.get('periodos')

    const user = getUserFromHeaders(req)
    const db   = getDb()

    const conditions: string[] = []
    const params: unknown[]    = []

    if (context === 'log') {
      if (user?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
      // return all — no extra conditions
    } else if (context === 'dept-log') {
      const dept = user?.role === 'dept' ? user.department : sp.get('dept')
      if (!dept) return NextResponse.json([])
      conditions.push(`departamento = ?`)
      params.push(dept)
    } else {
      // 'dre' context: role-based DRE page visibility
      if (user?.role === 'dept') {
        conditions.push(`departamento = ?`)
        params.push(user.department ?? '')
      } else {
        // Master sees ONLY their own private notes in the DRE
        conditions.push(`(user_role = 'master' AND parent_id IS NULL AND departamento IS NULL)`)
      }
    }

    if (periodos) {
      const list = periodos.split(',').filter(Boolean)
      if (list.length) {
        conditions.push(`(periodo IN (${list.map(() => '?').join(',')}) OR periodo IS NULL)`)
        params.push(...list)
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows  = db.prepare(`SELECT * FROM dre_comments ${where} ORDER BY created_at DESC`).all(...params)
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST — create new ticket or master reply
export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const body = await req.json()
    const { dre_linha, agrupamento, conta, periodo, tipo_valor, texto, parent_id, filter_state } = body
    if (!dre_linha || !texto) return NextResponse.json({ error: 'dre_linha e texto obrigatórios' }, { status: 400 })

    const db = getDb()

    let departamento = user?.department ?? null
    if (parent_id) {
      // Reply: inherit parent's departamento and update parent status
      const parent = db.prepare('SELECT departamento FROM dre_comments WHERE id = ?').get(parent_id) as { departamento: string | null } | undefined
      if (parent) departamento = parent.departamento
      db.prepare(`UPDATE dre_comments SET status = 'replied', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(parent_id)
    }

    const r = db.prepare(`
      INSERT INTO dre_comments
        (dre_linha, agrupamento, conta, periodo, tipo_valor, texto, usuario, user_role, departamento, parent_id, status, filter_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(
      dre_linha,
      agrupamento ?? null,
      conta       ?? null,
      periodo     ?? null,
      tipo_valor  ?? 'realizado',
      texto,
      user?.userId ?? null,
      user?.role   ?? 'master',
      departamento,
      parent_id   ?? null,
      JSON.stringify(filter_state ?? {})
    )

    const row = db.prepare('SELECT * FROM dre_comments WHERE id = ?').get(r.lastInsertRowid)
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PUT — edit text OR close ticket
export async function PUT(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const { id, action, texto, motivo } = await req.json()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const db = getDb()
    if (action === 'close') {
      db.prepare(`
        UPDATE dre_comments
        SET status = 'closed', resolved_at = CURRENT_TIMESTAMP,
            resolved_by = ?, resolved_motivo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user?.userId ?? 'master', motivo ?? '', id)
    } else {
      if (!texto) return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 })
      db.prepare('UPDATE dre_comments SET texto = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(texto, id)
    }
    return NextResponse.json(db.prepare('SELECT * FROM dre_comments WHERE id = ?').get(id))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const id   = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    if (user?.role === 'dept') {
      // Dept can only delete own tickets with no replies yet
      getDb().prepare(`
        DELETE FROM dre_comments WHERE id = ? AND departamento = ? AND parent_id IS NULL
        AND id NOT IN (SELECT DISTINCT parent_id FROM dre_comments WHERE parent_id IS NOT NULL)
      `).run(id, user.department ?? '')
    } else {
      getDb().prepare('DELETE FROM dre_comments WHERE id = ?').run(id)
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
