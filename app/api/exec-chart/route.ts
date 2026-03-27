import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getDREByAccount, getUserCentros } from '@/lib/query'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

type Field   = 'budget' | 'razao' | 'variacao'
type GroupBy = 'agrupamento_arvore' | 'dre' | 'conta_contabil' | 'centro_custo' | 'contrapartida'

function getValue(b: number, r: number, field: Field) {
  return field === 'budget' ? b : field === 'razao' ? r : r - b
}

function buildTopN(
  rows: { name: string; budget: number; razao: number }[],
  topN: number,
  field: Field
) {
  const sorted = rows
    .map(r => ({ ...r, variacao: r.razao - r.budget, value: getValue(r.budget, r.razao, field) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

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

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sp          = new URL(req.url).searchParams
    const topN        = Math.min(Math.max(parseInt(sp.get('topN') ?? '5'), 1), 30)
    const field       = (sp.get('field') ?? 'razao') as Field
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

    // ── DRE-based groupings (agrupamento_arvore, dre) ────────────────────────
    if (groupBy === 'agrupamento_arvore' || groupBy === 'dre') {
      const rows = await getDRE(periodos, activeDepts ?? [], authCentros)
      const dreGroups = [...new Set(rows.map(r => r.dre))].filter(Boolean).sort()

      const acc: Record<string, { budget: number; razao: number }> = {}
      for (const r of rows) {
        if (dreGroup && r.dre !== dreGroup) continue
        const key = groupBy === 'dre' ? r.dre : r.agrupamento_arvore
        if (!key) continue
        if (!acc[key]) acc[key] = { budget: 0, razao: 0 }
        acc[key].budget += r.budget
        acc[key].razao  += r.razao
      }

      const aggregated = Object.entries(acc).map(([name, { budget, razao }]) => ({ name, budget, razao }))
      return NextResponse.json({ items: buildTopN(aggregated, topN, field), dreGroups })
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
      return NextResponse.json({ items: buildTopN(aggregated, topN, field), dreGroups })
    }

    // ── lancamentos-based groupings (centro_custo, contrapartida) ────────────
    const ccFilter = await resolveCentros(activeDepts, authCentros)

    let accountFilter: string[] | undefined
    if (dreGroup) {
      const { data: accs } = await getSupabase()
        .from('contas_contabeis')
        .select('numero_conta_contabil')
        .eq('dre', dreGroup)
      accountFilter = (accs ?? []).map((r: { numero_conta_contabil: string }) => r.numero_conta_contabil)
      if (accountFilter.length === 0) {
        // Get dreGroups for the empty result still
        const dreRows = await getDRE(periodos, activeDepts ?? [], authCentros)
        const dreGroups = [...new Set(dreRows.map(r => r.dre))].filter(Boolean).sort()
        return NextResponse.json({ items: [], dreGroups })
      }
    }

    const groupCol = groupBy === 'contrapartida' ? 'nome_conta_contrapartida' : 'centro_custo'
    const rows = await getLancamentosRows(periodos, ccFilter, accountFilter, groupCol)

    // dreGroups for filter selector
    const dreRows = await getDRE(periodos.length ? periodos : [], activeDepts ?? [], authCentros)
    const dreGroups = [...new Set(dreRows.map(r => r.dre))].filter(Boolean).sort()

    return NextResponse.json({ items: buildTopN(rows, topN, field), dreGroups })

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
