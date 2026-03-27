import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getUserCentros } from '@/lib/query'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getValue(b: number, r: number, field: 'budget' | 'razao' | 'variacao') {
  return field === 'budget' ? b : field === 'razao' ? r : r - b
}

function buildTopN(
  rows: { name: string; budget: number; razao: number }[],
  topN: number,
  field: 'budget' | 'razao' | 'variacao'
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

// ─── Contrapartida aggregation (JS-side from lancamentos table) ───────────────

async function getContrapartidaRows(
  periodos: string[],
  activeDepts: string[] | undefined,
  centros: string[] | undefined,
  dreGroup: string
): Promise<{ name: string; budget: number; razao: number }[]> {
  const supabase = getSupabase()

  // Resolve centros: if dept-filtered but no CC restriction, get CCs for those depts
  let ccFilter: string[] | undefined = centros
  if (activeDepts?.length && !centros?.length) {
    const { data: ccData } = await supabase
      .from('centros_custo')
      .select('centro_custo')
      .in('nome_departamento', activeDepts)
    ccFilter = (ccData ?? []).map((r: { centro_custo: string }) => r.centro_custo)
  }

  // Resolve accounts for DRE group filter
  let accountFilter: string[] | undefined
  if (dreGroup) {
    const { data: accs } = await supabase
      .from('contas_contabeis')
      .select('numero_conta_contabil')
      .eq('dre', dreGroup)
    accountFilter = (accs ?? []).map((r: { numero_conta_contabil: string }) => r.numero_conta_contabil)
    if (accountFilter.length === 0) return [] // no accounts in this DRE group
  }

  // Build date range from periodos for efficient index use
  let query = supabase
    .from('lancamentos')
    .select('nome_conta_contrapartida, tipo, debito_credito')
    .not('nome_conta_contrapartida', 'is', null)
    .neq('nome_conta_contrapartida', '')

  if (ccFilter?.length)      query = query.in('centro_custo', ccFilter)
  if (accountFilter?.length) query = query.in('numero_conta_contabil', accountFilter)

  // Date range from periodos (YYYY-MM → first/last day of the range)
  if (periodos.length > 0) {
    const sorted   = [...periodos].sort()
    const dateStart = sorted[0] + '-01'
    const lastP     = sorted[sorted.length - 1]
    const [y, m]    = lastP.split('-').map(Number)
    const dateEnd   = new Date(y, m, 0).toISOString().split('T')[0] // last day of last month
    query = query.gte('data_lancamento', dateStart).lte('data_lancamento', dateEnd)
  }

  const { data, error } = await query.limit(100_000)
  if (error || !data) return []

  // Aggregate by contrapartida (post-filter by exact YYYY-MM if needed)
  const periodSet = new Set(periodos)
  const acc: Record<string, { budget: number; razao: number }> = {}
  for (const r of data) {
    const name = r.nome_conta_contrapartida as string
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
    const field       = (sp.get('field') ?? 'razao') as 'budget' | 'razao' | 'variacao'
    const dreGroup    = sp.get('dreGroup') ?? ''
    const periodosRaw = sp.get('periodos') ?? ''
    const deptsRaw    = sp.get('departamentos') ?? ''
    const groupBy     = sp.get('groupBy') ?? 'agrupamento_arvore'

    const periodos      = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const departamentos = deptsRaw    ? deptsRaw.split(',').filter(Boolean)   : []

    // Auth: dept users can only see their own departments and centros de custo
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

    // Individual centro de custo restrictions
    const userCentros = (user?.role === 'dept' && user.userId)
      ? await getUserCentros(user.userId)
      : null
    const centros = userCentros !== null ? userCentros : undefined

    // ── groupBy=contrapartida ────────────────────────────────────────────────
    if (groupBy === 'contrapartida') {
      const rows = await getContrapartidaRows(periodos, activeDepts, centros, dreGroup)
      const top  = buildTopN(rows, topN, field)

      // dreGroups from DRE (for the filter dropdown in the modal)
      const dreRows = await getDRE(periodos.length ? periodos : [], activeDepts ?? [], centros)
      const dreGroups = [...new Set(dreRows.map(r => r.dre))].filter(Boolean).sort()

      return NextResponse.json({ items: top, dreGroups })
    }

    // ── groupBy=agrupamento_arvore (default) ────────────────────────────────
    const rows = await getDRE(periodos, activeDepts ?? [], centros)

    const acc: Record<string, { budget: number; razao: number }> = {}
    for (const r of rows) {
      if (dreGroup && r.dre !== dreGroup) continue
      if (!acc[r.agrupamento_arvore]) acc[r.agrupamento_arvore] = { budget: 0, razao: 0 }
      acc[r.agrupamento_arvore].budget += r.budget
      acc[r.agrupamento_arvore].razao  += r.razao
    }

    const aggregated = Object.entries(acc).map(([name, { budget, razao }]) => ({ name, budget, razao }))
    const top = buildTopN(aggregated, topN, field)

    const dreGroups = [...new Set(rows.map(r => r.dre))].filter(Boolean).sort()
    return NextResponse.json({ items: top, dreGroups })

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
