import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const type     = sp.get('type')
    const periodos = sp.get('periodos')?.split(',').filter(Boolean) ?? []
    const unidades = sp.get('unidades')?.split(',').filter(Boolean) ?? []
    const supabase = getSupabase()

    // Forçar filtro de departamento para usuários dept
    const user           = await getSession()
    const forcedDept     = user?.role === 'dept' ? user.department : undefined
    const departamentos  = forcedDept ? [forcedDept] : []

    // Distinct unidades — for dept users, only return unidades belonging to their dept
    if (type === 'distinct_unidades') {
      if (forcedDept) {
        // Get unidades filtered by this dept's data
        const { data, error } = await supabase.rpc('get_unidades_negocio_dre', {
          p_periodos:      [],
          p_unidades:      [],
          p_departamentos: [forcedDept],
        })
        if (error) throw new Error(error.message)
        const rows = Array.isArray(data) ? data as Array<{ unidade: string }> : []
        const uniqueUnidades = [...new Set(rows.map(r => r.unidade).filter(Boolean))]
        return NextResponse.json(uniqueUnidades.sort())
      }
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
    // A função retorna JSONB (array único) para contornar o limite de linhas do PostgREST
    if (type === 'dre') {
      const { data, error } = await supabase.rpc('get_unidades_negocio_dre', {
        p_periodos:      periodos,
        p_unidades:      unidades,
        p_departamentos: departamentos,
      })
      if (error) throw new Error(error.message)
      const rows = Array.isArray(data) ? data as Array<{
        unidade: string; dre: string; ordem_dre: number; agrupamento_arvore: string
        numero_conta_contabil: string; nome_conta_contabil: string
        periodo: string; budget: number; razao: number
      }> : []
      return NextResponse.json(rows.map(r => ({
        ...r,
        budget: r.budget ?? 0,
        razao:  r.razao  ?? 0,
      })))
    }

    // Detalhamento de lançamentos individuais
    if (type === 'lancamentos_detail') {
      const { data, error } = await supabase.rpc('get_unidades_negocio_lancamentos_detail', {
        p_unidades:      unidades,
        p_periodos:      periodos,
        p_tipo:          sp.get('tipo')        ?? 'ambos',
        p_dre:           sp.get('dre')         ?? '',
        p_agrupamento:   sp.get('agrupamento') ?? '',
        p_conta:         sp.get('conta')       ?? '',
        p_offset:        Number(sp.get('offset') ?? 0),
        p_limit:         Number(sp.get('limit')  ?? 1000),
        p_departamentos: departamentos,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json(Array.isArray(data) ? data : [])
    }

    // Default: flat unidade + periodo totals (kept for compatibility)
    const { data, error } = await supabase.rpc('get_unidades_negocio_analise', {
      p_periodos:      periodos,
      p_unidades:      unidades,
      p_departamentos: departamentos,
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
