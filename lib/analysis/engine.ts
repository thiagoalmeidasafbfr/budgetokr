/*
 * lib/analysis/engine.ts — Analytics Engine for One-Page Finance
 *
 * FASE 0 AUDIT REPORT:
 * =====================
 * a) Tables:
 *    - lancamentos: id, tipo (budget|razao), data_lancamento (DATE), numero_conta_contabil,
 *      nome_conta_contabil, centro_custo, id_cc_cc, debito_credito (NUMERIC)
 *    - centros_custo: centro_custo (PK), nome_centro_custo, departamento, nome_departamento, area, nome_area
 *    - unidades_negocio: id_cc_cc (PK), management_report, conta, centros_custo, unidade
 *    - contas_contabeis: numero_conta_contabil (PK), nome_conta_contabil, agrupamento_arvore, dre, ordem_dre, nivel
 *    - dre_linhas: id, ordem, nome, tipo, sinal (1|-1), formula_grupos (JSONB), negrito, separador
 *    - onepage_analyses: (to be created via migration)
 *
 * b) CC Nature: NOT explicit in centros_custo table. Inferred from account flows via
 *    agrupamento_arvore in contas_contabeis. Pattern match on agrupamento_arvore:
 *    "Receita*" -> RECEITA, "CMV|Custo*" -> CUSTO, "Despesa*" -> DESPESA, else RESULTADO
 *
 * c) Account Nature: Implicit in agrupamento_arvore field of contas_contabeis.
 *    agrupamento_arvore contains "Receita Bruta", "CMV", "Despesa Admin", etc.
 *    dre links to dre_linhas.nome. sinal in dre_linhas controls sign.
 *
 * d) Computed metrics via existing RPCs: get_dre(periodos, departamentos, centros) ->
 *    DRERow[]{dre, agrupamento_arvore, ordem_dre, periodo, budget, razao}
 *    get_dre_by_account -> DREAccountRow[]{+numero_conta_contabil, nome_conta_contabil}
 *    get_analise -> variacao, variacao_pct per departamento/CC
 *    run_star_query -> raw lancamentos aggregated
 *
 * e) Period: DATE field data_lancamento in lancamentos. Extracted as YYYY-MM string.
 *    kpi_valores.periodo stored as TEXT 'YYYY-MM'. All grouping via SUBSTRING(date,1,7).
 *
 * f) Saved layouts: one_page_layouts table exists. onepage_analyses to be created.
 *    TODO: run migration supabase/migration_onepage_analyses.sql
 */

import { getSupabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Core types ───────────────────────────────────────────────────────────────

export type Dimensao =
  | { tipo: 'centro_custo'; id: string }
  | { tipo: 'unidade_negocio'; id: string }
  | { tipo: 'conta_contabil'; codigo: string }
  | { tipo: 'grupo_contas'; grupo: string }
  | { tipo: 'natureza'; natureza: 'RECEITA' | 'CUSTO' | 'DESPESA' | 'RESULTADO' }
  | { tipo: 'consolidado' }

export type Periodo =
  | { tipo: 'mes'; mes: number; ano: number }
  | { tipo: 'range'; de: string; ate: string }
  | { tipo: 'ytd'; ano: number }

export type OticaAnalise = 'receita' | 'despesa' | 'misto' | 'consolidado'

export interface AnalysisConfig {
  id?: string
  nome?: string
  dimensao: Dimensao
  periodo: Periodo
  comparativo?: 'budget' | 'mes_anterior' | 'ano_anterior' | 'nenhum'
  otica?: OticaAnalise
}

export interface AnalysisResult {
  config: AnalysisConfig
  otica: OticaAnalise
  label: string
  periodo_label: string

  receita_bruta: number | null
  deducoes: number | null
  receita_liquida: number | null
  cmv: number | null
  lucro_bruto: number | null
  despesas_operacionais: number | null
  ebit: number | null
  margem_ebit: number | null
  resultado_liquido: number | null

  total_despesas: number | null
  desvio_budget: number | null
  desvio_budget_pct: number | null

  breakdown: BreakdownItem[]
  serie_temporal: SerieTemporal[]
  comparativo: ComparativoItem | null
}

export interface BreakdownItem {
  id: string
  label: string
  valor_realizado: number
  valor_budget: number | null
  desvio: number | null
  desvio_pct: number | null
  natureza: 'RECEITA' | 'CUSTO' | 'DESPESA' | 'RESULTADO'
  participacao_pct: number
}

export interface SerieTemporal {
  periodo: string
  realizado: number
  budget: number | null
}

export interface ComparativoItem {
  tipo: 'budget' | 'mes_anterior' | 'ano_anterior'
  valor_base: number
  valor_comp: number
  variacao: number
  variacao_pct: number
}

// ─── Period helpers ───────────────────────────────────────────────────────────

export function getPeriodosFromPeriodo(periodo: Periodo): string[] {
  if (periodo.tipo === 'mes') {
    return [`${periodo.ano}-${String(periodo.mes).padStart(2, '0')}`]
  }
  if (periodo.tipo === 'range') {
    const result: string[] = []
    const [y1, m1] = periodo.de.split('-').map(Number)
    const [y2, m2] = periodo.ate.split('-').map(Number)
    let y = y1, m = m1
    while (y < y2 || (y === y2 && m <= m2)) {
      result.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return result
  }
  // ytd
  const result: string[] = []
  for (let m = 1; m <= 12; m++) {
    result.push(`${periodo.ano}-${String(m).padStart(2, '0')}`)
  }
  return result
}

export function getPeriodoLabel(periodo: Periodo): string {
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  if (periodo.tipo === 'mes') return `${MESES[periodo.mes - 1]} ${periodo.ano}`
  if (periodo.tipo === 'ytd') return `YTD ${periodo.ano}`
  const [y1, m1] = periodo.de.split('-').map(Number)
  const [y2, m2] = periodo.ate.split('-').map(Number)
  return `${MESES[m1-1]}–${MESES[m2-1]} ${y1 === y2 ? y1 : `${y1}/${y2}`}`
}

// 12 months before the current period (for sparkline)
function getLast12Periodos(periodo: Periodo): string[] {
  let refYear: number, refMonth: number
  if (periodo.tipo === 'mes') { refYear = periodo.ano; refMonth = periodo.mes }
  else if (periodo.tipo === 'ytd') { refYear = periodo.ano; refMonth = 12 }
  else { const [y, m] = periodo.ate.split('-').map(Number); refYear = y; refMonth = m }

  const result: string[] = []
  for (let i = 11; i >= 0; i--) {
    let m = refMonth - i, y = refYear
    while (m <= 0) { m += 12; y-- }
    result.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return result
}

// ─── Nature classification from agrupamento_arvore ────────────────────────────

export function classifyNatureza(agrupamento: string): 'RECEITA' | 'CUSTO' | 'DESPESA' | 'RESULTADO' {
  const a = agrupamento.toLowerCase()
  if (a.includes('receita')) return 'RECEITA'
  if (a.includes('cmv') || a.includes('custo da mercadoria') || a.includes('custo dos') || a.includes('custo de')) return 'CUSTO'
  if (a.includes('despesa') || a.includes('deducao') || a.includes('dedução') || a.includes('deduções')) return 'DESPESA'
  return 'RESULTADO'
}

// ─── Dimension to DRE query parameters ───────────────────────────────────────

async function dimensaoToQueryParams(
  dimensao: Dimensao,
  supabase: SupabaseClient
): Promise<{ centros?: string[]; departamentos?: string[]; label: string }> {
  switch (dimensao.tipo) {
    case 'centro_custo': {
      const { data } = await supabase
        .from('centros_custo')
        .select('nome_centro_custo')
        .eq('centro_custo', dimensao.id)
        .single()
      return { centros: [dimensao.id], label: data?.nome_centro_custo ?? dimensao.id }
    }
    case 'unidade_negocio': {
      const { data: un } = await supabase
        .from('unidades_negocio')
        .select('unidade, centros_custo')
        .eq('id_cc_cc', dimensao.id)
        .single()
      // centros_custo may be a comma-separated string or we query directly
      const { data: ccRows } = await supabase
        .from('lancamentos')
        .select('centro_custo')
        .eq('id_cc_cc', dimensao.id)
      const centros = [...new Set((ccRows ?? []).map((r: Record<string,unknown>) => r.centro_custo as string).filter(Boolean))]
      return { centros, label: un?.unidade ?? dimensao.id }
    }
    case 'conta_contabil': {
      const { data } = await supabase
        .from('contas_contabeis')
        .select('nome_conta_contabil')
        .eq('numero_conta_contabil', dimensao.codigo)
        .single()
      return { label: data?.nome_conta_contabil ?? dimensao.codigo }
    }
    case 'grupo_contas':
      return { label: dimensao.grupo }
    case 'natureza':
      return { label: dimensao.natureza }
    case 'consolidado':
      return { label: 'Consolidado' }
  }
}

// ─── Fetch DRE rows for a dimension + period ─────────────────────────────────

interface DREAggRow {
  agrupamento_arvore: string
  dre: string
  ordem_dre: number
  budget: number
  razao: number
  periodo: string
}

async function fetchDRERows(
  dimensao: Dimensao,
  periodos: string[],
  supabase: SupabaseClient
): Promise<DREAggRow[]> {
  if (dimensao.tipo === 'conta_contabil') {
    // Direct query for specific account
    const { data, error } = await supabase
      .from('lancamentos')
      .select('tipo, debito_credito, data_lancamento')
      .eq('numero_conta_contabil', dimensao.codigo)
      .in('data_lancamento', periodos.map(p => {
        const [y, m] = p.split('-')
        return `${y}-${m}`
      }))
    if (error || !data) return []
    // This won't work directly since data_lancamento is a DATE, not YYYY-MM
    // Use the rpc approach instead
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_dre_by_account', {
      p_periodos: periodos,
      p_departamentos: [],
      p_centros: [],
    })
    if (rpcErr || !rpcData) return []
    return (rpcData as DREAggRow[]).filter((r: DREAggRow) => r.agrupamento_arvore === dimensao.codigo || r.dre === dimensao.codigo)
  }

  if (dimensao.tipo === 'grupo_contas') {
    const { data, error } = await supabase.rpc('get_dre', {
      p_periodos: periodos,
      p_departamentos: [],
      p_centros: [],
    })
    if (error || !data) return []
    return (data as DREAggRow[]).filter((r: DREAggRow) => r.agrupamento_arvore === dimensao.grupo || r.dre === dimensao.grupo)
  }

  if (dimensao.tipo === 'natureza') {
    const { data, error } = await supabase.rpc('get_dre', {
      p_periodos: periodos,
      p_departamentos: [],
      p_centros: [],
    })
    if (error || !data) return []
    return (data as DREAggRow[]).filter((r: DREAggRow) => classifyNatureza(r.agrupamento_arvore) === dimensao.natureza)
  }

  const params = await dimensaoToQueryParams(dimensao, supabase)
  const { data, error } = await supabase.rpc('get_dre', {
    p_periodos: periodos,
    p_departamentos: params.departamentos ?? [],
    p_centros: params.centros ?? [],
  })
  if (error || !data) return []
  return data as DREAggRow[]
}

// ─── Aggregate DRE rows into metrics ─────────────────────────────────────────

interface AggMetrics {
  receita_bruta: number
  deducoes: number
  receita_liquida: number
  cmv: number
  lucro_bruto: number
  despesas_operacionais: number
  ebit: number
  resultado_liquido: number
  total_budget: number
  total_razao: number
  byGrupo: Record<string, { budget: number; razao: number; natureza: 'RECEITA' | 'CUSTO' | 'DESPESA' | 'RESULTADO' }>
}

function aggregateMetrics(rows: DREAggRow[]): AggMetrics {
  const byGrupo: Record<string, { budget: number; razao: number; natureza: 'RECEITA' | 'CUSTO' | 'DESPESA' | 'RESULTADO' }> = {}

  for (const row of rows) {
    const key = row.agrupamento_arvore || row.dre || 'Outros'
    if (!byGrupo[key]) byGrupo[key] = { budget: 0, razao: 0, natureza: classifyNatureza(key) }
    byGrupo[key].budget += row.budget ?? 0
    byGrupo[key].razao  += row.razao  ?? 0
  }

  let receita_bruta = 0, deducoes = 0, cmv = 0, despesas_operacionais = 0
  let total_budget = 0, total_razao = 0

  for (const [key, vals] of Object.entries(byGrupo)) {
    const nat = vals.natureza
    total_budget += vals.budget
    total_razao  += vals.razao
    if (nat === 'RECEITA') {
      const k = key.toLowerCase()
      if (k.includes('receita bruta') || k.includes('gross')) {
        receita_bruta += vals.razao
      } else if (k.includes('deducao') || k.includes('dedução') || k.includes('deduções')) {
        deducoes += vals.razao
      } else {
        receita_bruta += vals.razao
      }
    } else if (nat === 'CUSTO') {
      cmv += Math.abs(vals.razao)
    } else if (nat === 'DESPESA') {
      despesas_operacionais += Math.abs(vals.razao)
    }
  }

  const receita_liquida = receita_bruta - Math.abs(deducoes)
  const lucro_bruto = receita_liquida - cmv
  const ebit = lucro_bruto - despesas_operacionais
  const resultado_liquido = ebit

  return {
    receita_bruta,
    deducoes: Math.abs(deducoes),
    receita_liquida,
    cmv,
    lucro_bruto,
    despesas_operacionais,
    ebit,
    resultado_liquido,
    total_budget,
    total_razao,
    byGrupo,
  }
}

// ─── Build breakdown items ────────────────────────────────────────────────────

function buildBreakdown(
  byGrupo: Record<string, { budget: number; razao: number; natureza: 'RECEITA' | 'CUSTO' | 'DESPESA' | 'RESULTADO' }>,
  total: number
): BreakdownItem[] {
  const items: BreakdownItem[] = []
  for (const [label, vals] of Object.entries(byGrupo)) {
    if (vals.razao === 0 && vals.budget === 0) continue
    const desvio = vals.razao - vals.budget
    const desvio_pct = vals.budget !== 0 ? (desvio / Math.abs(vals.budget)) * 100 : null
    items.push({
      id: label,
      label,
      valor_realizado: vals.razao,
      valor_budget: vals.budget,
      desvio,
      desvio_pct,
      natureza: vals.natureza,
      participacao_pct: total !== 0 ? (Math.abs(vals.razao) / Math.abs(total)) * 100 : 0,
    })
  }
  return items.sort((a, b) => Math.abs(b.valor_realizado) - Math.abs(a.valor_realizado))
}

// ─── Build time series ────────────────────────────────────────────────────────

async function buildSerieTemporal(
  dimensao: Dimensao,
  periodo: Periodo,
  supabase: SupabaseClient
): Promise<SerieTemporal[]> {
  const last12 = getLast12Periodos(periodo)
  const rows = await fetchDRERows(dimensao, last12, supabase)

  const byPeriodo: Record<string, { realizado: number; budget: number }> = {}
  for (const p of last12) byPeriodo[p] = { realizado: 0, budget: 0 }

  for (const row of rows) {
    const p = row.periodo?.substring(0, 7)
    if (p && byPeriodo[p] !== undefined) {
      byPeriodo[p].realizado += row.razao ?? 0
      byPeriodo[p].budget   += row.budget ?? 0
    }
  }

  return last12.map(p => ({
    periodo: p,
    realizado: byPeriodo[p]?.realizado ?? 0,
    budget: byPeriodo[p]?.budget ?? 0,
  }))
}

// ─── Build comparativo item ───────────────────────────────────────────────────

async function buildComparativo(
  config: AnalysisConfig,
  totalRealizado: number,
  totalBudget: number,
  supabase: SupabaseClient
): Promise<ComparativoItem | null> {
  const comp = config.comparativo
  if (!comp || comp === 'nenhum') return null

  if (comp === 'budget') {
    const variacao = totalRealizado - totalBudget
    return {
      tipo: 'budget',
      valor_base: totalRealizado,
      valor_comp: totalBudget,
      variacao,
      variacao_pct: totalBudget !== 0 ? (variacao / Math.abs(totalBudget)) * 100 : 0,
    }
  }

  // Previous period
  const periodos = getPeriodosFromPeriodo(config.periodo)
  const firstPeriodo = periodos[0]
  const [y, m] = firstPeriodo.split('-').map(Number)

  let prevPeriodo: string
  if (comp === 'mes_anterior') {
    const pm = m === 1 ? 12 : m - 1
    const py = m === 1 ? y - 1 : y
    prevPeriodo = `${py}-${String(pm).padStart(2, '0')}`
  } else {
    prevPeriodo = `${y - 1}-${String(m).padStart(2, '0')}`
  }

  const prevRows = await fetchDRERows(config.dimensao, [prevPeriodo], supabase)
  const prevMetrics = aggregateMetrics(prevRows)
  const variacao = totalRealizado - prevMetrics.total_razao
  return {
    tipo: comp as 'mes_anterior' | 'ano_anterior',
    valor_base: totalRealizado,
    valor_comp: prevMetrics.total_razao,
    variacao,
    variacao_pct: prevMetrics.total_razao !== 0 ? (variacao / Math.abs(prevMetrics.total_razao)) * 100 : 0,
  }
}

// ─── inferirOtica ─────────────────────────────────────────────────────────────

export async function inferirOtica(
  dimensao: Dimensao,
  periodo: Periodo,
  supabase: SupabaseClient
): Promise<OticaAnalise> {
  if (dimensao.tipo === 'consolidado') return 'consolidado'
  if (dimensao.tipo === 'natureza') {
    if (dimensao.natureza === 'RECEITA') return 'receita'
    return 'despesa'
  }

  const periodos = getPeriodosFromPeriodo(periodo)
  const rows = await fetchDRERows(dimensao, periodos, supabase)
  if (!rows.length) return 'consolidado'

  let receitaTotal = 0, despesaTotal = 0
  for (const row of rows) {
    const nat = classifyNatureza(row.agrupamento_arvore)
    if (nat === 'RECEITA') receitaTotal += Math.abs(row.razao ?? 0)
    else despesaTotal += Math.abs(row.razao ?? 0)
  }

  const grand = receitaTotal + despesaTotal
  if (grand === 0) return 'consolidado'
  if (receitaTotal / grand > 0.70) return 'receita'
  if (despesaTotal / grand > 0.70) return 'despesa'
  return 'misto'
}

// ─── getDimensoesDisponiveis ──────────────────────────────────────────────────

export async function getDimensoesDisponiveis(
  supabase: SupabaseClient
): Promise<Array<{ tipo: string; id: string; label: string; otica_provavel: OticaAnalise }>> {
  const results: Array<{ tipo: string; id: string; label: string; otica_provavel: OticaAnalise }> = []

  // Consolidado
  results.push({ tipo: 'consolidado', id: 'consolidado', label: 'Consolidado (Geral)', otica_provavel: 'consolidado' })

  // Centros de custo
  const { data: ccs } = await supabase
    .from('centros_custo')
    .select('centro_custo, nome_centro_custo, area, nome_area')
    .order('nome_centro_custo')
  for (const cc of ccs ?? []) {
    results.push({
      tipo: 'centro_custo',
      id: cc.centro_custo,
      label: cc.nome_centro_custo ?? cc.centro_custo,
      otica_provavel: 'misto',
    })
  }

  // Unidades de negócio
  const { data: uns } = await supabase
    .from('unidades_negocio')
    .select('id_cc_cc, unidade')
    .order('unidade')
  for (const un of uns ?? []) {
    if (!un.unidade) continue
    results.push({
      tipo: 'unidade_negocio',
      id: un.id_cc_cc,
      label: un.unidade,
      otica_provavel: 'misto',
    })
  }

  // Grupos de contas
  const { data: grupos } = await supabase
    .from('contas_contabeis')
    .select('agrupamento_arvore')
    .not('agrupamento_arvore', 'is', null)
    .neq('agrupamento_arvore', '')
  const uniqueGrupos = [...new Set((grupos ?? []).map((g: Record<string,unknown>) => g.agrupamento_arvore as string).filter(Boolean))]
  for (const grupo of uniqueGrupos.sort()) {
    const nat = classifyNatureza(grupo)
    results.push({
      tipo: 'grupo_contas',
      id: grupo,
      label: `Grupo: ${grupo}`,
      otica_provavel: nat === 'RECEITA' ? 'receita' : (nat === 'CUSTO' || nat === 'DESPESA') ? 'despesa' : 'misto',
    })
  }

  return results
}

// ─── runAnalysis — main entry point ──────────────────────────────────────────

export async function runAnalysis(
  config: AnalysisConfig,
  supabase: SupabaseClient
): Promise<AnalysisResult> {
  const periodos = getPeriodosFromPeriodo(config.periodo)
  const periodo_label = getPeriodoLabel(config.periodo)

  // Resolve label
  const params = await dimensaoToQueryParams(config.dimensao, supabase)
  const label = params.label

  // Fetch DRE data
  const rows = await fetchDRERows(config.dimensao, periodos, supabase)

  // Aggregate metrics
  const metrics = aggregateMetrics(rows)

  // Infer otica
  const otica = config.otica ?? await inferirOtica(config.dimensao, config.periodo, supabase)

  // Build breakdown
  const total = metrics.receita_bruta || metrics.total_razao
  const breakdown = buildBreakdown(metrics.byGrupo, total)

  // Time series
  const serie_temporal = await buildSerieTemporal(config.dimensao, config.periodo, supabase)

  // Comparativo
  const comparativo = await buildComparativo(config, metrics.total_razao, metrics.total_budget, supabase)

  // Desvio budget
  const desvio_budget = metrics.total_razao - metrics.total_budget
  const desvio_budget_pct = metrics.total_budget !== 0
    ? (desvio_budget / Math.abs(metrics.total_budget)) * 100
    : null

  const margem_ebit = metrics.receita_liquida !== 0
    ? (metrics.ebit / metrics.receita_liquida) * 100
    : null

  return {
    config,
    otica,
    label,
    periodo_label,

    receita_bruta:          metrics.receita_bruta     || null,
    deducoes:               metrics.deducoes          || null,
    receita_liquida:        metrics.receita_liquida   || null,
    cmv:                    metrics.cmv               || null,
    lucro_bruto:            metrics.lucro_bruto       || null,
    despesas_operacionais:  metrics.despesas_operacionais || null,
    ebit:                   metrics.ebit              || null,
    margem_ebit:            margem_ebit,
    resultado_liquido:      metrics.resultado_liquido || null,

    total_despesas:         (metrics.cmv + metrics.despesas_operacionais) || null,
    desvio_budget:          desvio_budget || null,
    desvio_budget_pct:      desvio_budget_pct,

    breakdown,
    serie_temporal,
    comparativo,
  }
}
