import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getDREByAccount, getUserCentros, getAnalise } from '@/lib/query'
import type { FilterCondition } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

type Field   = 'budget' | 'razao' | 'variacao'
type GroupBy = 'agrupamento_arvore' | 'dre' | 'conta_contabil' | 'centro_custo' | 'contrapartida' | 'departamento' | 'unidade_negocio'

function getValue(b: number, r: number, field: Field) {
  return field === 'budget' ? b : field === 'razao' ? r : r - b
}

function buildTopN(
  rows: { name: string; budget: number; razao: number }[],
  topN: number,
  field: Field,
  sortOrder: 'desc' | 'asc' = 'desc'
) {
  const sorted = rows
    .map(r => ({ ...r, variacao: r.razao - r.budget, value: getValue(r.budget, r.razao, field) }))
    .sort((a, b) => sortOrder === 'asc' ? a.value - b.value : b.value - a.value)

  const top  = sorted.slice(0, topN)
  const rest = sorted.slice(topN)
  if (rest.length > 0) {
    const ob = rest.reduce((s, r) => s + r.budget, 0)
    const or = rest.reduce((s, r) => s + r.razao,  0)
    top.push({ name: `Outros (${rest.length})`, budget: ob, razao: or, variacao: or - ob, value: getValue(ob, or, field) })
  }
  return top
}

// ─── Resolve centros helper (dept → CC list) ──────────────────────────────────

async function resolveCentros(
  activeDepts: string[] | undefined,
  centros: string[] | undefined
): Promise<string[] | undefined> {
  if (centros?.length) return centros                         // explicit CC restriction wins
  if (!activeDepts?.length) return undefined                  // no dept filter → no CC filter
  const { data } = await getSupabase()
    .from('centros_custo')
    .select('centro_custo')
    .in('nome_departamento', activeDepts)
  return (data ?? []).map((r: { centro_custo: string }) => r.centro_custo)
}

// ─── lancamentos-based aggregation (centro_custo / contrapartida) ─────────────

async function getLancamentosRows(
  periodos: string[],
  ccFilter: string[] | undefined,
  accountFilter: string[] | undefined,
  groupCol: 'centro_custo' | 'nome_conta_contrapartida'
): Promise<{ name: string; budget: number; razao: number }[]> {
  let q = getSupabase()
    .from('lancamentos')
    .select(`${groupCol}, tipo, debito_credito`)
    .not(groupCol, 'is', null)
    .neq(groupCol, '')

  if (ccFilter?.length)      q = q.in('centro_custo', ccFilter)
  if (accountFilter?.length) q = q.in('numero_conta_contabil', accountFilter)

  if (periodos.length) {
    const sorted    = [...periodos].sort()
    const dateStart = sorted[0] + '-01'
    const [y, m]    = sorted[sorted.length - 1].split('-').map(Number)
    const dateEnd   = new Date(y, m, 0).toISOString().split('T')[0]
    q = q.gte('data_lancamento', dateStart).lte('data_lancamento', dateEnd)
  }

  const { data, error } = await q.limit(100_000)
  if (error || !data) return []

  const acc: Record<string, { budget: number; razao: number }> = {}
  for (const r of data) {
    const name = r[groupCol] as string
    if (!name) continue
    if (!acc[name]) acc[name] = { budget: 0, razao: 0 }
    if (r.tipo === 'budget') acc[name].budget += (r.debito_credito as number)
    else                     acc[name].razao  += (r.debito_credito as number)
  }
  return Object.entries(acc).map(([name, v]) => ({ name, ...v }))
}

// ─── Resolve CC codes → names ─────────────────────────────────────────────────

async function resolveCCNames(
  rows: { name: string; budget: number; razao: number }[]
): Promise<{ name: string; budget: number; razao: number }[]> {
  const codes = rows.map(r => r.name).filter(Boolean)
  if (!codes.length) return rows
  const { data } = await getSupabase()
    .from('centros_custo')
    .select('centro_custo, nome_centro_custo')
    .in('centro_custo', codes)
  const map: Record<string, string> = {}
  for (const r of (data ?? []) as { centro_custo: string; nome_centro_custo: string }[]) {
    if (r.centro_custo && r.nome_centro_custo) map[r.centro_custo] = r.nome_centro_custo
  }
  return rows.map(r => ({ ...r, name: map[r.name] ?? r.name }))
}

// ─── unidades_negocio aggregation (via id_cc_cc join) ────────────────────────

async function getLancamentosRowsByUnidade(
  periodos: string[],
  ccFilter: string[] | undefined,
  accountFilter: string[] | undefined
): Promise<{ name: string; budget: number; razao: number }[]> {
  let q = getSupabase()
    .from('lancamentos')
    .select('id_cc_cc, tipo, debito_credito')
    .not('id_cc_cc', 'is', null)
    .neq('id_cc_cc', '')

  if (ccFilter?.length)      q = q.in('centro_custo', ccFilter)
  if (accountFilter?.length) q = q.in('numero_conta_contabil', accountFilter)

  if (periodos.length) {
    const sorted    = [...periodos].sort()
    const dateStart = sorted[0] + '-01'
    const [y, m]    = sorted[sorted.length - 1].split('-').map(Number)
    const dateEnd   = new Date(y, m, 0).toISOString().split('T')[0]
    q = q.gte('data_lancamento', dateStart).lte('data_lancamento', dateEnd)
  }

  const { data, error } = await q.limit(100_000)
  if (error || !data) return []

  // Accumulate by id_cc_cc first
  const idccAcc: Record<string, { budget: number; razao: number }> = {}
  for (const r of data) {
    const idcc = r.id_cc_cc as string
    if (!idcc) continue
    if (!idccAcc[idcc]) idccAcc[idcc] = { budget: 0, razao: 0 }
    if (r.tipo === 'budget') idccAcc[idcc].budget += (r.debito_credito as number)
    else                     idccAcc[idcc].razao  += (r.debito_credito as number)
  }

  const idccs = Object.keys(idccAcc)
  if (!idccs.length) return []

  // Resolve id_cc_cc → unidade
  const { data: unData } = await getSupabase()
    .from('unidades_negocio')
    .select('id_cc_cc, unidade')
    .in('id_cc_cc', idccs)

  const idToUnidade: Record<string, string> = {}
  for (const r of (unData ?? []) as { id_cc_cc: string; unidade: string }[]) {
    if (r.id_cc_cc) idToUnidade[r.id_cc_cc] = r.unidade || 'Sem Unidade'
  }

  // Aggregate by unidade
  const acc: Record<string, { budget: number; razao: number }> = {}
  for (const [idcc, vals] of Object.entries(idccAcc)) {
    const unidade = idToUnidade[idcc] || 'Sem Unidade'
    if (!acc[unidade]) acc[unidade] = { budget: 0, razao: 0 }
    acc[unidade].budget += vals.budget
    acc[unidade].razao  += vals.razao
  }
  return Object.entries(acc).map(([name, v]) => ({ name, ...v }))
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sp          = new URL(req.url).searchParams
    const topN        = Math.min(Math.max(parseInt(sp.get('topN') ?? '5'), 1), 30)
    const field       = (sp.get('field') ?? 'razao') as Field
    const sortOrder   = (sp.get('sortOrder') === 'asc' ? 'asc' : 'desc') as 'desc' | 'asc'
    const dreGroup    = sp.get('dreGroup') ?? ''
    const periodosRaw = sp.get('periodos') ?? ''
    const deptsRaw    = sp.get('departamentos') ?? ''
    const groupBy     = (sp.get('groupBy') ?? 'agrupamento_arvore') as GroupBy

    const periodos      = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const departamentos = deptsRaw    ? deptsRaw.split(',').filter(Boolean)   : []

    // Auth
    const user = await getSession()
    const forcedDepts = user?.role === 'dept'
      ? (user.departments ?? (user.department ? [user.department] : []))
      : undefined

    const activeDepts = forcedDepts?.length
      ? departamentos.length
        ? departamentos.filter(d => forcedDepts.includes(d)).length
          ? departamentos.filter(d => forcedDepts.includes(d))
          : forcedDepts
        : forcedDepts
      : departamentos.length ? departamentos : undefined

    const userCentros = (user?.role === 'dept' && user.userId)
      ? await getUserCentros(user.userId)
      : null
    const authCentros = userCentros !== null ? userCentros : undefined

    // ── Department-level grouping (via lancamentos → CC → nome_departamento) ──
    if (groupBy === 'departamento') {
      const ccFilter = await resolveCentros(activeDepts, authCentros)

      let accountFilter: string[] | undefined
      if (dreGroup) {
        const { data: accs } = await getSupabase()
          .from('contas_contabeis')
          .select('numero_conta_contabil')
          .eq('dre', dreGroup)
        accountFilter = (accs ?? []).map((r: { numero_conta_contabil: string }) => r.numero_conta_contabil)
        if (accountFilter.length === 0) {
          const dreRowsEmpty = await getDRE(periodos, activeDepts ?? [], authCentros)
          const dreGroupsEmpty = [...new Set(dreRowsEmpty.map(r => r.dre))].filter(Boolean).sort()
          return NextResponse.json({ items: [], dreGroups: dreGroupsEmpty })
        }
      }

      const ccRows = await getLancamentosRows(periodos, ccFilter, accountFilter, 'centro_custo')
      const codes  = ccRows.map(r => r.name).filter(Boolean)
      const deptAcc: Record<string, { budget: number; razao: number }> = {}

      if (codes.length) {
        const { data: ccData } = await getSupabase()
          .from('centros_custo')
          .select('centro_custo, nome_departamento')
          .in('centro_custo', codes)
        const ccToDept: Record<string, string> = {}
        for (const r of (ccData ?? []) as { centro_custo: string; nome_departamento: string }[]) {
          if (r.centro_custo && r.nome_departamento) ccToDept[r.centro_custo] = r.nome_departamento
        }
        for (const r of ccRows) {
          const deptName = ccToDept[r.name] || r.name
          if (!deptAcc[deptName]) deptAcc[deptName] = { budget: 0, razao: 0 }
          deptAcc[deptName].budget += r.budget
          deptAcc[deptName].razao  += r.razao
        }
      }

      const aggregated = Object.entries(deptAcc).map(([name, { budget, razao }]) => ({ name, budget, razao }))
      const dreRowsDept = await getDRE(periodos, activeDepts ?? [], authCentros)
      const dreGroupsDept = [...new Set(dreRowsDept.map(r => r.dre))].filter(Boolean).sort()
      return NextResponse.json({ items: buildTopN(aggregated, topN, field, sortOrder), dreGroups: dreGroupsDept })
    }

    // ── Unidade de Negócio grouping (via lancamentos → unidades_negocio) ──────
    if (groupBy === 'unidade_negocio') {
      const ccFilter = await resolveCentros(activeDepts, authCentros)

      let accountFilter: string[] | undefined
      if (dreGroup) {
        const { data: accs } = await getSupabase()
          .from('contas_contabeis')
          .select('numero_conta_contabil')
          .eq('dre', dreGroup)
        accountFilter = (accs ?? []).map((r: { numero_conta_contabil: string }) => r.numero_conta_contabil)
        if (accountFilter.length === 0) {
          const dreRowsEmpty = await getDRE(periodos, activeDepts ?? [], authCentros)
          const dreGroupsEmpty = [...new Set(dreRowsEmpty.map(r => r.dre))].filter(Boolean).sort()
          return NextResponse.json({ items: [], dreGroups: dreGroupsEmpty })
        }
      }

      const rows = await getLancamentosRowsByUnidade(periodos, ccFilter, accountFilter)
      const dreRowsUn = await getDRE(periodos, activeDepts ?? [], authCentros)
      const dreGroupsUn = [...new Set(dreRowsUn.map(r => r.dre))].filter(Boolean).sort()
      return NextResponse.json({ items: buildTopN(rows, topN, field, sortOrder), dreGroups: dreGroupsUn })
    }

    // ── DRE-based groupings (agrupamento_arvore, dre) ────────────────────────
    if (groupBy === 'agrupamento_arvore' || groupBy === 'dre') {
      const rows = await getDRE(periodos, activeDepts ?? [], authCentros)
      const dreGroups = [...new Set(rows.map(r => r.dre))].filter(Boolean).sort()

      const acc: Record<string, { budget: number; razao: number }> = {}
      for (const r of rows) {
        if (dreGroup && r.dre !== dreGroup) continue
        // agrupamento_arvore comes as '' (empty string) when NULL in DB — use fallback
        const key = groupBy === 'dre' ? r.dre : (r.agrupamento_arvore || '(Sem agrupamento)')
        if (!key) continue
        if (!acc[key]) acc[key] = { budget: 0, razao: 0 }
        acc[key].budget += r.budget
        acc[key].razao  += r.razao
      }

      const aggregated = Object.entries(acc).map(([name, { budget, razao }]) => ({ name, budget, razao }))
      return NextResponse.json({ items: buildTopN(aggregated, topN, field, sortOrder), dreGroups })
    }

    // ── Account-level grouping ───────────────────────────────────────────────
    if (groupBy === 'conta_contabil') {
      const rows = await getDREByAccount(periodos, activeDepts ?? [], authCentros)
      const dreGroups = [...new Set(rows.map(r => r.dre))].filter(Boolean).sort()

      const acc: Record<string, { budget: number; razao: number }> = {}
      for (const r of rows) {
        if (dreGroup && r.dre !== dreGroup) continue
        const key = r.nome_conta_contabil || r.numero_conta_contabil
        if (!key) continue
        if (!acc[key]) acc[key] = { budget: 0, razao: 0 }
        acc[key].budget += r.budget
        acc[key].razao  += r.razao
      }

      const aggregated = Object.entries(acc).map(([name, { budget, razao }]) => ({ name, budget, razao }))
      return NextResponse.json({ items: buildTopN(aggregated, topN, field, sortOrder), dreGroups })
    }

    // ── centro_custo grouping — uses getAnalise for correct dept+DRE scoping ──
    if (groupBy === 'centro_custo') {
      const dreFilters: FilterCondition[] = dreGroup
        ? [{ column: 'dre', operator: '=', value: dreGroup, logic: 'AND' }]
        : []
      const analyseRows = await getAnalise(dreFilters, activeDepts ? [...activeDepts] : [], periodos, true, authCentros ?? [])

      const acc: Record<string, { budget: number; razao: number }> = {}
      for (const r of analyseRows) {
        const key = (r as Record<string, unknown>)['nome_centro_custo'] as string
                 || (r as Record<string, unknown>)['centro_custo'] as string
        if (!key) continue
        if (!acc[key]) acc[key] = { budget: 0, razao: 0 }
        acc[key].budget += r.budget
        acc[key].razao  += r.razao
      }

      const aggregated = Object.entries(acc).map(([name, v]) => ({ name, ...v }))
      const dreRowsCC = await getDRE(periodos, activeDepts ?? [], authCentros)
      const dreGroupsCC = [...new Set(dreRowsCC.map(r => r.dre))].filter(Boolean).sort()
      return NextResponse.json({ items: buildTopN(aggregated, topN, field, sortOrder), dreGroups: dreGroupsCC })
    }

    // ── contrapartida grouping (lancamentos-based) ────────────────────────────
    const ccFilter = await resolveCentros(activeDepts, authCentros)

    let accountFilter: string[] | undefined
    if (dreGroup) {
      const { data: accs } = await getSupabase()
        .from('contas_contabeis')
        .select('numero_conta_contabil')
        .eq('dre', dreGroup)
      accountFilter = (accs ?? []).map((r: { numero_conta_contabil: string }) => r.numero_conta_contabil)
      if (accountFilter.length === 0) {
        const dreRows = await getDRE(periodos, activeDepts ?? [], authCentros)
        const dreGroups = [...new Set(dreRows.map(r => r.dre))].filter(Boolean).sort()
        return NextResponse.json({ items: [], dreGroups })
      }
    }

    const rows = await getLancamentosRows(periodos, ccFilter, accountFilter, 'nome_conta_contrapartida')

    const dreRows = await getDRE(periodos.length ? periodos : [], activeDepts ?? [], authCentros)
    const dreGroups = [...new Set(dreRows.map(r => r.dre))].filter(Boolean).sort()

    return NextResponse.json({ items: buildTopN(rows, topN, field, sortOrder), dreGroups })

  } catch (e) {
    console.error('[exec-chart]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
