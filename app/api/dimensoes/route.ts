import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/dimensoes?tipo=centros_custo|contas_contabeis&q=...
export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const tipo = sp.get('tipo') ?? 'centros_custo'
    const q    = sp.get('q') ?? ''
    const db   = getDb()

    if (tipo === 'centros_custo') {
      const where = q ? `WHERE LOWER(centro_custo) LIKE LOWER(?) OR LOWER(nome_centro_custo) LIKE LOWER(?) OR LOWER(departamento) LIKE LOWER(?)` : ''
      const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []
      const rows = db.prepare(`SELECT * FROM centros_custo ${where} ORDER BY centro_custo LIMIT 500`).all(...params)
      return NextResponse.json(rows)
    }

    if (tipo === 'contas_contabeis') {
      const where = q ? `WHERE LOWER(numero_conta_contabil) LIKE LOWER(?) OR LOWER(nome_conta_contabil) LIKE LOWER(?) OR LOWER(agrupamento_arvore) LIKE LOWER(?) OR LOWER(dre) LIKE LOWER(?)` : ''
      const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`] : []
      const rows = db.prepare(`SELECT * FROM contas_contabeis ${where} ORDER BY numero_conta_contabil LIMIT 500`).all(...params)
      return NextResponse.json(rows)
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST: upsert single dimension row
export async function POST(req: NextRequest) {
  try {
    const { tipo, ...body } = await req.json()
    const db = getDb()

    if (tipo === 'centros_custo') {
      db.prepare(`
        INSERT INTO centros_custo (centro_custo, nome_centro_custo, departamento, nome_departamento, area, nome_area)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(centro_custo) DO UPDATE SET
          nome_centro_custo=excluded.nome_centro_custo,
          departamento=excluded.departamento,
          nome_departamento=excluded.nome_departamento,
          area=excluded.area,
          nome_area=excluded.nome_area
      `).run(
        body.centro_custo ?? '', body.nome_centro_custo ?? '',
        body.departamento ?? '', body.nome_departamento ?? '',
        body.area ?? '', body.nome_area ?? '',
      )
      return NextResponse.json(db.prepare('SELECT * FROM centros_custo WHERE centro_custo = ?').get(body.centro_custo))
    }

    if (tipo === 'contas_contabeis') {
      db.prepare(`
        INSERT INTO contas_contabeis (numero_conta_contabil, nome_conta_contabil, agrupamento_arvore, dre)
        VALUES (?,?,?,?)
        ON CONFLICT(numero_conta_contabil) DO UPDATE SET
          nome_conta_contabil=excluded.nome_conta_contabil,
          agrupamento_arvore=excluded.agrupamento_arvore,
          dre=excluded.dre
      `).run(
        body.numero_conta_contabil ?? '', body.nome_conta_contabil ?? '',
        body.agrupamento_arvore ?? '', body.dre ?? '',
      )
      return NextResponse.json(db.prepare('SELECT * FROM contas_contabeis WHERE numero_conta_contabil = ?').get(body.numero_conta_contabil))
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const tipo = sp.get('tipo')
    const key  = sp.get('key')
    const db   = getDb()

    if (tipo === 'centros_custo')    db.prepare('DELETE FROM centros_custo WHERE centro_custo = ?').run(key)
    if (tipo === 'contas_contabeis') db.prepare('DELETE FROM contas_contabeis WHERE numero_conta_contabil = ?').run(key)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
