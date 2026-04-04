import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import type { BiDashboard } from '@/lib/bi/widget-types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('bi_dashboards')
      .select('*')
      .eq('user_id', user.userId)
      .single()

    if (error && error.code !== 'PGRST116') throw new Error(error.message)

    if (!data) {
      const now = new Date()
      return NextResponse.json({
        id:             '',
        user_id:        user.userId,
        nome:           'Meu Dashboard',
        periodo_global: { tipo: 'mes', mes: now.getMonth() + 1, ano: now.getFullYear() },
        widgets:        [],
        atualizado_em:  now.toISOString(),
      })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('[api/bi/dashboard GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body: BiDashboard = await req.json()

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('bi_dashboards')
      .upsert(
        {
          user_id:        user.userId,
          nome:           body.nome ?? 'Meu Dashboard',
          periodo_global: body.periodo_global as unknown as Record<string,unknown>,
          widgets:        body.widgets as unknown as Record<string,unknown>[],
          atualizado_em:  new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ id: data?.id })
  } catch (e) {
    console.error('[api/bi/dashboard POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 })
  }
}
