import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

function parseRow(m: {
  id: number; nome: string; descricao: string; unidade?: string; cor: string
  tipo_fonte: string; tipo_medida: string; filtros: string
  denominador_filtros: string; denominador_tipo_fonte: string
  departamentos?: string
  created_at: string; updated_at: string
}) {
  return {
    ...m,
    unidade: m.unidade ?? '',
    tipo_medida: m.tipo_medida || 'simples',
    filtros: JSON.parse(m.filtros || '[]'),
    denominador_filtros: JSON.parse(m.denominador_filtros || '[]'),
    denominador_tipo_fonte: m.denominador_tipo_fonte || 'ambos',
    departamentos: JSON.parse(m.departamentos || '[]') as string[],
  }
}

type RawRow = Parameters<typeof parseRow>[0]

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    const dept = new URL(req.url).searchParams.get('departamento') ?? ''
    const rows = db.prepare('SELECT * FROM medidas ORDER BY created_at DESC').all() as RawRow[]
    const parsed = rows.map(parseRow)
    // If filtering by dept, return only medidas assigned to that dept (or unassigned = [])
    const filtered = dept
      ? parsed.filter(m => m.departamentos.length === 0 || m.departamentos.includes(dept))
      : parsed
    return NextResponse.json(filtered)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros, denominador_filtros, denominador_tipo_fonte, departamentos } = await req.json()
    if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO medidas (nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros, denominador_filtros, denominador_tipo_fonte, departamentos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nome, descricao ?? '', unidade ?? '',
      cor ?? '#6366f1',
      tipo_fonte ?? 'ambos', tipo_medida ?? 'simples',
      JSON.stringify(filtros ?? []),
      JSON.stringify(denominador_filtros ?? []),
      denominador_tipo_fonte ?? 'ambos',
      JSON.stringify(departamentos ?? [])
    )
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(r.lastInsertRowid) as RawRow
    return NextResponse.json(parseRow(m))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros, denominador_filtros, denominador_tipo_fonte, departamentos } = await req.json()
    const db = getDb()
    db.prepare(`
      UPDATE medidas SET nome=?, descricao=?, unidade=?, cor=?, tipo_fonte=?, tipo_medida=?,
        filtros=?, denominador_filtros=?, denominador_tipo_fonte=?, departamentos=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      nome, descricao ?? '', unidade ?? '',
      cor ?? '#6366f1',
      tipo_fonte ?? 'ambos', tipo_medida ?? 'simples',
      JSON.stringify(filtros ?? []),
      JSON.stringify(denominador_filtros ?? []),
      denominador_tipo_fonte ?? 'ambos',
      JSON.stringify(departamentos ?? []),
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
