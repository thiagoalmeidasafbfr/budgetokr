import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

function masterOnly(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  return null
}

// GET /api/admin/users/centros?username=X
// Retorna os centros configurados para o usuário.
// Resposta: { centros: string[], configured: boolean }
// configured=false → sem restrição (vê tudo do dept)
export async function GET(req: NextRequest) {
  const deny = masterOnly(req)
  if (deny) return deny
  const username = new URL(req.url).searchParams.get('username')
  if (!username) return NextResponse.json({ error: 'username obrigatório' }, { status: 400 })
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('user_centros_custo')
      .select('centro_custo')
      .eq('username', username)
    if (error) throw new Error(error.message)
    const centros = (data ?? []).map((r: { centro_custo: string }) => r.centro_custo)
    return NextResponse.json({ centros, configured: centros.length > 0 })
  } catch (e) {
    console.error('[admin/users/centros]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// POST /api/admin/users/centros
// Body: { username: string, centros: string[] }
// Substitui toda a lista de centros do usuário.
// Enviar centros=[] para remover restrição (acesso total ao dept).
export async function POST(req: NextRequest) {
  const deny = masterOnly(req)
  if (deny) return deny
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { username, centros } = body as { username: string; centros: string[] }
    if (!username) return NextResponse.json({ error: 'username obrigatório' }, { status: 400 })
    if (!Array.isArray(centros)) return NextResponse.json({ error: 'centros deve ser array' }, { status: 400 })

    // Remove todos os centros atuais do usuário
    const { error: delError } = await supabase
      .from('user_centros_custo')
      .delete()
      .eq('username', username)
    if (delError) throw new Error(delError.message)

    // Insere novos se houver
    if (centros.length > 0) {
      const rows = centros.map(cc => ({ username, centro_custo: cc }))
      const { error: insError } = await supabase
        .from('user_centros_custo')
        .insert(rows)
      if (insError) throw new Error(insError.message)
    }

    return NextResponse.json({ ok: true, configured: centros.length > 0 })
  } catch (e) {
    console.error('[admin/users/centros]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
