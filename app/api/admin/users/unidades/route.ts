import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// GET ?username=X  — master only (or self=true for any logged-in user)
export async function GET(req: NextRequest) {
  const sp       = new URL(req.url).searchParams
  const username = sp.get('username') ?? ''
  const self     = sp.get('self') === 'true'

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Allow self-check (any authenticated user can check their own perms)
  if (self) {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('user_unidades_negocio')
      .select('unidade')
      .eq('username', session.userId)
    if (error) { console.error('[admin/users/unidades]', error.message); return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 }) }
    return NextResponse.json({ unidades: (data ?? []).map((r: { unidade: string }) => r.unidade), configured: (data ?? []).length > 0 })
  }

  if (session.role !== 'master') return NextResponse.json({ error: 'Proibido' }, { status: 403 })
  if (!username) return NextResponse.json({ error: 'username obrigatório' }, { status: 400 })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('user_unidades_negocio')
    .select('unidade')
    .eq('username', username)
  if (error) { console.error('[admin/users/unidades]', error.message); return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 }) }
  return NextResponse.json({ unidades: (data ?? []).map((r: { unidade: string }) => r.unidade), configured: (data ?? []).length > 0 })
}

// POST { username, unidades: string[] }  — master only; replaces the full list
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'master') return NextResponse.json({ error: 'Proibido' }, { status: 403 })

  const { username, unidades } = await req.json() as { username: string; unidades: string[] }
  if (!username) return NextResponse.json({ error: 'username obrigatório' }, { status: 400 })

  const supabase = getSupabase()

  // Delete all existing rows for this user
  const { error: delErr } = await supabase
    .from('user_unidades_negocio')
    .delete()
    .eq('username', username)
  if (delErr) { console.error('[admin/users/unidades]', delErr.message); return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 }) }

  // Insert new rows (if any)
  if (unidades?.length > 0) {
    const rows = unidades.map(u => ({ username, unidade: u }))
    const { error: insErr } = await supabase.from('user_unidades_negocio').insert(rows)
    if (insErr) { console.error('[admin/users/unidades]', insErr.message); return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 }) }
  }

  return NextResponse.json({ configured: unidades?.length > 0 })
}
