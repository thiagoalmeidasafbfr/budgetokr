import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { runBiQuery } from '@/lib/bi/engine'
import type { WidgetConfig } from '@/lib/bi/widget-types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { widgetConfig }: { widgetConfig: WidgetConfig } = await req.json()
    if (!widgetConfig?.visual || !widgetConfig?.metrica || !widgetConfig?.scope) {
      return NextResponse.json({ error: 'widgetConfig inválido' }, { status: 400 })
    }

    const supabase = getSupabase()
    const result   = await runBiQuery(widgetConfig, supabase)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[api/bi/query]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 })
  }
}
