import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Retorna os lançamentos individuais que compõem um valor da DRE.
// Usa queries diretas nas tabelas (sem depender de RPCs) e faz join em memória.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dre              = searchParams.get('dre')             ?? ''
  const agrupamento      = searchParams.get('agrupamento')     ?? ''
  const conta            = searchParams.get('conta')           ?? ''
  const periodo          = searchParams.get('periodo')         ?? ''
  const tipo             = searchParams.get('tipo')            ?? 'ambos'
  const departamento     = searchParams.get('departamento')    ?? ''
  const periodosRaw      = searchParams.get('periodos')        ?? ''
  const departamentosRaw = searchParams.get('departamentos')   ?? ''
  const centrosRaw       = searchParams.get('centros')         ?? ''
  const unidadesRaw      = searchParams.get('unidades')        ?? ''

  const periodos      = periodosRaw      ? periodosRaw.split(',').filter(Boolean)      : []
  const departamentos = departamentosRaw ? departamentosRaw.split(',').filter(Boolean) : []
  const centros       = centrosRaw       ? centrosRaw.split(',').filter(Boolean)       : []
  const unidades      = unidadesRaw      ? unidadesRaw.split(',').filter(Boolean)      : []

  try {
    const supabase = getSupabase()

    // ── 1. Monta query de lançamentos com filtros diretos ─────────────────────
    type LancRow = {
      id: number; tipo: string; data_lancamento: string; numero_transacao: string
      numero_conta_contabil: string; nome_conta_contabil: string
      centro_custo: string; debito_credito: number; observacao: string
      fonte: string; num_transacao: string; id_cc_cc: string
      nome_conta_contrapartida: string
    }

    let q = supabase
      .from('lancamentos')
      .select('id,tipo,data_lancamento,numero_transacao,numero_conta_contabil,nome_conta_contabil,centro_custo,debito_credito,observacao,fonte,num_transacao,id_cc_cc,nome_conta_contrapartida')
      .order('data_lancamento', { ascending: true })
      .order('numero_conta_contabil', { ascending: true })
      .limit(50000)

    if (tipo !== 'ambos')   q = q.eq('tipo', tipo)
    if (conta)              q = q.eq('numero_conta_contabil', conta)
    if (centros.length > 0) q = q.in('centro_custo', centros)

    // Filtro de período: range simples (min–max) + filtragem exata client-side
    if (periodo) {
      q = q.gte('data_lancamento', `${periodo}-01`).lte('data_lancamento', `${periodo}-31`)
    } else if (periodos.length > 0) {
      const sorted = [...periodos].sort()
      const minDate = `${sorted[0]}-01`
      const last = sorted[sorted.length - 1]
      const [lyr, lmo] = last.split('-').map(Number)
      const nextYr = lmo === 12 ? lyr + 1 : lyr
      const nextMo = lmo === 12 ? 1 : lmo + 1
      const maxDate = `${nextYr}-${String(nextMo).padStart(2, '0')}-01`
      q = q.gte('data_lancamento', minDate).lt('data_lancamento', maxDate)
    }

    // ── 2. Busca tabelas de lookup em paralelo ────────────────────────────────
    type CcRow  = { centro_custo: string; nome_centro_custo: string; nome_area: string; nome_departamento: string }
    type CaRow  = { numero_conta_contabil: string; agrupamento_arvore: string; dre: string }
    type UnRow  = { id_cc_cc: string; unidade: string }

    const [lancRes, ccRes, caRes, unRes] = await Promise.all([
      q,
      supabase.from('centros_custo').select('centro_custo,nome_centro_custo,nome_area,nome_departamento').range(0, 9999),
      supabase.from('contas_contabeis').select('numero_conta_contabil,agrupamento_arvore,dre').range(0, 9999),
      supabase.from('unidades_negocio').select('id_cc_cc,unidade').range(0, 9999),
    ])

    if (lancRes.error) throw new Error(lancRes.error.message)
    if (ccRes.error)   throw new Error(ccRes.error.message)
    if (caRes.error)   throw new Error(caRes.error.message)
    if (unRes.error)   throw new Error(unRes.error.message)

    const lancRows = (lancRes.data ?? []) as LancRow[]
    const ccMap    = new Map((ccRes.data  ?? [] as CcRow[]).map((r: CcRow) => [r.centro_custo, r]))
    const caMap    = new Map((caRes.data  ?? [] as CaRow[]).map((r: CaRow) => [r.numero_conta_contabil, r]))
    const unMap    = new Map((unRes.data  ?? [] as UnRow[]).map((r: UnRow) => [r.id_cc_cc, r]))

    // Conjunto de períodos para filtragem exata (YYYY-MM)
    const periodoSet = new Set(periodos)

    // ── 3. Join + filtros em campos de lookup ─────────────────────────────────
    const rows = lancRows
      .map(l => {
        const cc = ccMap.get(l.centro_custo)
        const ca = caMap.get(l.numero_conta_contabil)
        const un = l.id_cc_cc ? unMap.get(l.id_cc_cc) : undefined
        return {
          id:                       l.id,
          tipo:                     l.tipo,
          data_lancamento:          l.data_lancamento,
          numero_transacao:         l.numero_transacao,
          numero_conta_contabil:    l.numero_conta_contabil,
          nome_conta_contabil:      l.nome_conta_contabil,
          centro_custo:             l.centro_custo,
          nome_centro_custo:        cc?.nome_centro_custo        ?? '',
          nome_area:                cc?.nome_area                ?? '',
          agrupamento_arvore:       ca?.agrupamento_arvore ?? 'Sem Agrupamento',
          dre:                      ca?.dre                ?? 'Sem Classificação',
          nome_conta_contrapartida: l.nome_conta_contrapartida,
          debito_credito:           l.debito_credito,
          observacao:               l.observacao,
          fonte:                    l.fonte,
          num_transacao:            l.num_transacao,
          id_cc_cc:                 l.id_cc_cc,
          unidade:                  un?.unidade                  ?? '',
          _dept:                    cc?.nome_departamento        ?? '',
          _periodo:                 (l.data_lancamento ?? '').substring(0, 7),
        }
      })
      .filter(r => {
        // Filtragem exata por mês (compensação pelo range simples no DB)
        if (periodoSet.size > 0 && !periodoSet.has(r._periodo)) return false
        if (dre         && r.dre               !== dre)         return false
        if (agrupamento && r.agrupamento_arvore !== agrupamento) return false
        if (departamento && r._dept            !== departamento) return false
        if (departamentos.length > 0 && !departamentos.includes(r._dept))   return false
        if (unidades.length > 0      && !unidades.includes(r.unidade))      return false
        return true
      })
      // Remove campos internos
      .map(({ _dept, _periodo, ...rest }) => rest)

    const LIMIT    = 50000
    const truncated = lancRows.length >= LIMIT
    return NextResponse.json({ rows, truncated })
  } catch (e) {
    console.error('[detalhamento]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
