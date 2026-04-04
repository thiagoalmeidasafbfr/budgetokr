import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { runAnalysis, getDimensoesDisponiveis } from '@/lib/analysis/engine'
import type { AnalysisConfig } from '@/lib/analysis/engine'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const config: AnalysisConfig = await req.json()
    if (!config?.dimensao || !config?.periodo) {
      return NextResponse.json({ error: 'Config inválida: dimensao e periodo são obrigatórios' }, { status: 400 })
    }

    const supabase = getSupabase()
    const result = await runAnalysis(config, supabase)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[onepage/run]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
