import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

function parseRow(m: {
  id: number; nome: string; descricao: string; unidade?: string; cor: string
  tipo_fonte: string; tipo_medida: string; filtros: string
  denominador_filtros: string; denominador_tipo_fonte: string
  created_at: string; updated_at: string
}) {
  return {
    ...m,
    unidade: m.unidade ?? '',
    tipo_medida: m.tipo_medida || 'simples',
    filtros: JSON.parse(m.filtros || '[]'),
    denominador_filtros: JSON.parse(m.denominador_filtros || '[]'),
    denominador_tipo_fonte: m.denominador_tipo_fonte || 'ambos',
  }
}

type RawRow = Parameters<typeof parseRow>[0]

export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM medidas ORDER BY created_at DESC').all() as RawRow[]
    return NextResponse.json(rows.map(parseRow))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros, denominador_filtros, denominador_tipo_fonte } = await req.json()
    if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO medidas (nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros, denominador_filtros, denominador_tipo_fonte)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nome, descricao ?? '', unidade ?? '',
      cor ?? '#6366f1',
      tipo_fonte ?? 'ambos', tipo_medida ?? 'simples',
      JSON.stringify(filtros ?? []),
      JSON.stringify(denominador_filtros ?? []),
      denominador_tipo_fonte ?? 'ambos'
    )
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(r.lastInsertRowid) as RawRow
    return NextResponse.json(parseRow(m))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros, denominador_filtros, denominador_tipo_fonte } = await req.json()
    const db = getDb()
    db.prepare(`
      UPDATE medidas SET nome=?, descricao=?, unidade=?, cor=?, tipo_fonte=?, tipo_medida=?,
        filtros=?, denominador_filtros=?, denominador_tipo_fonte=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      nome, descricao ?? '', unidade ?? '',
      cor ?? '#6366f1',
      tipo_fonte ?? 'ambos', tipo_medida ?? 'simples',
      JSON.stringify(filtros ?? []),
      JSON.stringify(denominador_filtros ?? []),
      denominador_tipo_fonte ?? 'ambos',
      id
    )
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(id) as RawRow
    return NextResponse.json(parseRow(m))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, unidade } = await req.json()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    const db = getDb()
    db.prepare(`UPDATE medidas SET unidade=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(unidade ?? '', id)
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(id) as RawRow
    return NextResponse.json(parseRow(m))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id')
    getDb().prepare('DELETE FROM medidas WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
