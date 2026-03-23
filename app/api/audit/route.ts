import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (user?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const sp = new URL(req.url).searchParams
    const page   = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const tabela = sp.get('tabela')
    const regId  = sp.get('registro_id')
    const acao   = sp.get('acao')
    const limit  = 50
    const offset = (page - 1) * limit

    const supabase = getSupabase()
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (tabela) query = query.eq('tabela', tabela)
    if (regId)  query = query.eq('registro_id', parseInt(regId))
    if (acao)   query = query.eq('acao', acao)

    const { data: rows, count, error } = await query
    if (error) throw new Error(error.message)

    const total = count ?? 0
    return NextResponse.json({ rows: rows ?? [], total, page, pages: Math.ceil(total / limit) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
