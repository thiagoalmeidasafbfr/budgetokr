import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { getDimensoesDisponiveis } from '@/lib/analysis/engine'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const sp = new URL(req.url).searchParams
    const type = sp.get('type')

    const supabase = getSupabase()

    // Return available dimensions for the header selector
    if (type === 'dimensoes') {
      const dimensoes = await getDimensoesDisponiveis(supabase)
      return NextResponse.json(dimensoes)
    }

    // Return saved analyses for this user
    const { data, error } = await supabase
      .from('onepage_analyses')
      .select('id, nome, otica, config, created_at, updated_at')
      .eq('user_id', user.userId)
      .order('updated_at', { ascending: false })

    if (error) throw new Error(error.message)
    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('[onepage/list]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
