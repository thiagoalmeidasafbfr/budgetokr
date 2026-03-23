import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const type     = sp.get('type')
    const periodos = sp.get('periodos')?.split(',').filter(Boolean) ?? []
    const unidades = sp.get('unidades')?.split(',').filter(Boolean) ?? []
    const supabase = getSupabase()

    // Distinct unidades — uses dedicated RPC that returns ~11 rows max
    if (type === 'distinct_unidades') {
      const { data, error } = await supabase.rpc('get_distinct_unidades')
      if (error) throw new Error(error.message)
      return NextResponse.json((data ?? []).map((r: { unidade: string }) => r.unidade))
    }

    // Distinct periodos — uses dedicated RPC that returns ~24 rows max
    if (type === 'distinct_periodos') {
      const { data, error } = await supabase.rpc('get_distinct_periodos')
      if (error) throw new Error(error.message)
      return NextResponse.json((data ?? []).map((r: { periodo: string }) => r.periodo))
    }

    // DRE breakdown: unidade > dre > agrupamento > periodo
    if (type === 'dre') {
      const { data, error } = await supabase.rpc('get_unidades_negocio_dre', {
        p_periodos: periodos,
        p_unidades: unidades,
      }).range(0, 99999)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as Array<{
        unidade: string; dre: string; ordem_dre: number; agrupamento_arvore: string
        numero_conta_contabil: string; nome_conta_contabil: string
        periodo: string; budget: number; razao: number
      }>
      return NextResponse.json(rows.map(r => ({
        ...r,
        budget: r.budget ?? 0,
        razao:  r.razao  ?? 0,
      })))
    }

    // Default: flat unidade + periodo totals (kept for compatibility)
    const { data, error } = await supabase.rpc('get_unidades_negocio_analise', {
      p_periodos: periodos,
      p_unidades: unidades,
    })
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as Array<{ unidade: string; periodo: string; budget: number; razao: number }>
    return NextResponse.json(rows.map(r => ({
      ...r,
      budget:       r.budget ?? 0,
      razao:        r.razao  ?? 0,
      variacao:     (r.razao ?? 0) - (r.budget ?? 0),
      variacao_pct: r.budget ? (((r.razao ?? 0) - (r.budget ?? 0)) / Math.abs(r.budget)) * 100 : 0,
    })))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
