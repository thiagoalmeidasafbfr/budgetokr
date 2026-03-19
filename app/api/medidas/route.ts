import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

function parseRow(m: Record<string, unknown>) {
  return {
    id: m.id as number,
    nome: m.nome as string,
    descricao: (m.descricao ?? '') as string,
    unidade: (m.unidade ?? '') as string,
    cor: (m.cor ?? '#6366f1') as string,
    tipo_fonte: (m.tipo_fonte ?? 'ambos') as string,
    tipo_medida: (m.tipo_medida || 'simples') as string,
    filtros: JSON.parse((m.filtros as string) || '[]'),
    filtros_operador: (m.filtros_operador || 'AND') as string,
    denominador_filtros: JSON.parse((m.denominador_filtros as string) || '[]'),
    denominador_filtros_operador: (m.denominador_filtros_operador || 'AND') as string,
    denominador_tipo_fonte: (m.denominador_tipo_fonte || 'ambos') as string,
    departamentos: JSON.parse((m.departamentos as string) || '[]') as string[],
    created_at: m.created_at as string,
    updated_at: m.updated_at as string,
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    const dept = new URL(req.url).searchParams.get('departamento') ?? ''
    const rows = db.prepare('SELECT * FROM medidas ORDER BY created_at DESC').all() as Record<string, unknown>[]
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
    const { nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros,
            filtros_operador, denominador_filtros, denominador_filtros_operador,
            denominador_tipo_fonte, departamentos } = await req.json()
    if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO medidas (nome, descricao, unidade, cor, tipo_fonte, tipo_medida,
        filtros, filtros_operador, denominador_filtros, denominador_filtros_operador,
        denominador_tipo_fonte, departamentos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nome, descricao ?? '', unidade ?? '',
      cor ?? '#6366f1',
      tipo_fonte ?? 'ambos', tipo_medida ?? 'simples',
      JSON.stringify(filtros ?? []),
      filtros_operador ?? 'AND',
      JSON.stringify(denominador_filtros ?? []),
      denominador_filtros_operador ?? 'AND',
      denominador_tipo_fonte ?? 'ambos',
      JSON.stringify(departamentos ?? [])
    )
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(r.lastInsertRowid) as Record<string, unknown>
    return NextResponse.json(parseRow(m))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros,
            filtros_operador, denominador_filtros, denominador_filtros_operador,
            denominador_tipo_fonte, departamentos } = await req.json()
    const db = getDb()
    db.prepare(`
      UPDATE medidas SET nome=?, descricao=?, unidade=?, cor=?, tipo_fonte=?, tipo_medida=?,
        filtros=?, filtros_operador=?, denominador_filtros=?, denominador_filtros_operador=?,
        denominador_tipo_fonte=?, departamentos=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      nome, descricao ?? '', unidade ?? '',
      cor ?? '#6366f1',
      tipo_fonte ?? 'ambos', tipo_medida ?? 'simples',
      JSON.stringify(filtros ?? []),
      filtros_operador ?? 'AND',
      JSON.stringify(denominador_filtros ?? []),
      denominador_filtros_operador ?? 'AND',
      denominador_tipo_fonte ?? 'ambos',
      JSON.stringify(departamentos ?? []),
      id
    )
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(id) as Record<string, unknown>
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
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(id) as Record<string, unknown>
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
