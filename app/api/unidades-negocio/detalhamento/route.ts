import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { getUserUnidades } from '@/lib/query'

export const dynamic = 'force-dynamic'

// Retorna os lançamentos individuais da visão de Unidades de Negócio.
// Usa a RPC get_unidades_negocio_lancamentos_detail que faz o JOIN via id_cc_cc no banco,
// evitando o problema de URL muito longa (.in() com centenas de ids) no PostgREST.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dre         = searchParams.get('dre')         ?? ''
  const agrupamento = searchParams.get('agrupamento') ?? ''
  const conta       = searchParams.get('conta')       ?? ''
  const periodo     = searchParams.get('periodo')     ?? ''
  const tipo        = searchParams.get('tipo')        ?? 'ambos'
  const periodosRaw = searchParams.get('periodos')    ?? ''
  const unidadesRaw = searchParams.get('unidades')    ?? ''

  // Suporte a `periodo` único (YYYY-MM) e `periodos` múltiplos
  let periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
  if (periodo && !periodos.includes(periodo)) periodos = [periodo, ...periodos]
  const unidades = unidadesRaw ? unidadesRaw.split(',').filter(Boolean) : []

  try {
    const sessionUser = await getSession()
    const isDeptUser  = sessionUser?.role === 'dept'

    // UB is the sole access control — dept/CC filter is never applied here
    let allowedUnidades = unidades
    if (isDeptUser && sessionUser?.userId) {
      const userUnidades = await getUserUnidades(sessionUser.userId)
      if (userUnidades === null) {
        // Dept user with no UBs assigned → no access
        return NextResponse.json({ rows: [], truncated: false })
      }
      // Restrict strictly to assigned UBs (ignore CC/dept)
      allowedUnidades = unidades.length > 0
        ? unidades.filter((u: string) => userUnidades.includes(u))
        : userUnidades
      if (allowedUnidades.length === 0) {
        return NextResponse.json({ rows: [], truncated: false })
      }
    }

    const supabase = getSupabase()

    const PAGE      = 1000
    const MAX_PAGES = 500   // teto de 500 k linhas

    type LancRow = {
      id: number; tipo: string; data_lancamento: string; numero_transacao: string
      numero_conta_contabil: string; nome_conta_contabil: string
      centro_custo: string; nome_centro_custo: string; nome_area: string
      agrupamento_arvore: string; dre: string
      nome_conta_contrapartida: string; debito_credito: number
      observacao: string; fonte: string; num_transacao: string
      id_cc_cc: string; unidade: string
    }

    const allRows: LancRow[] = []

    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase.rpc('get_unidades_negocio_lancamentos_detail', {
        p_unidades:      allowedUnidades,
        p_periodos:      periodos,
        p_tipo:          tipo,
        p_dre:           dre,
        p_agrupamento:   agrupamento,
        p_conta:         conta,
        p_offset:        page * PAGE,
        p_limit:         PAGE,
        p_departamentos: [],
      })

      if (error) throw new Error(error.message)

      const batch = Array.isArray(data) ? (data as LancRow[]) : []
      allRows.push(...batch)
      if (batch.length < PAGE) break
    }

    const truncated = allRows.length >= PAGE * MAX_PAGES
    return NextResponse.json({ rows: allRows, truncated })
  } catch (e) {
    console.error('[unidades-negocio/detalhamento]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
