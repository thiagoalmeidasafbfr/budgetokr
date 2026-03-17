import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Retorna os lançamentos individuais que compõem um valor da DRE,
// equivalente ao "Abrir detalhamento" do sistema atual.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dre         = searchParams.get('dre')         ?? ''
  const agrupamento = searchParams.get('agrupamento') ?? ''
  const periodo     = searchParams.get('periodo')     ?? ''
  const tipo        = searchParams.get('tipo')        ?? 'ambos'  // budget | razao | ambos

  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  // Filtro de tipo
  if (tipo === 'budget' || tipo === 'razao') {
    conditions.push(`l.tipo = ?`)
    params.push(tipo)
  }

  // Filtro de DRE (grupo pai)
  if (dre) {
    conditions.push(`ca.dre = ?`)
    params.push(dre)
  }

  // Filtro de agrupamento_arvore (filho)
  if (agrupamento) {
    conditions.push(`ca.agrupamento_arvore = ?`)
    params.push(agrupamento)
  }

  // Filtro de período
  if (periodo) {
    conditions.push(`strftime('%Y-%m', l.data_lancamento) = ?`)
    params.push(periodo)
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
