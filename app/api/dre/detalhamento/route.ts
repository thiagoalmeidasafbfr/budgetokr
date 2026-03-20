import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Retorna os lançamentos individuais que compõem um valor da DRE,
// equivalente ao "Abrir detalhamento" do sistema atual.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dre             = searchParams.get('dre')             ?? ''
  const agrupamento     = searchParams.get('agrupamento')     ?? ''
  const nomeContaContabil = searchParams.get('nome_conta_contabil') ?? ''
  const periodo         = searchParams.get('periodo')         ?? ''
  const tipo            = searchParams.get('tipo')            ?? 'ambos'
  const departamento    = searchParams.get('departamento')    ?? ''
  const periodosRaw     = searchParams.get('periodos')        ?? ''
  const departamentosRaw = searchParams.get('departamentos')  ?? ''
  const centrosRaw      = searchParams.get('centros')         ?? ''

  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (tipo === 'budget' || tipo === 'razao') {
    conditions.push(`l.tipo = ?`)
    params.push(tipo)
  }

  if (dre) {
    conditions.push(`ca.dre = ?`)
    params.push(dre)
  }

  if (agrupamento) {
    conditions.push(`ca.agrupamento_arvore = ?`)
    params.push(agrupamento)
  }

  if (nomeContaContabil) {
    conditions.push(`COALESCE(ca.nome_conta_contabil, l.nome_conta_contabil) = ?`)
    params.push(nomeContaContabil)
  }

  // Período único (vem do clique numa célula de período específico)
  if (periodo) {
    conditions.push(`strftime('%Y-%m', l.data_lancamento) = ?`)
    params.push(periodo)
  }

  // Períodos múltiplos (filtro ativo da DRE principal) — só aplica se não há período único
  if (periodosRaw && !periodo) {
    const periodos = periodosRaw.split(',').filter(Boolean)
    if (periodos.length) {
      conditions.push(`strftime('%Y-%m', l.data_lancamento) IN (${periodos.map(() => '?').join(',')})`)
      params.push(...periodos)
    }
  }

  // Departamentos múltiplos (filtro ativo da DRE principal)
  if (departamentosRaw) {
    const depts = departamentosRaw.split(',').filter(Boolean)
    if (depts.length) {
      conditions.push(`cc.nome_departamento IN (${depts.map(() => '?').join(',')})`)
      params.push(...depts)
    }
  } else if (departamento) {
    // fallback: parâmetro legado de departamento único
    conditions.push(`cc.nome_departamento = ?`)
    params.push(departamento)
  }

  // Centros de custo (subfiltro da DRE principal)
  if (centrosRaw) {
    const centros = centrosRaw.split(',').filter(Boolean)
    if (centros.length) {
      conditions.push(`l.centro_custo IN (${centros.map(() => '?').join(',')})`)
      params.push(...centros)
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = db.prepare(`
    SELECT
      l.id,
      l.tipo,
      l.data_lancamento,
      l.numero_conta_contabil,
      l.nome_conta_contabil,
      l.centro_custo,
      cc.nome_centro_custo,
      ca.agrupamento_arvore,
      ca.dre,
      l.nome_conta_contrapartida,
      l.debito_credito,
      l.observacao,
      l.fonte
    FROM lancamentos l
    LEFT JOIN centros_custo   cc ON l.centro_custo          = cc.centro_custo
    LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil
    ${whereClause}
    ORDER BY l.data_lancamento, l.numero_conta_contabil
    LIMIT 5000
  `).all(...params)

  return NextResponse.json(rows)
}
