// ─── OnePage Financial Intelligence — tipos ───────────────────────────────────

/** Uma linha bruta retornada pela função get_board_data */
export interface BoardDataRow {
  centro_custo: string
  nome_centro_custo: string
  nome_departamento: string
  dre: string
  ordem_dre: number
  razao: number
  budget: number
}

/**
 * Definição de uma métrica configurável pelo usuário.
 *
 * Métricas simples somam os valores dos grupos DRE indicados.
 * Métricas de razão calculam numerador / denominador (em percentual).
 *
 * Exemplos:
 *   Receita Líquida (simples) → dreGroups: ['Receita Bruta', '(-) Deduções de Receita']
 *   EBITDA (simples)          → dreGroups: ['Receita Bruta', '(-) Deduções', 'CMV', 'Despesas']
 *   Margem EBITDA % (razão)   → num: 'ebitda_metric_id', den: 'receita_liquida_metric_id'
 */
export interface MetricDef {
  id: string
  name: string
  /** 'simple' soma os grupos DRE indicados; 'ratio' divide dois outros metrics */
  type: 'simple' | 'ratio'
  /** Para type='simple': quais valores de ca.dre incluir na soma */
  dreGroups: string[]
  /** Para type='ratio': ID do metric que serve como numerador */
  numeratorId?: string
  /** Para type='ratio': ID do metric que serve como denominador */
  denominatorId?: string
  /** Formato de exibição: 'currency' = R$ com separadores; 'pct' = XX.X% */
  format: 'currency' | 'pct'
  /** Se true, inverte o sinal do resultado (ex.: custos negativos → mostrar como positivo) */
  invertSign?: boolean
  /** Ordem de exibição na tabela */
  order: number
  /** Usar dados de: razao, budget, ou ambos (mostra razao + delta vs budget) */
  viewMode: 'razao' | 'budget' | 'both'
}

/** Uma linha pivotada da MarginBoard (um centro de custo, N métricas) */
export interface BoardRow {
  centro_custo: string
  nome_centro_custo: string
  nome_departamento: string
  /** Mapa: metricId → { razao, budget } */
  metrics: Record<string, { razao: number; budget: number }>
}

/** Resultado calculado de uma métrica para um centro de custo específico */
export interface ComputedMetric {
  metricId: string
  razao: number
  budget: number
  variacao: number
  variacao_pct: number
}

/** Estado de configuração completo do board, salvo em localStorage */
export interface BoardConfig {
  metrics: MetricDef[]
  /** IDs dos centros de custo fixados no topo da tabela */
  pinnedCentros?: string[]
  /** Ordenação atual da tabela */
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export const BOARD_CONFIG_KEY = 'onepage_board_config_v1'

export function defaultBoardConfig(): BoardConfig {
  return { metrics: [] }
}

/** Pivota as linhas brutas do banco por centro de custo */
export function pivotBoardData(rows: BoardDataRow[]): BoardRow[] {
  const map = new Map<string, BoardRow>()
  for (const r of rows) {
    if (!map.has(r.centro_custo)) {
      map.set(r.centro_custo, {
        centro_custo: r.centro_custo,
        nome_centro_custo: r.nome_centro_custo,
        nome_departamento: r.nome_departamento,
        metrics: {},
      })
    }
    const row = map.get(r.centro_custo)!
    // Use dre as key; accumulate (multiple rows may have same dre if NULL handling differs)
    const key = r.dre
    if (!row.metrics[key]) row.metrics[key] = { razao: 0, budget: 0 }
    row.metrics[key].razao  += r.razao
    row.metrics[key].budget += r.budget
  }
  return Array.from(map.values())
}

/** Calcula o valor de uma métrica simples para um BoardRow */
export function computeSimpleMetric(
  row: BoardRow,
  metric: MetricDef
): { razao: number; budget: number } {
  let razao = 0
  let budget = 0
  for (const group of metric.dreGroups) {
    razao  += row.metrics[group]?.razao  ?? 0
    budget += row.metrics[group]?.budget ?? 0
  }
  if (metric.invertSign) { razao = -razao; budget = -budget }
  return { razao, budget }
}

/** Calcula o valor de uma métrica de razão (%) para um BoardRow */
export function computeRatioMetric(
  row: BoardRow,
  metric: MetricDef,
  allMetrics: MetricDef[]
): { razao: number; budget: number } {
  const num = allMetrics.find(m => m.id === metric.numeratorId)
  const den = allMetrics.find(m => m.id === metric.denominatorId)
  if (!num || !den) return { razao: 0, budget: 0 }

  const numVal = computeSimpleMetric(row, num)
  const denVal = computeSimpleMetric(row, den)

  const razao  = denVal.razao  !== 0 ? (numVal.razao  / Math.abs(denVal.razao))  * 100 : 0
  const budget = denVal.budget !== 0 ? (numVal.budget / Math.abs(denVal.budget)) * 100 : 0
  return { razao, budget }
}

/** Calcula qualquer tipo de métrica para um BoardRow */
export function computeMetric(
  row: BoardRow,
  metric: MetricDef,
  allMetrics: MetricDef[]
): { razao: number; budget: number } {
  if (metric.type === 'ratio') return computeRatioMetric(row, metric, allMetrics)
  return computeSimpleMetric(row, metric)
}

/** Formata um número de acordo com o formato da métrica */
export function formatMetricValue(value: number, format: 'currency' | 'pct'): string {
  if (format === 'pct') {
    return `${value.toFixed(1)}%`
  }
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(1)}K`
  }
  return `${sign}${abs.toFixed(0)}`
}
