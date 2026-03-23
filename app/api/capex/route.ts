import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type')

  const supabase = getSupabase()

  // Distinct values for filters
  if (type === 'distinct') {
    const col = sp.get('col') ?? ''
    const colMap: Record<string, string> = {
      nome_departamento: 'nome_departamento',
      departamento:      'departamento',
      centro_custo:      'centro_custo',
      nome_projeto:      'nome_projeto',
    }
    const mappedCol = colMap[col]
    if (!mappedCol) return NextResponse.json([])

    const { data, error } = await supabase.rpc('get_capex_distinct', { p_column: col })
    if (error) return NextResponse.json([])
    return NextResponse.json((data ?? []) as string[])
  }

  // Projetos for a department
  if (type === 'projetos') {
    const dept = sp.get('departamento')
    let query = supabase
      .from('capex')
      .select('nome_projeto')
      .not('nome_projeto', 'is', null)
      .neq('nome_projeto', '')
      .order('nome_projeto')
    if (dept) {
      const { data: ccData } = await supabase
        .from('centros_custo')
        .select('centro_custo')
        .eq('nome_departamento', dept)
      const ccs = (ccData ?? []).map((r: { centro_custo: string }) => r.centro_custo)
      if (ccs.length) query = query.in('centro_custo', ccs)
    }
    const { data } = await query
    const projetos = [...new Set((data ?? []).map((r: { nome_projeto: string }) => r.nome_projeto).filter(Boolean))]
    return NextResponse.json(projetos)
  }

  // Main query via RPC
  const forcedDept = req.headers.get('x-user-role') === 'dept'
    ? req.headers.get('x-user-dept') || undefined
    : undefined

  const departamentos = forcedDept
    ? [forcedDept]
    : sp.get('departamentos')?.split(',').filter(Boolean) ?? []
  const periodos = sp.get('periodos')?.split(',').filter(Boolean) ?? []
  const projetos = sp.get('projetos')?.split(',').filter(Boolean) ?? []
  const groupByProjeto = sp.get('groupByProjeto') !== 'false'
  const groupByCentro = sp.get('groupByCentro') === 'true'

  const { data, error } = await supabase.rpc('get_capex', {
    p_departamentos:  departamentos,
    p_periodos:       periodos,
    p_projetos:       projetos,
    p_group_projeto:  groupByProjeto,
    p_group_centro:   groupByCentro,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(((data ?? []) as Array<{
    nome_projeto?: string; centro_custo?: string; nome_centro_custo?: string
    departamento: string; nome_departamento: string; periodo: string
    budget: number; razao: number
  }>).map(r => ({
    ...r,
    budget: r.budget ?? 0,
    razao: r.razao ?? 0,
    variacao: (r.razao ?? 0) - (r.budget ?? 0),
    variacao_pct: r.budget ? (((r.razao ?? 0) - r.budget) / Math.abs(r.budget)) * 100 : 0,
  })))
}
