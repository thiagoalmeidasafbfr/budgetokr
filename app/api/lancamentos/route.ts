import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const PAGE_SIZE = 100

// GET /api/lancamentos?tipo=budget&page=1&q=texto&departamento=X&periodo=2024-01
export async function GET(req: NextRequest) {
  try {
    const sp    = new URL(req.url).searchParams
    const tipo  = sp.get('tipo')          // 'budget' | 'razao' | null (ambos)
    const page  = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const q     = sp.get('q') ?? ''
    const dept  = sp.get('departamento')
    const per   = sp.get('periodo')
    const db    = getDb()

    const conditions: string[] = []
    const params: unknown[] = []

    if (tipo) { conditions.push(`l.tipo = ?`); params.push(tipo) }
    if (dept) { conditions.push(`cc.departamento = ?`); params.push(dept) }
    if (per)  { conditions.push(`strftime('%Y-%m', l.data_lancamento) = ?`); params.push(per) }
    if (q)    {
      conditions.push(`(
        LOWER(l.numero_conta_contabil) LIKE LOWER(?) OR
        LOWER(l.nome_conta_contabil)   LIKE LOWER(?) OR
        LOWER(l.centro_custo)          LIKE LOWER(?) OR
        LOWER(l.fonte)                 LIKE LOWER(?) OR
        LOWER(l.observacao)            LIKE LOWER(?)
      )`)
      const like = `%${q}%`
      params.push(like, like, like, like, like)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const countSQL = `
      SELECT COUNT(*) as total
      FROM lancamentos l
      LEFT JOIN centros_custo cc ON l.centro_custo = cc.centro_custo
      ${where}
    `
    const { total } = db.prepare(countSQL).get(...params) as { total: number }

    const offset = (page - 1) * PAGE_SIZE
    const dataSQL = `
      SELECT
        l.*,
        cc.nome_centro_custo, cc.departamento, cc.nome_departamento, cc.area, cc.nome_area,
        ca.agrupamento_arvore, ca.dre
      FROM lancamentos l
      LEFT JOIN centros_custo    cc ON l.centro_custo          = cc.centro_custo
      LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil
      ${where}
      ORDER BY l.data_lancamento DESC, l.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `
    const rows = db.prepare(dataSQL).all(...params)

    return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST: insert single row
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO lancamentos
        (tipo, data_lancamento, nome_conta_contabil, numero_conta_contabil,
         centro_custo, nome_conta_contrapartida, fonte, observacao, debito_credito)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      body.tipo ?? 'budget',
      body.data_lancamento ?? '',
      body.nome_conta_contabil ?? '',
      body.numero_conta_contabil ?? '',
      body.centro_custo ?? '',
      body.nome_conta_contrapartida ?? '',
      body.fonte ?? '',
      body.observacao ?? '',
      parseFloat(body.debito_credito) || 0,
    )
    const row = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(r.lastInsertRowid)
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH: update single field(s)
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...fields } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const allowed = [
      'tipo','data_lancamento','nome_conta_contabil','numero_conta_contabil',
      'centro_custo','nome_conta_contrapartida','fonte','observacao','debito_credito',
    ]
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (!keys.length) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    const db = getDb()
    const setClauses = keys.map(k => `${k} = ?`).join(', ')
    const values = keys.map(k => fields[k])

    db.prepare(`UPDATE lancamentos SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id)
    const row = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id)
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE: remove row
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    getDb().prepare('DELETE FROM lancamentos WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
