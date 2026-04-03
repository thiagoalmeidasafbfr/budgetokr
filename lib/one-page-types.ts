// Shared types for the One Page Financeiro canvas BI feature

export type WidgetType = 'kpi' | 'bar' | 'line' | 'donut' | 'table' | 'title'

export type DataSource =
  | {
      kind: 'medida'
      medidaId: number
      medidaNome: string
      viewField: 'razao' | 'budget' | 'variacao' | 'variacao_pct'
      medidaGroupBy?: 'periodo' | 'centro_custo' | 'departamento'
    }
  | { kind: 'analise'; groupBy: 'departamento' | 'periodo'; field: 'razao' | 'budget' | 'variacao'; depts?: string[] }
  | {
      kind: 'exec_chart'
      groupBy: string
      field: 'razao' | 'budget' | 'variacao'
      topN: number
      sortOrder?: 'asc' | 'desc'
      // Filtros avançados
      filterDepts?: string[]      // → param 'departamentos' na API
      filterCentros?: string[]    // → param 'centros' na API
      filterDreGroup?: string     // → param 'dreGroup' na API
      filterUnidades?: string[]   // filtro client-side por unidade de negócio
    }
  | { kind: 'summary'; field: 'budget_ytd' | 'razao_ytd' | 'variacao' | 'variacao_pct' }
  | { kind: 'static'; value: string }

export interface WidgetConfig {
  id: string
  type: WidgetType
  title: string
  subtitle?: string
  dataSource: DataSource
  // Layout (grid units)
  x: number
  y: number
  w: number   // largura em colunas (1–12)
  h: number   // altura em unidades de grid (1 unidade ≈ 80px)
  // Aparência
  fontSize: 'sm' | 'md' | 'lg' | 'xl'
  showLegend: boolean
  showDataLabels: boolean
  showDelta: boolean
  colorScheme: 'default' | 'green' | 'gold' | 'blue' | 'mono'
  borderStyle: 'none' | 'subtle' | 'card'
  showAxisX: boolean
  showAxisY: boolean
  showGrid: boolean
}

export function createDefaultWidget(type: WidgetType): WidgetConfig {
  const base = {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: type === 'title' ? 'Novo Título' : 'Novo Widget',
    subtitle: '',
    x: 0,
    y: 0,
    w: type === 'kpi' ? 3 : type === 'title' ? 12 : 6,
    h: type === 'kpi' ? 3 : type === 'title' ? 2 : 4,
    fontSize: 'md' as const,
    showLegend: true,
    showDataLabels: false,
    showDelta: type === 'kpi',
    colorScheme: 'default' as const,
    borderStyle: 'card' as const,
    showAxisX: true,
    showAxisY: true,
    showGrid: true,
  }

  switch (type) {
    case 'kpi':
      return { ...base, dataSource: { kind: 'summary', field: 'razao_ytd' } }
    case 'bar':
    case 'donut':
    case 'table':
      return { ...base, dataSource: { kind: 'exec_chart', groupBy: 'dre', field: 'razao', topN: 8, sortOrder: 'desc' as const } }
    case 'line':
      return { ...base, dataSource: { kind: 'analise', groupBy: 'periodo', field: 'razao' } }
    case 'title':
      return { ...base, dataSource: { kind: 'static', value: '' }, showLegend: false, borderStyle: 'none' }
    default:
      return { ...base, dataSource: { kind: 'summary', field: 'razao_ytd' } }
  }
}
