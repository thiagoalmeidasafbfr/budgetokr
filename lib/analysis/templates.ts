import type { OticaAnalise } from './engine'

// ─── Block types ──────────────────────────────────────────────────────────────

export type BlockType =
  | 'kpi_card'
  | 'kpi_row'
  | 'waterfall'
  | 'bar_ranking'
  | 'donut'
  | 'sparkline'
  | 'table_breakdown'
  | 'gauge_meta'
  | 'alert_list'
  | 'text_note'

export interface BlockConfig {
  id: string
  type: BlockType
  titulo?: string
  metrica?: string
  fonte?: 'breakdown' | 'serie_temporal' | 'comparativo'
  colSpan: 1 | 2
  options?: Record<string, unknown>
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATE_RECEITA: BlockConfig[] = [
  {
    id: 'kpis',
    type: 'kpi_row',
    colSpan: 2,
    options: { metricas: ['receita_bruta', 'ebit', 'margem_ebit', 'resultado_liquido'] },
  },
  {
    id: 'waterfall',
    type: 'waterfall',
    colSpan: 1,
    options: { linhas: ['receita_bruta','deducoes','receita_liquida','cmv','lucro_bruto','despesas_operacionais','ebit'] },
  },
  { id: 'temporal', type: 'sparkline', colSpan: 1, fonte: 'serie_temporal' },
  {
    id: 'ranking',
    type: 'bar_ranking',
    colSpan: 2,
    fonte: 'breakdown',
    options: { ordenar: 'valor_realizado', limite: 10 },
  },
  { id: 'tabela', type: 'table_breakdown', colSpan: 2, fonte: 'breakdown' },
]

export const TEMPLATE_DESPESA: BlockConfig[] = [
  {
    id: 'kpis',
    type: 'kpi_row',
    colSpan: 2,
    options: { metricas: ['total_despesas', 'desvio_budget', 'desvio_budget_pct'] },
  },
  {
    id: 'alertas',
    type: 'alert_list',
    colSpan: 1,
    fonte: 'breakdown',
    options: { ordenar: 'desvio_pct', limite: 5 },
  },
  { id: 'temporal', type: 'sparkline', colSpan: 1, fonte: 'serie_temporal' },
  {
    id: 'ranking',
    type: 'bar_ranking',
    colSpan: 2,
    fonte: 'breakdown',
    options: { ordenar: 'desvio', limite: 10 },
  },
  { id: 'tabela', type: 'table_breakdown', colSpan: 2, fonte: 'breakdown' },
]

export const TEMPLATE_MISTO: BlockConfig[] = [
  {
    id: 'kpis',
    type: 'kpi_row',
    colSpan: 2,
    options: { metricas: ['receita_bruta', 'total_despesas', 'resultado_liquido', 'desvio_budget'] },
  },
  {
    id: 'donut',
    type: 'donut',
    colSpan: 1,
    fonte: 'breakdown',
    options: { agrupar_por: 'natureza' },
  },
  { id: 'temporal', type: 'sparkline', colSpan: 1, fonte: 'serie_temporal' },
  { id: 'tabela', type: 'table_breakdown', colSpan: 2, fonte: 'breakdown' },
]

export const TEMPLATE_CONSOLIDADO: BlockConfig[] = [
  {
    id: 'kpis',
    type: 'kpi_row',
    colSpan: 2,
    options: { metricas: ['receita_bruta', 'ebit', 'margem_ebit', 'resultado_liquido'] },
  },
  {
    id: 'waterfall',
    type: 'waterfall',
    colSpan: 2,
    options: { linhas: ['receita_bruta','deducoes','receita_liquida','cmv','lucro_bruto','despesas_operacionais','ebit','resultado_liquido'] },
  },
  {
    id: 'donut_un',
    type: 'donut',
    colSpan: 1,
    fonte: 'breakdown',
    options: { titulo: 'Receita por Unidade de Negócio' },
  },
  { id: 'temporal', type: 'sparkline', colSpan: 1, fonte: 'serie_temporal' },
  {
    id: 'ranking',
    type: 'bar_ranking',
    colSpan: 2,
    fonte: 'breakdown',
    options: { titulo: 'Resultado por Centro de Custo', limite: 15 },
  },
]

export function getTemplate(otica: OticaAnalise): BlockConfig[] {
  switch (otica) {
    case 'receita':      return TEMPLATE_RECEITA.map(b => ({ ...b }))
    case 'despesa':      return TEMPLATE_DESPESA.map(b => ({ ...b }))
    case 'misto':        return TEMPLATE_MISTO.map(b => ({ ...b }))
    case 'consolidado':  return TEMPLATE_CONSOLIDADO.map(b => ({ ...b }))
    default:             return TEMPLATE_CONSOLIDADO.map(b => ({ ...b }))
  }
}

// Label map for metrics
export const METRICA_LABELS: Record<string, string> = {
  receita_bruta:          'Receita Bruta',
  deducoes:               'Deduções',
  receita_liquida:        'Receita Líquida',
  cmv:                    'CMV',
  lucro_bruto:            'Lucro Bruto',
  despesas_operacionais:  'Despesas Operacionais',
  ebit:                   'EBIT',
  margem_ebit:            'Margem EBIT',
  resultado_liquido:      'Resultado Líquido',
  total_despesas:         'Total Despesas',
  desvio_budget:          'Desvio vs Budget',
  desvio_budget_pct:      'Desvio Budget %',
}

export const BLOCK_DESCRIPTIONS: Record<BlockType, string> = {
  kpi_card:        'Métrica única em destaque',
  kpi_row:         'Linha de 3-4 KPIs',
  waterfall:       'DRE simplificada (cascata)',
  bar_ranking:     'Ranking de entidades',
  donut:           'Distribuição percentual',
  sparkline:       'Evolução temporal',
  table_breakdown: 'Tabela analítica detalhada',
  gauge_meta:      'Indicador de meta (%)',
  alert_list:      'Top N alertas / desvios',
  text_note:       'Anotação livre',
}
