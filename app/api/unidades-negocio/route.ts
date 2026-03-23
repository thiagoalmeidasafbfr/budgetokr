import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const periodos = sp.get('periodos')?.split(',').filter(Boolean) ?? []
    const unidades = sp.get('unidades')?.split(',').filter(Boolean) ?? []
    const supabase = getSupabase()

    // Distinct unidades for filter options
    if (sp.get('type') === 'distinct_unidades') {
      const { data, error } = await supabase
        .from('unidades_negocio')
        .select('unidade')
        .not('unidade', 'is', null)
        .neq('unidade', '')
        .order('unidade')
      if (error) throw new Error(error.message)
      const unique = [...new Set((data ?? []).map(r => r.unidade).filter(Boolean))]
      return NextResponse.json(unique)
    }

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
