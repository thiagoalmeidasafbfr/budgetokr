import { getDb } from './db'
import type { FilterCondition, FilterColumn, MedidaResultado, Medida } from './types'

// Mapeia coluna filtro → tabela correta no star schema
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

const STAR_SCHEMA_JOIN = `
  FROM lancamentos l
  LEFT JOIN centros_custo  cc ON l.centro_custo          = cc.centro_custo
  LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil
`

export function buildFilterSQL(filters: FilterCondition[]): { where: string; params: unknown[] } {
  if (!filters?.length) return { where: '', params: [] }

  const parts: string[] = []
  const params: unknown[] = []

  for (const f of filters) {
    const col = COL_SOURCE[f.column] ?? `l.${f.column}`
    switch (f.operator) {
      case '=':
        parts.push(`LOWER(${col}) = LOWER(?)`)
        params.push(f.value)
        break
      case '!=':
        parts.push(`LOWER(${col}) != LOWER(?)`)
        params.push(f.value)
        break
      case 'contains':
        parts.push(`LOWER(${col}) LIKE LOWER(?)`)
        params.push(`%${f.value}%`)
        break
      case 'not_contains':
        parts.push(`LOWER(${col}) NOT LIKE LOWER(?)`)
        params.push(`%${f.value}%`)
        break
      case 'starts_with':
        parts.push(`LOWER(${col}) LIKE LOWER(?)`)
        params.push(`${f.value}%`)
        break
      case 'in': {
        const vals = f.value.split(',').map(v => v.trim()).filter(Boolean)
        if (vals.length) {
          parts.push(`LOWER(${col}) IN (${vals.map(() => 'LOWER(?)').join(',')})`)
          params.push(...vals)
        }
        break
      }
    }
  }

  return { where: parts.join(' AND '), params }
}

// ─── Star schema query ────────────────────────────────────────────────────────
function runStarQuery(
  tipo: 'budget' | 'razao',
  filters: FilterCondition[],
  groupBy: string[]
): Array<Record<string, unknown>> {
  const db = getDb()
  const { where, params } = buildFilterSQL(filters)
  const allConditions = [`l.tipo = '${tipo}'`, where].filter(Boolean).join(' AND ')
  const selectCols = groupBy.join(', ')
  const groupClause = groupBy.length ? `GROUP BY ${selectCols}` : ''

  const sql = `
    SELECT
      ${groupBy.length ? selectCols + ',' : ''}
      SUM(l.debito_credito) as valor
    ${STAR_SCHEMA_JOIN}
    WHERE ${allConditions}
    ${groupClause}
    ORDER BY ${groupBy.length ? selectCols : '1'}
  `
  return db.prepare(sql).all(...(params as unknown[])) as Array<Record<string, unknown>>
}

export interface MedidaQueryOptions {
  groupByDept?: boolean
  groupByPeriod?: boolean
  groupByCentroCusto?: boolean
  periodos?: string[]   // filtro extra: ['2024-01', '2024-02', ...]
}

export function getMedidaResultados(
  medidaId: number,
  options: MedidaQueryOptions = {}
): MedidaResultado[] {
  const {
    groupByDept = true,
    groupByPeriod = true,
    groupByCentroCusto = false,
    periodos = [],
  } = options

  const db = getDb()
  const raw = db.prepare('SELECT * FROM medidas WHERE id = ?').get(medidaId) as {
    id: number; nome: string; descricao: string; cor: string
    tipo_fonte: string; tipo_medida: string; filtros: string
    denominador_filtros: string; denominador_tipo_fonte: string
    created_at: string; updated_at: string
  } | undefined
  if (!raw) return []

  const medida: Medida = {
    ...raw,
    tipo_fonte:             raw.tipo_fonte as 'budget' | 'razao' | 'ambos',
    tipo_medida:            (raw.tipo_medida || 'simples') as 'simples' | 'ratio',
    filtros:                JSON.parse(raw.filtros || '[]'),
    denominador_filtros:    JSON.parse(raw.denominador_filtros || '[]'),
    denominador_tipo_fonte: (raw.denominador_tipo_fonte || 'ambos') as 'budget' | 'razao' | 'ambos',
  }

  const groupBy: string[] = []
  if (groupByDept)        groupBy.push('cc.departamento', 'cc.nome_departamento')
  if (groupByCentroCusto) groupBy.push('l.centro_custo', 'cc.nome_centro_custo')
  if (groupByPeriod)      groupBy.push("strftime('%Y-%m', l.data_lancamento) as periodo")

  const periodoClause = periodos.length ? buildPeriodoWhere(periodos) : null

  if (medida.tipo_medida === 'ratio') {
    return computeRatioMedida(medida, groupBy, periodoClause)
  }

  // ── Medida simples ────────────────────────────────────────────────────────
  const tiposToRun: Array<'budget' | 'razao'> =
    medida.tipo_fonte === 'ambos' ? ['budget', 'razao'] : [medida.tipo_fonte]

  const byKey: Record<string, {
    budget: number; razao: number
    nome_dept: string; centro_custo: string; nome_cc: string
  }> = {}

  for (const tipo of tiposToRun) {
    const rows = runStarQueryWithPeriodo(tipo, medida.filtros, groupBy, periodoClause)
    for (const r of rows) {
      const dept     = (r['departamento']     ?? '') as string
      const nomeDept = (r['nome_departamento'] ?? '') as string
      const cc       = (r['centro_custo']     ?? '') as string
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
      medida,
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

// ── Ratio medida: numerador / denominador ────────────────────────────────────
function computeRatioMedida(
  medida: Medida,
  groupBy: string[],
  periodoClause: { where: string; params: unknown[] } | null
): MedidaResultado[] {
  type RawBucket = { num_budget: number; num_razao: number; den_budget: number; den_razao: number; nome_dept: string; nome_cc: string }
  const byKey: Record<string, RawBucket> = {}

  const runAndAccumulate = (
    filtros: FilterCondition[],
    tipo_fonte: 'budget' | 'razao' | 'ambos',
    isNumerator: boolean
  ) => {
    const tipos: Array<'budget'|'razao'> = tipo_fonte === 'ambos' ? ['budget','razao'] : [tipo_fonte]
    for (const tipo of tipos) {
      const rows = runStarQueryWithPeriodo(tipo, filtros, groupBy, periodoClause)
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

  runAndAccumulate(medida.filtros,             medida.tipo_fonte,             true)
  runAndAccumulate(medida.denominador_filtros, medida.denominador_tipo_fonte, false)

  return Object.entries(byKey).map(([key, v]) => {
    const [departamento, centro_custo, periodo] = key.split('||')
    // ratio in %, e.g. 5.2 means 5.2%
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

// Versão interna que aceita cláusula de período extra já montada
function buildPeriodoWhere(periodos: string[]): { where: string; params: unknown[] } | null {
  if (!periodos.length) return null
  const placeholders = periodos.map(() => '?').join(',')
  return {
    where: `strftime('%Y-%m', l.data_lancamento) IN (${placeholders})`,
    params: periodos,
  }
}

function runStarQueryWithPeriodo(
  tipo: 'budget' | 'razao',
  filters: FilterCondition[],
  groupBy: string[],
  periodoClause: { where: string; params: unknown[] } | null
): Array<Record<string, unknown>> {
  const db = getDb()
  const { where, params } = buildFilterSQL(filters)
  const periodoPart = periodoClause?.where ?? ''
  const allConditions = [`l.tipo = '${tipo}'`, where, periodoPart].filter(Boolean).join(' AND ')
  const allParams = [...(params as unknown[]), ...(periodoClause?.params ?? [])]
  const selectCols = groupBy.join(', ')
  const groupClause = groupBy.length ? `GROUP BY ${selectCols}` : ''

  const sql = `
    SELECT
      ${groupBy.length ? selectCols + ',' : ''}
      SUM(l.debito_credito) as valor
    ${STAR_SCHEMA_JOIN}
    WHERE ${allConditions}
    ${groupClause}
    ORDER BY ${groupBy.length ? selectCols : '1'}
  `
  return db.prepare(sql).all(...allParams) as Array<Record<string, unknown>>
}

// ─── Análise geral (sem medida específica) ───────────────────────────────────
export function getAnalise(
  filters: FilterCondition[],
  departamentos?: string[],
  periodos?: string[]
) {
  const db = getDb()
  const { where, params } = buildFilterSQL(filters)
  const extraConditions: string[] = []
  const extraParams: unknown[] = []

  if (departamentos?.length) {
    extraConditions.push(`cc.nome_departamento IN (${departamentos.map(() => '?').join(',')})`)
    extraParams.push(...departamentos)
  }
  if (periodos?.length) {
    extraConditions.push(`strftime('%Y-%m', l.data_lancamento) IN (${periodos.map(() => '?').join(',')})`)
    extraParams.push(...periodos)
  }

  const allExtra = [...(where ? [where] : []), ...extraConditions].join(' AND ')
  const whereClause = allExtra ? `AND ${allExtra}` : ''

  const sql = `
    SELECT
      cc.departamento,
      cc.nome_departamento,
      strftime('%Y-%m', l.data_lancamento) as periodo,
      SUM(CASE WHEN l.tipo = 'budget' THEN l.debito_credito ELSE 0 END) as budget,
      SUM(CASE WHEN l.tipo = 'razao'  THEN l.debito_credito ELSE 0 END) as razao
    ${STAR_SCHEMA_JOIN}
    WHERE 1=1 ${whereClause}
    GROUP BY cc.departamento, cc.nome_departamento, periodo
    ORDER BY cc.departamento, periodo
  `

  const rows = db.prepare(sql).all(...(params as unknown[]), ...extraParams) as Array<{
    departamento: string; nome_departamento: string; periodo: string
    budget: number; razao: number
  }>

  return rows.map(r => ({
    ...r,
    budget: r.budget ?? 0,
    razao:  r.razao  ?? 0,
    variacao: (r.razao ?? 0) - (r.budget ?? 0),
    variacao_pct: r.budget ? (((r.razao ?? 0) - r.budget) / Math.abs(r.budget)) * 100 : 0,
  }))
}

// ─── Distinct values para autocomplete ───────────────────────────────────────
export function getDistinctValues(column: FilterColumn, limit = 500): string[] {
  const db = getDb()
  const col = COL_SOURCE[column] ?? `l.${column}`
  const sql = `
    SELECT DISTINCT ${col} as val
    ${STAR_SCHEMA_JOIN}
    WHERE ${col} IS NOT NULL AND ${col} != ''
    ORDER BY val
    LIMIT ${limit}
  `
  const rows = db.prepare(sql).all() as Array<{ val: string }>
  return rows.map(r => r.val).filter(Boolean)
}

// ─── Summary ──────────────────────────────────────────────────────────────────
export function getSummary() {
  const db = getDb()
  return db.prepare(`
    SELECT
      COUNT(DISTINCT cc.departamento)                                        AS departamentos,
      COUNT(DISTINCT strftime('%Y-%m', l.data_lancamento))                  AS periodos,
      SUM(CASE WHEN l.tipo='budget' THEN l.debito_credito ELSE 0 END)       AS total_budget,
      SUM(CASE WHEN l.tipo='razao'  THEN l.debito_credito ELSE 0 END)       AS total_razao,
      COUNT(CASE WHEN l.tipo='budget' THEN 1 END)                           AS linhas_budget,
      COUNT(CASE WHEN l.tipo='razao'  THEN 1 END)                           AS linhas_razao,
      (SELECT COUNT(*) FROM centros_custo)                                  AS qtd_centros,
      (SELECT COUNT(*) FROM contas_contabeis)                               AS qtd_contas
    ${STAR_SCHEMA_JOIN}
  `).get() as {
    departamentos: number; periodos: number
    total_budget: number; total_razao: number
    linhas_budget: number; linhas_razao: number
    qtd_centros: number; qtd_contas: number
  }
}
