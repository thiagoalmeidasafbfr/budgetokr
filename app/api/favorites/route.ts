import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getUserFromHeaders } from '@/lib/session'

// GET /api/favorites
export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const db = getDb()
    const rows = db.prepare('SELECT * FROM user_favorites WHERE usuario = ? ORDER BY created_at DESC').all(user.userId)
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/favorites
export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { nome, url, filtros, icone } = await req.json()
    if (!nome || !url) return NextResponse.json({ error: 'nome e url obrigatórios' }, { status: 400 })

    const db = getDb()
    const r = db.prepare(`
      INSERT INTO user_favorites (usuario, nome, url, filtros, icone) VALUES (?, ?, ?, ?, ?)
    `).run(user.userId, nome, url, JSON.stringify(filtros ?? {}), icone ?? 'star')

    const row = db.prepare('SELECT * FROM user_favorites WHERE id = ?').get(r.lastInsertRowid)
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/favorites?id=X
export async function DELETE(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    getDb().prepare('DELETE FROM user_favorites WHERE id = ? AND usuario = ?').run(id, user.userId)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
