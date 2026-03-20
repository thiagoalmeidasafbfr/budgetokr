import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const STAR_JOIN = `
  FROM capex c
  LEFT JOIN centros_custo  cc ON c.centro_custo          = cc.centro_custo
  LEFT JOIN contas_contabeis ca ON c.numero_conta_contabil = ca.numero_conta_contabil
`

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type')

  const db = getDb()

  // Distinct values for filters
  if (type === 'distinct') {
    const col = sp.get('col') ?? ''
    const colMap: Record<string, string> = {
      nome_departamento: 'cc.nome_departamento',
      departamento:      'cc.departamento',
      centro_custo:      'c.centro_custo',
      nome_projeto:      'c.nome_projeto',
      data_lancamento:   'c.data_lancamento',
      numero_conta_contabil: 'c.numero_conta_contabil',
    }
    const sqlCol = colMap[col]
    if (!sqlCol) return NextResponse.json([])
    const rows = db.prepare(`
      SELECT DISTINCT ${sqlCol} as val
      ${STAR_JOIN}
      WHERE ${sqlCol} IS NOT NULL AND ${sqlCol} != ''
      ORDER BY val
      LIMIT 500
    `).all() as Array<{ val: string }>
    return NextResponse.json(rows.map(r => r.val))
  }

  // Projetos for a department
  if (type === 'projetos') {
    const dept = sp.get('departamento')
    const conditions: string[] = []
    const params: unknown[] = []
    if (dept) {
      conditions.push('cc.nome_departamento = ?')
      params.push(dept)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db.prepare(`
      SELECT DISTINCT c.nome_projeto as nome_projeto
      ${STAR_JOIN}
      ${where}
      ORDER BY c.nome_projeto
    `).all(...params) as Array<{ nome_projeto: string }>
    return NextResponse.json(rows.map(r => r.nome_projeto).filter(Boolean))
  }

  // Main query: CAPEX data aggregated
  const forcedDept = req.headers.get('x-user-role') === 'dept'
    ? req.headers.get('x-user-dept') || undefined
    : undefined

  const departamentos = forcedDept
    ? [forcedDept]
    : sp.get('departamentos')?.split(',').filter(Boolean) ?? []
  const periodos = sp.get('periodos')?.split(',').filter(Boolean) ?? []
  const projetos = sp.get('projetos')?.split(',').filter(Boolean) ?? []
  const groupByProjeto = sp.get('groupByProjeto') !== 'false'
  const groupByCentro = sp.get('groupByCentro') === 'true'

  const conditions: string[] = []
  const params: unknown[] = []

  if (departamentos.length) {
    conditions.push(`cc.nome_departamento IN (${departamentos.map(() => '?').join(',')})`)
    params.push(...departamentos)
  }
  if (periodos.length) {
    conditions.push(`strftime('%Y-%m', c.data_lancamento) IN (${periodos.map(() => '?').join(',')})`)
    params.push(...periodos)
  }
  if (projetos.length) {
    conditions.push(`c.nome_projeto IN (${projetos.map(() => '?').join(',')})`)
    params.push(...projetos)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  // Build GROUP BY dynamically
  const selectCols: string[] = []
  const groupCols: string[] = []

  if (groupByProjeto) {
    selectCols.push('c.nome_projeto')
    groupCols.push('c.nome_projeto')
  }
  if (groupByCentro) {
    selectCols.push('c.centro_custo', 'cc.nome_centro_custo')
    groupCols.push('c.centro_custo', 'cc.nome_centro_custo')
  }

  selectCols.push('cc.departamento', 'cc.nome_departamento')
  groupCols.push('cc.departamento', 'cc.nome_departamento')

  selectCols.push("strftime('%Y-%m', c.data_lancamento) as periodo")
  groupCols.push("strftime('%Y-%m', c.data_lancamento)")

  const sql = `
    SELECT
      ${selectCols.join(', ')},
      SUM(CASE WHEN c.tipo = 'budget' THEN c.debito_credito ELSE 0 END) as budget,
      SUM(CASE WHEN c.tipo = 'razao'  THEN c.debito_credito ELSE 0 END) as razao
    ${STAR_JOIN}
    ${whereClause}
    GROUP BY ${groupCols.join(', ')}
    ORDER BY ${groupCols.join(', ')}
  `

  const rows = db.prepare(sql).all(...params) as Array<{
    nome_projeto?: string
    centro_custo?: string
    nome_centro_custo?: string
    departamento: string
    nome_departamento: string
    periodo: string
    budget: number
    razao: number
  }>

  return NextResponse.json(rows.map(r => ({
    ...r,
    budget: r.budget ?? 0,
    razao: r.razao ?? 0,
    variacao: (r.razao ?? 0) - (r.budget ?? 0),
    variacao_pct: r.budget ? (((r.razao ?? 0) - r.budget) / Math.abs(r.budget)) * 100 : 0,
  })))
}
