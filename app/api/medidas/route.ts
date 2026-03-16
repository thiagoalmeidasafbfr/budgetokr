import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM medidas ORDER BY created_at DESC').all() as Array<{
      id: number; nome: string; descricao: string; cor: string
      tipo_fonte: string; filtros: string; created_at: string; updated_at: string
    }>
    return NextResponse.json(rows.map(m => ({ ...m, filtros: JSON.parse(m.filtros || '[]') })))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome, descricao, cor, tipo_fonte, filtros } = await req.json()
    if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
    const db = getDb()
    const r = db.prepare(`
      INSERT INTO medidas (nome, descricao, cor, tipo_fonte, filtros)
      VALUES (?, ?, ?, ?, ?)
    `).run(nome, descricao ?? '', cor ?? '#6366f1', tipo_fonte ?? 'ambos', JSON.stringify(filtros ?? []))
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(r.lastInsertRowid) as {
      id: number; nome: string; descricao: string; cor: string
      tipo_fonte: string; filtros: string; created_at: string; updated_at: string
    }
    return NextResponse.json({ ...m, filtros: JSON.parse(m.filtros) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, nome, descricao, cor, tipo_fonte, filtros } = await req.json()
    const db = getDb()
    db.prepare(`
      UPDATE medidas SET nome=?, descricao=?, cor=?, tipo_fonte=?, filtros=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(nome, descricao ?? '', cor ?? '#6366f1', tipo_fonte ?? 'ambos', JSON.stringify(filtros ?? []), id)
    const m = db.prepare('SELECT * FROM medidas WHERE id = ?').get(id) as {
      id: number; nome: string; descricao: string; cor: string
      tipo_fonte: string; filtros: string; created_at: string; updated_at: string
    }
    return NextResponse.json({ ...m, filtros: JSON.parse(m.filtros) })
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
