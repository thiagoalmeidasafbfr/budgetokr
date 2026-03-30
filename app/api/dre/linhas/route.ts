import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function requireMaster() {
  const session = await getSession()
  if (session?.role !== 'master') return null
  return session
}

// GET /api/dre/linhas — list all lines ordered by ordem
export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('dre_linhas')
    .select('*')
    .order('ordem')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/dre/linhas — create a new calculated line
export async function POST(req: NextRequest) {
  if (!await requireMaster()) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { nome, formula_gerencial, ordem, negrito } = await req.json()
  if (!nome?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('dre_linhas')
    .insert({
      nome: nome.trim(),
      tipo: 'calculada',
      sinal: 1,
      formula_grupos: '[]',
      formula_sinais: '[]',
      negrito: negrito ?? true,
      separador: false,
      ordem: ordem ?? 999,
      formula_gerencial,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/dre/linhas — bulk update ordem (drag & drop save)
export async function PATCH(req: NextRequest) {
  if (!await requireMaster()) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { updates } = await req.json() as { updates: Array<{ id: number; ordem: number }> }
  if (!Array.isArray(updates)) return NextResponse.json({ error: 'updates required' }, { status: 400 })
  const supabase = getSupabase()
  const results = await Promise.all(
    updates.map(({ id, ordem }) => supabase.from('dre_linhas').update({ ordem }).eq('id', id))
  )
  const err = results.find(r => r.error)?.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/dre/linhas?id=123 — delete a calculated line
export async function DELETE(req: NextRequest) {
  if (!await requireMaster()) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = getSupabase()
  const { error } = await supabase
    .from('dre_linhas')
    .delete()
    .eq('id', Number(id))
    .eq('tipo', 'calculada') // safety: only delete calculated lines
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
