import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Retorna os lançamentos individuais que compõem um valor da DRE.
// Todos os filtros são empurrados para o banco (sem limite artificial).
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
  let   departamentos = departamentosRaw ? departamentosRaw.split(',').filter(Boolean) : []
  const centros       = centrosRaw       ? centrosRaw.split(',').filter(Boolean)       : []
  const unidades      = unidadesRaw      ? unidadesRaw.split(',').filter(Boolean)      : []

  // Enforce dept restriction server-side — dept users can only see their own dept
  const sessionUser = await getSession()
  const forcedDept  = sessionUser?.role === 'dept' ? sessionUser.department : undefined
  if (forcedDept) {
    departamentos = [forcedDept]
  }

  try {
    const supabase = getSupabase()

    type CcRow  = { centro_custo: string; nome_centro_custo: string; nome_area: string; nome_departamento: string }
    type CaRow  = { numero_conta_contabil: string; agrupamento_arvore: string; dre: string }
    type LancRow = {
      id: number; tipo: string; data_lancamento: string; numero_transacao: string
      numero_conta_contabil: string; nome_conta_contabil: string
      centro_custo: string; debito_credito: number; observacao: string
      fonte: string; num_transacao: string; id_cc_cc: string
      nome_conta_contrapartida: string
    }

    // ── 1. Deriva contasFiltro de forma segmentada ─────────────────────────────
    // Usa query filtrada no banco ao invés de carregar a tabela inteira
    // (evita o limite de 1000 linhas do PostgREST para tabelas grandes)

    let contasFiltro: string[] | null = null

    if (conta) {
      contasFiltro = [conta]
    } else {
      // Monta query segmentada na contas_contabeis
      let caQ = supabase.from('contas_contabeis')
        .select('numero_conta_contabil,agrupamento_arvore,dre')

      if (dre)         caQ = caQ.eq('dre', dre)
      if (agrupamento) caQ = caQ.eq('agrupamento_arvore', agrupamento)
      if (!dre && !agrupamento) {
        // Sem filtro explícito (subtotal row) → apenas contas cujo grupo DRE
        // existe em dre_linhas. Isso garante que o total do detalhamento bata
        // com os subtotais da DRE (contas "sem classificação" ou com grupos
        // fora da estrutura da DRE não entram nos subtotais).
        const linhasRes = await supabase.from('dre_linhas')
          .select('nome').eq('tipo', 'grupo')
        const validGroups = (linhasRes.data ?? []).map((r: { nome: string }) => r.nome)
        if (validGroups.length > 0) {
          caQ = caQ.in('dre', validGroups)
        } else {
          caQ = caQ.not('dre', 'is', null)
        }
      }

      // Pagina a busca de contas para suportar planos de conta grandes (>1000 contas)
      const caRows: CaRow[] = []
      for (let pg = 0; ; pg++) {
        const res = await caQ.range(pg * 1000, pg * 1000 + 999)
        if (res.error) throw new Error(res.error.message)
        const batch = (res.data ?? []) as CaRow[]
        caRows.push(...batch)
        if (batch.length < 1000) break
      }

      contasFiltro = caRows.map(r => r.numero_conta_contabil)
      if (contasFiltro.length === 0) {
        return NextResponse.json({ rows: [], truncated: false })
      }
    }

    // ── 2. Deriva centrosFiltro de forma segmentada ────────────────────────────
    let centrosFiltro: string[] = centros.slice()

    if (unidades.length > 0) {
      // Busca apenas os CCs que pertencem às unidades selecionadas
      const res = await supabase.from('centros_custo')
        .select('centro_custo')
        .in('nome_departamento', unidades)
        .range(0, 49999)
      if (res.error) throw new Error(res.error.message)
      const ccPorUnidade = (res.data ?? []).map((r: { centro_custo: string }) => r.centro_custo)
      centrosFiltro = centrosFiltro.length > 0
        ? centrosFiltro.filter(c => ccPorUnidade.includes(c))
        : ccPorUnidade
      if (centrosFiltro.length === 0) {
        return NextResponse.json({ rows: [], truncated: false })
      }
    } else if (forcedDept || departamento || departamentos.length > 0) {
      const depts = forcedDept
        ? [forcedDept]
        : [...departamentos, ...(departamento ? [departamento] : [])]
      const res = await supabase.from('centros_custo')
        .select('centro_custo')
        .in('nome_departamento', depts)
        .range(0, 49999)
      if (res.error) throw new Error(res.error.message)
      const ccPorDept = (res.data ?? []).map((r: { centro_custo: string }) => r.centro_custo)
      centrosFiltro = centrosFiltro.length > 0
        ? centrosFiltro.filter(c => ccPorDept.includes(c))
        : ccPorDept
      if (centrosFiltro.length === 0) {
        return NextResponse.json({ rows: [], truncated: false })
      }
    }

    // ── 3. Query paginada de lançamentos ───────────────────────────────────────
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

      if (tipo !== 'ambos')         q = q.eq('tipo', tipo)
      if (contasFiltro)             q = q.in('numero_conta_contabil', contasFiltro)
      if (centrosFiltro.length > 0) q = q.in('centro_custo', centrosFiltro)

      if (periodo) {
        q = q.gte('data_lancamento', `${periodo}-01`).lte('data_lancamento', `${periodo}-31`)
      } else if (periodos.length > 0) {
        const sorted = [...periodos].sort()
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

    // ── 4. Enriquecimento seletivo ─────────────────────────────────────────────
    // Busca apenas os centros_custo e contas_contabeis que realmente aparecem
    // nos lançamentos encontrados — evita carregar tabelas inteiras
    const uniqueCCs    = [...new Set(lancRows.map(l => l.centro_custo).filter(Boolean))]
    const uniqueContas = [...new Set(lancRows.map(l => l.numero_conta_contabil).filter(Boolean))]

    const [ccEnrichRes, caEnrichRes] = await Promise.all([
      uniqueCCs.length > 0
        ? supabase.from('centros_custo')
            .select('centro_custo,nome_centro_custo,nome_area,nome_departamento')
            .in('centro_custo', uniqueCCs)
        : Promise.resolve({ data: [] as CcRow[], error: null }),
      uniqueContas.length > 0
        ? supabase.from('contas_contabeis')
            .select('numero_conta_contabil,agrupamento_arvore,dre')
            .in('numero_conta_contabil', uniqueContas)
        : Promise.resolve({ data: [] as CaRow[], error: null }),
    ])

    if (ccEnrichRes.error) throw new Error((ccEnrichRes.error as { message: string }).message)
    if (caEnrichRes.error) throw new Error((caEnrichRes.error as { message: string }).message)

    const ccMap = new Map((ccEnrichRes.data ?? []).map((r: CcRow) => [r.centro_custo, r]))
    const caMap = new Map((caEnrichRes.data ?? []).map((r: CaRow) => [r.numero_conta_contabil, r]))

    // ── 5. Filtragem exata por período + enriquecimento ────────────────────────
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
          unidade:                  cc?.nome_departamento  ?? '',
        }
      })

    const truncated = lancRows.length >= PAGE * MAX_PAGES
    return NextResponse.json({ rows, truncated })
  } catch (e) {
    console.error('[detalhamento]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
