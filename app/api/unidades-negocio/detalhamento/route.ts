import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Retorna os lançamentos individuais que compõem um valor na visão de Unidades de Negócio.
// A filtragem é feita via id_cc_cc → unidades_negocio.unidade (diferente da DRE que usa
// centros_custo.nome_departamento). Isso garante que o detalhamento bata com os totais
// exibidos na página de Unidades de Negócio.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dre          = searchParams.get('dre')         ?? ''
  const agrupamento  = searchParams.get('agrupamento') ?? ''
  const conta        = searchParams.get('conta')       ?? ''
  const periodo      = searchParams.get('periodo')     ?? ''
  const tipo         = searchParams.get('tipo')        ?? 'ambos'
  const periodosRaw  = searchParams.get('periodos')    ?? ''
  const unidadesRaw  = searchParams.get('unidades')    ?? ''

  const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
  const unidades = unidadesRaw ? unidadesRaw.split(',').filter(Boolean) : []

  try {
    const supabase = getSupabase()

    type UnRow  = { id_cc_cc: string; unidade: string }
    type CaRow  = { numero_conta_contabil: string; agrupamento_arvore: string; dre: string }
    type CcRow  = { centro_custo: string; nome_centro_custo: string; nome_area: string; nome_departamento: string }
    type LancRow = {
      id: number; tipo: string; data_lancamento: string; numero_transacao: string
      numero_conta_contabil: string; nome_conta_contabil: string
      centro_custo: string; debito_credito: number; observacao: string
      fonte: string; num_transacao: string; id_cc_cc: string
      nome_conta_contrapartida: string
    }

    // ── 1. Lookups em paralelo ──────────────────────────────────────────────────
    const [unRes, caRes, ccRes] = await Promise.all([
      supabase.from('unidades_negocio').select('id_cc_cc,unidade').range(0, 49999),
      supabase.from('contas_contabeis').select('numero_conta_contabil,agrupamento_arvore,dre').range(0, 49999),
      supabase.from('centros_custo').select('centro_custo,nome_centro_custo,nome_area,nome_departamento').range(0, 49999),
    ])

    if (unRes.error) throw new Error(unRes.error.message)
    if (caRes.error) throw new Error(caRes.error.message)
    if (ccRes.error) throw new Error(ccRes.error.message)

    const unRows = (unRes.data ?? []) as UnRow[]
    const caMap  = new Map((caRes.data ?? [] as CaRow[]).map((r: CaRow) => [r.numero_conta_contabil, r]))
    const ccMap  = new Map((ccRes.data ?? [] as CcRow[]).map((r: CcRow) => [r.centro_custo, r]))

    // ── 2. Deriva id_cc_cc a partir das unidades selecionadas ──────────────────
    let idCcCcFiltro: string[] | null = null
    if (unidades.length > 0) {
      idCcCcFiltro = unRows
        .filter(r => unidades.includes(r.unidade ?? 'Sem Unidade'))
        .map(r => r.id_cc_cc)
      if (idCcCcFiltro.length === 0) {
        return NextResponse.json({ rows: [], truncated: false })
      }
    }

    // ── 3. Filtra contas a partir do contexto DRE/agrupamento/conta ────────────
    let contasFiltro: string[] | null = null
    if (conta) {
      contasFiltro = [conta]
    } else if (dre || agrupamento) {
      contasFiltro = (caRes.data ?? []).filter((r: CaRow) => {
        if (dre         && (r.dre               ?? 'Sem Classificação') !== dre)         return false
        if (agrupamento && (r.agrupamento_arvore ?? 'Sem Agrupamento')  !== agrupamento) return false
        return true
      }).map((r: CaRow) => r.numero_conta_contabil)
      if (contasFiltro.length === 0) {
        return NextResponse.json({ rows: [], truncated: false })
      }
    }

    // ── 4. Query paginada de lançamentos (contorna max-rows do PostgREST) ───────
    const PAGE = 1000
    const MAX_PAGES = 500
    const lancRows: LancRow[] = []

    for (let page = 0; page < MAX_PAGES; page++) {
      let q = supabase
        .from('lancamentos')
        .select('id,tipo,data_lancamento,numero_transacao,numero_conta_contabil,nome_conta_contabil,centro_custo,debito_credito,observacao,fonte,num_transacao,id_cc_cc,nome_conta_contrapartida')
        .order('data_lancamento', { ascending: true })
        .order('numero_conta_contabil', { ascending: true })
        .order('id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)

      // Filtra apenas lançamentos com id_cc_cc vinculado à unidade selecionada
      if (idCcCcFiltro) {
        q = q.in('id_cc_cc', idCcCcFiltro)
      } else {
        // Sem filtro de unidade: retorna apenas lançamentos que têm id_cc_cc preenchido
        q = q.not('id_cc_cc', 'is', null)
      }

      if (tipo !== 'ambos')    q = q.eq('tipo', tipo)
      if (contasFiltro)        q = q.in('numero_conta_contabil', contasFiltro)

      if (periodo) {
        q = q.gte('data_lancamento', `${periodo}-01`).lte('data_lancamento', `${periodo}-31`)
      } else if (periodos.length > 0) {
        const sorted  = [...periodos].sort()
        const minDate = `${sorted[0]}-01`
        const last    = sorted[sorted.length - 1]
        const [lyr, lmo] = last.split('-').map(Number)
        const nextYr  = lmo === 12 ? lyr + 1 : lyr
        const nextMo  = lmo === 12 ? 1 : lmo + 1
        const maxDate = `${nextYr}-${String(nextMo).padStart(2, '0')}-01`
        q = q.gte('data_lancamento', minDate).lt('data_lancamento', maxDate)
      }

      const lancRes = await q
      if (lancRes.error) throw new Error(lancRes.error.message)
      const batch = (lancRes.data ?? []) as LancRow[]
      lancRows.push(...batch)
      if (batch.length < PAGE) break
    }

    const periodoSet = new Set(periodos)

    // ── 5. Enriquecimento + filtragem exata por período ────────────────────────
    // Mapa de id_cc_cc → unidade (para exibir no modal)
    const idCcUnMap = new Map(unRows.map(r => [r.id_cc_cc, r.unidade]))

    const rows = lancRows
      .filter(l => {
        if (periodoSet.size > 0) {
          const p = (l.data_lancamento ?? '').substring(0, 7)
          if (!periodoSet.has(p)) return false
        }
        return true
      })
      .map(l => {
        const cc = ccMap.get(l.centro_custo)
        const ca = caMap.get(l.numero_conta_contabil)
        return {
          id:                       l.id,
          tipo:                     l.tipo,
          data_lancamento:          l.data_lancamento,
          numero_transacao:         l.numero_transacao,
          numero_conta_contabil:    l.numero_conta_contabil,
          nome_conta_contabil:      l.nome_conta_contabil,
          centro_custo:             l.centro_custo,
          nome_centro_custo:        cc?.nome_centro_custo  ?? '',
          nome_area:                cc?.nome_area          ?? '',
          agrupamento_arvore:       ca?.agrupamento_arvore ?? 'Sem Agrupamento',
          dre:                      ca?.dre                ?? 'Sem Classificação',
          nome_conta_contrapartida: l.nome_conta_contrapartida,
          debito_credito:           l.debito_credito,
          observacao:               l.observacao,
          fonte:                    l.fonte,
          num_transacao:            l.num_transacao,
          id_cc_cc:                 l.id_cc_cc,
          // unidade vem da dimensão id_cc_cc → unidades_negocio (não do centro_custo)
          unidade:                  idCcUnMap.get(l.id_cc_cc ?? '') ?? '',
        }
      })

    const truncated = lancRows.length >= PAGE * MAX_PAGES
    return NextResponse.json({ rows, truncated })
  } catch (e) {
    console.error('[unidades-negocio/detalhamento]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
