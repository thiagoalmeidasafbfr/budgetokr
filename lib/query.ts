import { getSupabase } from './supabase'
import type { FilterCondition, FilterColumn, FilterLogic, MedidaResultado, Medida } from './types'

// ─── buildFilterSQL kept for reference / client-side use (not used server-side) ─
export function buildFilterSQL(filters: FilterCondition[], defaultLogic: FilterLogic = 'AND'): { where: string; params: unknown[] } {
  if (!filters?.length) return { where: '', params: [] }
  const params: unknown[] = []
  const sqlParts: string[] = []
  const COL_SOURCE: Record<FilterColumn, string> = {
    tipo:                    'l.tipo',
    numero_conta_contabil:   'l.numero_conta_contabil',
    nome_conta_contabil:     'COALESCE(ca.nome_conta_contabil, l.nome_conta_contabil)',
    agrupamento_arvore:      'ca.agrupamento_arvore',
    dre:                     'ca.dre',
    centro_custo:            'l.centro_custo',
    departamento:            'cc.departamento',
    nome_departamento:       'cc.nome_departamento',
    area:                    'cc.area',
    fonte:                   'l.fonte',
    data_lancamento:         'l.data_lancamento',
  }
  for (const f of filters) {
    const col = COL_SOURCE[f.column] ?? `l.${f.column}`
    let part = ''
    switch (f.operator) {
      case '=':           part = `LOWER(${col}) = LOWER(?)`; params.push(f.value); break
      case '!=':          part = `LOWER(${col}) != LOWER(?)`; params.push(f.value); break
      case 'contains':    part = `LOWER(${col}) LIKE LOWER(?)`; params.push(`%${f.value}%`); break
      case 'not_contains':part = `LOWER(${col}) NOT LIKE LOWER(?)`; params.push(`%${f.value}%`); break
      case 'starts_with': part = `LOWER(${col}) LIKE LOWER(?)`; params.push(`${f.value}%`); break
      case 'in': {
        const vals = f.value.split(',').map((v: string) => v.trim()).filter(Boolean)
        if (vals.length) { part = `LOWER(${col}) IN (${vals.map(() => 'LOWER(?)').join(',')})`; params.push(...vals) }
        break
      }
    }
    if (part) sqlParts.push(part)
  }
  if (!sqlParts.length) return { where: '', params: [] }
  let result = sqlParts[0]
  for (let i = 1; i < sqlParts.length; i++) {
    result += ` ${filters[i].logic || defaultLogic} ${sqlParts[i]}`
  }
  const hasOr = filters.some((f, i) => i > 0 && (f.logic || defaultLogic) === 'OR')
  if (hasOr) result = `(${result})`
  return { where: result, params }
}

// ─── Async star schema query via Supabase RPC ─────────────────────────────────

async function runStarQuery(
  tipo: 'budget' | 'razao',
  filters: FilterCondition[],
  logic: FilterLogic = 'AND',
  extraFilters: FilterCondition[] = [],
  periodos: string[] = [],
  groupDept = false,
  groupPeriod = false,
  groupCc = false,
): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('run_star_query', {
    p_tipo:          tipo,
    p_filters:       filters,
    p_logic:         logic,
    p_extra_filters: extraFilters,
    p_periodos:      periodos,
    p_group_dept:    groupDept,
    p_group_period:  groupPeriod,
    p_group_cc:      groupCc,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<Record<string, unknown>>
}

export interface MedidaQueryOptions {
  groupByDept?: boolean
  groupByPeriod?: boolean
  groupByCentroCusto?: boolean
  periodos?: string[]
  extraFiltros?: FilterCondition[]
}

export async function getMedidaResultados(
  medidaId: number,
  options: MedidaQueryOptions = {}
): Promise<MedidaResultado[]> {
  const {
    groupByDept = true,
    groupByPeriod = true,
    groupByCentroCusto = false,
    periodos = [],
    extraFiltros = [],
  } = options

  const supabase = getSupabase()
  const { data: raw, error } = await supabase
    .from('medidas')
    .select('*')
    .eq('id', medidaId)
    .single()
  if (error || !raw) return []

  const baseMedida: Medida = {
    ...raw,
    unidade:                        raw.unidade ?? '',
    tipo_fonte:                     raw.tipo_fonte as 'budget' | 'razao' | 'ambos',
    tipo_medida:                    (raw.tipo_medida || 'simples') as 'simples' | 'ratio',
    filtros:                        Array.isArray(raw.filtros) ? raw.filtros : JSON.parse(raw.filtros || '[]'),
    filtros_operador:               (raw.filtros_operador || 'AND') as 'AND' | 'OR',
    denominador_filtros:            Array.isArray(raw.denominador_filtros) ? raw.denominador_filtros : JSON.parse(raw.denominador_filtros || '[]'),
    denominador_filtros_operador:   (raw.denominador_filtros_operador || 'AND') as 'AND' | 'OR',
    denominador_tipo_fonte:         (raw.denominador_tipo_fonte || 'ambos') as 'budget' | 'razao' | 'ambos',
    departamentos:                  Array.isArray(raw.departamentos) ? raw.departamentos : JSON.parse(raw.departamentos || '[]'),
  }

  if (baseMedida.tipo_medida === 'ratio') {
    return computeRatioMedida(baseMedida, groupByDept, groupByPeriod, groupByCentroCusto, periodos, extraFiltros)
  }

  const tiposToRun: Array<'budget' | 'razao'> =
    baseMedida.tipo_fonte === 'ambos' ? ['budget', 'razao'] : [baseMedida.tipo_fonte]

  const byKey: Record<string, {
    budget: number; razao: number
    nome_dept: string; centro_custo: string; nome_cc: string
  }> = {}

  for (const tipo of tiposToRun) {
    const rows = await runStarQuery(
      tipo, baseMedida.filtros, baseMedida.filtros_operador,
      extraFiltros, periodos, groupByDept, groupByPeriod, groupByCentroCusto
    )
    for (const r of rows) {
      const dept     = (r['departamento']      ?? '') as string
      const nomeDept = (r['nome_departamento'] ?? '') as string
      const cc       = (r['centro_custo']      ?? '') as string
      const nomeCc   = (r['nome_centro_custo'] ?? '') as string
      const periodo  = (r['periodo'] ?? '') as string
      const key      = `${dept}||${cc}||${periodo}`
      if (!byKey[key]) byKey[key] = { budget: 0, razao: 0, nome_dept: nomeDept, centro_custo: cc, nome_cc: nomeCc }
      if (tipo === 'budget') byKey[key].budget += (r['valor'] as number) ?? 0
      if (tipo === 'razao')  byKey[key].razao  += (r['valor'] as number) ?? 0
    }
  }

  return Object.entries(byKey).map(([key, vals]) => {
    const [departamento, centro_custo, periodo] = key.split('||')
    const variacao = vals.razao - vals.budget
    return {
      medida: baseMedida,
      departamento,
      nome_departamento: vals.nome_dept,
      centro_custo,
      nome_centro_custo: vals.nome_cc,
      periodo,
      budget: vals.budget,
      razao:  vals.razao,
      variacao,
      variacao_pct: vals.budget ? (variacao / Math.abs(vals.budget)) * 100 : 0,
    }
  })
}

async function computeRatioMedida(
  medida: Medida,
  groupByDept: boolean,
  groupByPeriod: boolean,
  groupByCentroCusto: boolean,
  periodos: string[],
  extraAndFilters: FilterCondition[] = []
): Promise<MedidaResultado[]> {
  type RawBucket = { num_budget: number; num_razao: number; den_budget: number; den_razao: number; nome_dept: string; nome_cc: string }
  const byKey: Record<string, RawBucket> = {}

  const runAndAccumulate = async (
    filtros: FilterCondition[],
    tipo_fonte: 'budget' | 'razao' | 'ambos',
    isNumerator: boolean,
    logic: FilterLogic = 'AND'
  ) => {
    const tipos: Array<'budget' | 'razao'> = tipo_fonte === 'ambos' ? ['budget', 'razao'] : [tipo_fonte]
    for (const tipo of tipos) {
      const rows = await runStarQuery(tipo, filtros, logic, extraAndFilters, periodos, groupByDept, groupByPeriod, groupByCentroCusto)
      for (const r of rows) {
        const dept     = (r['departamento']      ?? '') as string
        const nomeDept = (r['nome_departamento'] ?? '') as string
        const cc       = (r['centro_custo']      ?? '') as string
        const nomeCc   = (r['nome_centro_custo'] ?? '') as string
        const periodo  = (r['periodo'] ?? '') as string
        const key      = `${dept}||${cc}||${periodo}`
        if (!byKey[key]) byKey[key] = { num_budget: 0, num_razao: 0, den_budget: 0, den_razao: 0, nome_dept: nomeDept, nome_cc: nomeCc }
        const val = (r['valor'] as number) ?? 0
        if (isNumerator) {
          if (tipo === 'budget') byKey[key].num_budget += val
          else                   byKey[key].num_razao  += val
        } else {
          if (tipo === 'budget') byKey[key].den_budget += val
          else                   byKey[key].den_razao  += val
        }
      }
    }
  }

  await runAndAccumulate(medida.filtros, medida.tipo_fonte, true, medida.filtros_operador)
  await runAndAccumulate(medida.denominador_filtros, medida.denominador_tipo_fonte, false, medida.denominador_filtros_operador)

  return Object.entries(byKey).map(([key, v]) => {
    const [departamento, centro_custo, periodo] = key.split('||')
    const budget = v.den_budget ? (v.num_budget / Math.abs(v.den_budget)) * 100 : 0
    const razao  = v.den_razao  ? (v.num_razao  / Math.abs(v.den_razao))  * 100 : 0
    const variacao = razao - budget
    return {
      medida,
      departamento,
      nome_departamento: v.nome_dept,
      centro_custo,
      nome_centro_custo: v.nome_cc,
      periodo,
      budget,
      razao,
      variacao,
      variacao_pct: budget ? (variacao / Math.abs(budget)) * 100 : 0,
      is_ratio: true,
      numerador_budget:  v.num_budget,
      numerador_razao:   v.num_razao,
      denominador_budget: v.den_budget,
      denominador_razao:  v.den_razao,
    }
  })
}

// ─── Análise geral ────────────────────────────────────────────────────────────
export async function getAnalise(
  filters: FilterCondition[],
  departamentos?: string[],
  periodos?: string[],
  groupByCentro = false
) {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_analise', {
    p_filters:       filters ?? [],
    p_departamentos: departamentos ?? [],
    p_periodos:      periodos ?? [],
    p_group_by_cc:   groupByCentro,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    ...r,
    budget:    (r['budget']  as number) ?? 0,
    razao:     (r['razao']   as number) ?? 0,
    variacao:  ((r['razao'] as number ?? 0) - (r['budget'] as number ?? 0)),
    variacao_pct: r['budget'] ? (((r['razao'] as number ?? 0) - (r['budget'] as number)) / Math.abs(r['budget'] as number)) * 100 : 0,
  }))
}

// ─── Periods that have actual Razão data (for YTD default) ────────────────────
export async function getRazaoPeriods(): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('lancamentos')
    .select('data_lancamento')
    .eq('tipo', 'razao')
    .not('data_lancamento', 'is', null)
  if (error) throw new Error(error.message)
  const set = new Set<string>()
  for (const row of data ?? []) {
    if (row.data_lancamento) {
      const d = new Date(row.data_lancamento)
      if (!isNaN(d.getTime())) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    }
  }
  return [...set].sort()
}

// ─── Distinct values para autocomplete ───────────────────────────────────────
export async function getDistinctValues(column: FilterColumn, limit = 500): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_distinct_values', {
    p_column: column,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ val: string }>).map(r => r.val).filter(Boolean)
}

// ─── Summary ──────────────────────────────────────────────────────────────────
export async function getSummary() {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_summary')
  if (error) throw new Error(error.message)
  return data as {
    departamentos: number; periodos: number
    total_budget: number; total_razao: number
    linhas_budget: number; linhas_razao: number
    qtd_centros: number; qtd_contas: number
  }
}

// ─── DRE (P&L) ───────────────────────────────────────────────────────────────
export interface DRERow {
  dre: string
  agrupamento_arvore: string
  ordem_dre: number
  periodo: string
  budget: number
  razao: number
}

export async function getCentrosByDepartamentos(departamentos: string[]): Promise<Array<{ cc: string; nome: string }>> {
  if (!departamentos.length) return []
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_centros_by_departamentos', {
    p_departamentos: departamentos,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{ cc: string; nome: string }>
}

export async function getDRE(
  periodos?: string[],
  departamentos?: string[],
  centros?: string[]
): Promise<DRERow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_dre', {
    p_periodos:      periodos ?? [],
    p_departamentos: departamentos ?? [],
    p_centros:       centros ?? [],
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as DRERow[]
}

export interface DREAccountRow {
  dre: string
  agrupamento_arvore: string
  numero_conta_contabil: string
  nome_conta_contabil: string
  periodo: string
  budget: number
  razao: number
}

export async function getDREByAccount(
  periodos?: string[],
  departamentos?: string[],
  centros?: string[]
): Promise<DREAccountRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_dre_by_account', {
    p_periodos:      periodos ?? [],
    p_departamentos: departamentos ?? [],
    p_centros:       centros ?? [],
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as DREAccountRow[]
}

export async function getDREHierarchy(): Promise<Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('contas_contabeis')
    .select('agrupamento_arvore, dre, ordem_dre')
    .not('dre', 'is', null)
    .neq('dre', '')
  if (error) throw new Error(error.message)
  const map = new Map<string, { agrupamento_arvore: string; dre: string; ordem_dre: number }>()
  for (const r of data ?? []) {
    const key = `${r.dre}||${r.agrupamento_arvore}`
    if (!map.has(key)) map.set(key, { agrupamento_arvore: r.agrupamento_arvore ?? '', dre: r.dre ?? '', ordem_dre: r.ordem_dre ?? 999 })
    else if ((r.ordem_dre ?? 999) < map.get(key)!.ordem_dre) map.get(key)!.ordem_dre = r.ordem_dre ?? 999
  }
  return [...map.values()].sort((a, b) => a.ordem_dre - b.ordem_dre || a.dre.localeCompare(b.dre))
}

export interface DRELinha {
  id: number
  ordem: number
  nome: string
  tipo: 'grupo' | 'subtotal'
  sinal: number
  formula_grupos: string
  formula_sinais: string
  negrito: number
  separador: number
}

export async function getDRELinhas(): Promise<DRELinha[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('dre_linhas')
    .select('id, ordem, nome, tipo, sinal, formula_grupos, formula_sinais, negrito, separador')
    .order('ordem')
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    ...r,
    formula_grupos: Array.isArray(r.formula_grupos) ? JSON.stringify(r.formula_grupos) : (r.formula_grupos ?? '[]'),
    formula_sinais: Array.isArray(r.formula_sinais) ? JSON.stringify(r.formula_sinais) : (r.formula_sinais ?? '[]'),
  })) as DRELinha[]
}

// ─── KPIs Manuais ─────────────────────────────────────────────────────────────

export interface KpiManual {
  id: number
  nome: string
  unidade: string
  descricao: string
  departamento: string
  cor: string
  ordem: number
  tem_budget: number
}

export interface KpiValor {
  id: number
  kpi_id: number
  periodo: string
  valor: number
  meta: number | null
}

export async function getKpisManuais(departamento?: string): Promise<KpiManual[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('kpis_manuais')
    .select('id, nome, unidade, descricao, departamento, cor, ordem, tem_budget')
    .order('ordem')
    .order('nome')
  if (departamento !== undefined && departamento !== '') {
    query = query.or(`departamento.eq.,departamento.eq.${departamento}`)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as KpiManual[]
}

export async function upsertKpiManual(data: Omit<KpiManual, 'id'>): Promise<KpiManual> {
  const supabase = getSupabase()
  const { data: result, error } = await supabase
    .from('kpis_manuais')
    .insert(data)
    .select('id, nome, unidade, descricao, departamento, cor, ordem, tem_budget')
    .single()
  if (error) throw new Error(error.message)
  return result as KpiManual
}

export async function updateKpiManual(id: number, data: Omit<KpiManual, 'id'>): Promise<KpiManual> {
  const supabase = getSupabase()
  const { data: result, error } = await supabase
    .from('kpis_manuais')
    .update(data)
    .eq('id', id)
    .select('id, nome, unidade, descricao, departamento, cor, ordem, tem_budget')
    .single()
  if (error) throw new Error(error.message)
  return result as KpiManual
}

export async function deleteKpiManual(id: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('kpis_manuais').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getKpiValores(kpiId: number, periodos?: string[]): Promise<KpiValor[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('kpi_valores')
    .select('id, kpi_id, periodo, valor, meta')
    .eq('kpi_id', kpiId)
    .order('periodo')
  if (periodos?.length) {
    query = query.in('periodo', periodos)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as KpiValor[]
}

export async function upsertKpiValores(
  kpiId: number,
  valores: Array<{ periodo: string; valor: number; meta?: number | null }>
): Promise<void> {
  const supabase = getSupabase()
  const rows = valores.map(v => ({ kpi_id: kpiId, periodo: v.periodo, valor: v.valor, meta: v.meta ?? null }))
  const { error } = await supabase
    .from('kpi_valores')
    .upsert(rows, { onConflict: 'kpi_id,periodo' })
  if (error) throw new Error(error.message)
}

// ─── Dept Medidas ──────────────────────────────────────────────────────────────

export interface DeptMedida {
  id: number
  departamento: string
  medida_id: number
  ordem: number
}

export async function getDeptMedidas(departamento: string): Promise<DeptMedida[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('dept_medidas')
    .select('id, departamento, medida_id, ordem')
    .eq('departamento', departamento)
    .order('ordem')
    .order('id')
  if (error) throw new Error(error.message)
  return (data ?? []) as DeptMedida[]
}

export async function upsertDeptMedida(departamento: string, medidaId: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('dept_medidas')
    .upsert({ departamento, medida_id: medidaId }, { onConflict: 'departamento,medida_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export async function deleteDeptMedida(departamento: string, medidaId: number): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('dept_medidas')
    .delete()
    .eq('departamento', departamento)
    .eq('medida_id', medidaId)
  if (error) throw new Error(error.message)
}

// ─── Por Unidade de Negócio ───────────────────────────────────────────────────
export interface PorUnidadeRow {
  unidade: string
  dre: string
  agrupamento: string
  conta: string
  nome_conta: string
  ordem_dre: number
  periodo?: string
  budget: number
  razao: number
}

export async function getUnidadesDistintas(): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_unidades_distintas')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ unidade: string }>).map(r => r.unidade).filter(Boolean)
}

export async function getPorUnidade(
  periodos?: string[],
  unidades?: string[]
): Promise<PorUnidadeRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_por_unidade', {
    p_periodos: periodos ?? [],
    p_unidades: unidades ?? [],
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as PorUnidadeRow[]
}

export async function getMedidas(): Promise<import('./types').Medida[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('medidas').select('*').order('nome')
  if (error) throw new Error(error.message)
  return (data ?? []).map(raw => ({
    id:                             raw.id as number,
    nome:                           raw.nome as string,
    descricao:                      (raw.descricao ?? '') as string,
    unidade:                        (raw.unidade ?? '') as string,
    cor:                            (raw.cor ?? '#6366f1') as string,
    tipo_fonte:                     (raw.tipo_fonte ?? 'ambos') as 'budget' | 'razao' | 'ambos',
    tipo_medida:                    ((raw.tipo_medida as string) || 'simples') as 'simples' | 'ratio',
    filtros:                        Array.isArray(raw.filtros) ? raw.filtros : JSON.parse((raw.filtros as string) || '[]'),
    filtros_operador:               ((raw.filtros_operador as string) || 'AND') as 'AND' | 'OR',
    denominador_filtros:            Array.isArray(raw.denominador_filtros) ? raw.denominador_filtros : JSON.parse((raw.denominador_filtros as string) || '[]'),
    denominador_filtros_operador:   ((raw.denominador_filtros_operador as string) || 'AND') as 'AND' | 'OR',
    denominador_tipo_fonte:         ((raw.denominador_tipo_fonte as string) || 'ambos') as 'budget' | 'razao' | 'ambos',
    departamentos:                  Array.isArray(raw.departamentos) ? raw.departamentos : JSON.parse((raw.departamentos as string) || '[]'),
    created_at:                     raw.created_at as string,
    updated_at:                     raw.updated_at as string,
  }))
}

// ─── Por Unidade de Negócio ────────────────────────────────────────────────────

export interface PorUnidadeRow {
  unidade: string
  dre: string
  agrupamento: string
  conta: string
  nome_conta: string
  ordem_dre: number
  budget: number
  razao: number
}

export async function getPorUnidade(
  periodos?: string[],
  unidades?: string[]
): Promise<PorUnidadeRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_por_unidade', {
    p_periodos: periodos ?? [],
    p_unidades: unidades ?? [],
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as PorUnidadeRow[]
}

export async function getUnidadesDistintas(): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_unidades_distintas')
  if (error) throw new Error(error.message)
  return (data ?? []) as string[]
}
