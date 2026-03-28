import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { getUserUnidades } from '@/lib/query'
import { safePct } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const type     = sp.get('type')
    const periodos = sp.get('periodos')?.split(',').filter(Boolean) ?? []
    const unidades = sp.get('unidades')?.split(',').filter(Boolean) ?? []
    const supabase = getSupabase()

    // Forçar filtro de departamento para usuários dept
    const user        = await getSession()
    const forcedDepts = user?.role === 'dept'
      ? (user.departments ?? (user.department ? [user.department] : []))
      : undefined
    const departamentos = forcedDepts?.length ? forcedDepts : []

    // Permissões de unidades por usuário (N:N)
    const userUnidades = (user?.role === 'dept' && user.userId)
      ? await getUserUnidades(user.userId)
      : null

    // Distinct unidades — for dept users, return ONLY explicitly assigned UBs
    if (type === 'distinct_unidades') {
      if (forcedDepts?.length) {
        // Dept user with no UBs assigned → no access to UB page
        if (userUnidades === null) return NextResponse.json([])
        // Dept user with UBs assigned → filter strictly by those UBs (UB is the access control, not CC)
        const { data, error } = await supabase.rpc('get_unidades_negocio_dre', {
          p_periodos:      [],
          p_unidades:      userUnidades,
          p_departamentos: [],
        })
        if (error) throw new Error(error.message)
        const rows = Array.isArray(data) ? data as Array<{ unidade: string }> : []
        const uniqueUnidades = [...new Set(rows.map(r => r.unidade).filter(Boolean))]
        return NextResponse.json(uniqueUnidades.sort())
      }
      // Master user → show all UBs
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
      // Dept user with no UBs assigned → no data
      if (forcedDepts?.length && userUnidades === null) return NextResponse.json([])
      // Dept user with UBs: intersect requested with assigned (UB is the access control, ignore dept/CC)
      // Master user: use requested unidades as-is with no dept restriction
      const filteredUnidades = userUnidades !== null
        ? (unidades.length > 0 ? unidades.filter(u => userUnidades.includes(u)) : userUnidades)
        : unidades
      const { data, error } = await supabase.rpc('get_unidades_negocio_dre', {
        p_periodos:      periodos,
        p_unidades:      filteredUnidades,
        p_departamentos: [],
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
      variacao_pct: safePct((r.razao ?? 0) - (r.budget ?? 0), r.budget),
    })))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
