import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { getBiDimensoes } from '@/lib/bi/engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const supabase   = getSupabase()
    const dimensoes  = await getBiDimensoes(supabase)
    return NextResponse.json(dimensoes)
  } catch (e) {
    console.error('[api/bi/dimensoes]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 })
  }
}
