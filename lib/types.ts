// ─── Fato ────────────────────────────────────────────────────────────────────
export interface Lancamento {
  id: number
  tipo: 'budget' | 'razao'
  data_lancamento: string
  nome_conta_contabil: string
  numero_conta_contabil: string
  centro_custo: string
  nome_conta_contrapartida: string
  fonte: string
  observacao: string
  debito_credito: number
  created_at: string
  updated_at: string
}

// ─── Dimensões ────────────────────────────────────────────────────────────────
export interface CentroCusto {
  centro_custo: string
  nome_centro_custo: string
  departamento: string
  nome_departamento: string
  area: string
  nome_area: string
}

export interface ContaContabil {
  numero_conta_contabil: string
  nome_conta_contabil: string
  agrupamento_arvore: string
  dre: string
}

// ─── Medidas ──────────────────────────────────────────────────────────────────
export type FilterOperator = '=' | '!=' | 'contains' | 'not_contains' | 'starts_with' | 'in'

// Colunas filtráveis via star schema
export type FilterColumn =
  | 'tipo'
  | 'numero_conta_contabil'
  | 'nome_conta_contabil'
  | 'agrupamento_arvore'   // de contas_contabeis
  | 'dre'                  // de contas_contabeis
  | 'centro_custo'
  | 'departamento'         // de centros_custo
  | 'nome_departamento'    // de centros_custo
  | 'area'                 // de centros_custo
  | 'fonte'
  | 'data_lancamento'

export interface FilterCondition {
  column: FilterColumn
  operator: FilterOperator
  value: string
}

export interface Medida {
  id: number
  nome: string
  descricao?: string
  cor: string
  tipo_fonte: 'budget' | 'razao' | 'ambos'
  filtros: FilterCondition[]
  created_at: string
  updated_at: string
}

// ─── Resultados de análise ────────────────────────────────────────────────────
export interface MedidaResultado {
  medida: Medida
  departamento: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

export interface AnaliseRow {
  departamento: string
  nome_departamento: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

// ─── Upload ───────────────────────────────────────────────────────────────────
export type UploadTipo = 'lancamentos_budget' | 'lancamentos_razao' | 'centros_custo' | 'contas_contabeis'

export const LANCAMENTO_COLUMNS = [
  { key: 'data_lancamento',           label: 'Data de Lançamento',         required: false },
  { key: 'nome_conta_contabil',       label: 'Nome Conta Contábil',         required: false },
  { key: 'numero_conta_contabil',     label: 'Número Conta Contábil',       required: true  },
  { key: 'centro_custo',              label: 'Centro de Custo',             required: true  },
  { key: 'nome_conta_contrapartida',  label: 'Nome Conta Contra Partida',   required: false },
  { key: 'fonte',                     label: 'Fonte',                       required: false },
  { key: 'observacao',                label: 'Observação',                  required: false },
  { key: 'debito_credito',            label: 'Débito / Crédito (MC)',        required: true  },
] as const

export const CENTRO_CUSTO_COLUMNS = [
  { key: 'centro_custo',      label: 'Centro de Custo',       required: true  },
  { key: 'nome_centro_custo', label: 'Nome do Centro de Custo', required: false },
  { key: 'departamento',      label: 'Departamento',           required: false },
  { key: 'nome_departamento', label: 'Nome Departamento',      required: false },
  { key: 'area',              label: 'Área',                   required: false },
  { key: 'nome_area',         label: 'Nome Área',              required: false },
] as const

export const CONTA_CONTABIL_COLUMNS = [
  { key: 'numero_conta_contabil', label: 'Número Conta Contábil', required: true  },
  { key: 'nome_conta_contabil',   label: 'Nome Conta Contábil',   required: false },
  { key: 'agrupamento_arvore',    label: 'Agrupamento Árvore',    required: false },
  { key: 'dre',                   label: 'DRE',                   required: false },
] as const
