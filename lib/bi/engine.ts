// lib/bi/engine.ts — BI Canvas Query Engine
//
// MAPEAMENTO — resultado da auditoria (Fase 0)
//
// Tabela de lançamentos: `lancamentos`
//   campos relevantes: id, tipo ('budget'|'razao'), data_lancamento (DATE),
//   numero_conta_contabil, centro_custo, id_cc_cc, debito_credito (NUMERIC)
//
// Tabela de estrutura DRE: `dre_linhas`
//   campos: id, ordem (INT), nome (TEXT unique), tipo ('grupo'|'subtotal'|'calculada'),
//   sinal (INT 1|-1), formula_grupos (JSONB array of agrupamento_arvore names),
//   formula_sinais (JSONB), negrito (INT 0|1), separador (INT 0|1)
//   Subtotal = sum(preceding_grupo_values * grupo.sinal) * subtotal.sinal
//   Calculada = custom formula (handled in page layer, skipped here)
//
// Tabela centros de custo: `centros_custo`
//   campos: centro_custo (PK text), nome_centro_custo, departamento (text),
//   nome_departamento, area, nome_area
//
// Tabela departamentos: não existe tabela separada — denormalizada em centros_custo
//   (centros_custo.departamento + nome_departamento são os campos de referência)
//
// Tabela budget/orçamento: `lancamentos` WHERE tipo='budget'  (mesma tabela do razão)
//
// Como calcular um subtotal:
//   sum_realizado = Σ grupo_lines_before_subtotal * grupo.sinal
//   subtotal_realizado = sum_realizado * subtotal.sinal
//
// Campo de período/competência: lancamentos.data_lancamento (DATE)
//   Agrupado como YYYY-MM via substring. Queries RPC usam array de 'YYYY-MM' strings.
//
// Tipos já existentes reutilizáveis:
//   DRELinha (lib/dre-utils.ts), DRERow, DREAccountRow, TreeNode
//   getDRELinhas(), getDRE(), getDREByAccount() em lib/query.ts
//   buildTreeFromLinhas() em lib/dre-utils.ts
//
// RPCs disponíveis:
//   get_dre(p_periodos, p_departamentos, p_centros) → DRERow[]
//   get_dre_by_account(p_periodos, p_departamentos, p_centros) → DREAccountRow[]
//   get_analise(p_filters, p_departamentos, p_periodos, p_group_by_cc, p_centros)
//   run_star_query(p_tipo, p_filters, p_logic, p_extra_filters, p_periodos, p_group_dept, p_group_period, p_group_cc)

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  WidgetConfig, BiScope, BiPeriodo, BiMetrica,
  BiQueryResult, DreLine, DreStructureLine,
} from './widget-types'
import { safePct } from '@/lib/utils'

// ─── Period helpers ───────────────────────────────────────────────────────────

export function periodosFromBiPeriodo(p: BiPeriodo): string[] {
  if (p.tipo === 'mes') {
    return [`${p.ano}-${String(p.mes).padStart(2, '0')}`]
  }
  if (p.tipo === 'ytd') {
    const result: string[] = []
    for (let m = 1; m <= 12; m++) result.push(`${p.ano}-${String(m).padStart(2, '0')}`)
    return result
  }
  // range
  const result: string[] = []
  const [y1, m1] = p.de.split('-').map(Number)
  const [y2, m2] = p.ate.split('-').map(Number)
  let y = y1, m = m1
  while (y < y2 || (y === y2 && m <= m2)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return result
}

export function labelFromBiPeriodo(p: BiPeriodo): string {
  const MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  if (p.tipo === 'mes') return `${MES[p.mes - 1]} ${p.ano}`
  if (p.tipo === 'ytd') return `YTD ${p.ano}`
  const [y1, m1] = p.de.split('-').map(Number)
  const [y2, m2] = p.ate.split('-').map(Number)
  return `${MES[m1-1]}–${MES[m2-1]} ${y1 === y2 ? y1 : `${y1}/${y2}`}`
}

function prevPeriodo(p: BiPeriodo, tipo: 'mes_anterior' | 'ano_anterior'): string[] {
  if (p.tipo === 'mes') {
    if (tipo === 'mes_anterior') {
      const pm = p.mes === 1 ? 12 : p.mes - 1
      const py = p.mes === 1 ? p.ano - 1 : p.ano
      return [`${py}-${String(pm).padStart(2, '0')}`]
    }
    return [`${p.ano - 1}-${String(p.mes).padStart(2, '0')}`]
  }
  const periodos = periodosFromBiPeriodo(p)
  if (tipo === 'ano_anterior') {
    return periodos.map(pp => `${parseInt(pp.slice(0, 4)) - 1}${pp.slice(4)}`)
  }
  // mes_anterior for range/ytd: shift all months back one
  return periodos.map(pp => {
    const [y, m] = pp.split('-').map(Number)
    const pm = m === 1 ? 12 : m - 1
    const py = m === 1 ? y - 1 : y
    return `${py}-${String(pm).padStart(2, '0')}`
  })
}

// ─── DRE data fetching ────────────────────────────────────────────────────────

interface DREAggRow {
  dre: string
  agrupamento_arvore: string
  periodo: string
  budget: number
  razao: number
}

async function fetchDREData(
  periodos: string[],
  scope: BiScope,
  supabase: SupabaseClient
): Promise<DREAggRow[]> {
  const depts = scope.departamento_id ? [scope.departamento_id] : []
  const centros = scope.centros_custo ?? []
  const { data, error } = await supabase.rpc('get_dre', {
    p_periodos:      periodos,
    p_departamentos: depts,
    p_centros:       centros,
  })
  if (error) throw new Error(`get_dre: ${error.message}`)
  return (data ?? []) as DREAggRow[]
}

async function fetchDRELinhas(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('dre_linhas')
    .select('id, ordem, nome, tipo, sinal, formula_grupos, formula_sinais, negrito, separador')
    .order('ordem')
  if (error) throw new Error(`dre_linhas: ${error.message}`)
  return (data ?? []) as Array<{
    id: number; ordem: number; nome: string
    tipo: string; sinal: number
    formula_grupos: unknown; formula_sinais: unknown
    negrito: number; separador: number
  }>
}

// ─── Aggregate DRE rows into grupo totals ─────────────────────────────────────

interface GrupoAgg {
  budget: number
  razao: number
  byPeriod: Record<string, { budget: number; razao: number }>
}

function aggregateDRE(rows: DREAggRow[]): Map<string, GrupoAgg> {
  const map = new Map<string, GrupoAgg>()
  for (const row of rows) {
    const key = row.dre
    if (!map.has(key)) map.set(key, { budget: 0, razao: 0, byPeriod: {} })
    const agg = map.get(key)!
    agg.budget += row.budget ?? 0
    agg.razao  += row.razao  ?? 0
    if (row.periodo) {
      const p = row.periodo.substring(0, 7)
      if (!agg.byPeriod[p]) agg.byPeriod[p] = { budget: 0, razao: 0 }
      agg.byPeriod[p].budget += row.budget ?? 0
      agg.byPeriod[p].razao  += row.razao  ?? 0
    }
  }
  return map
}

// ─── Compute a single DRE line from aggregated grupo data ─────────────────────

function computeLine(
  linha: { nome: string; tipo: string; sinal: number },
  grupoMap: Map<string, GrupoAgg>,
  allLinhas: Array<{ nome: string; tipo: string; sinal: number; ordem: number }>,
  linhaOrdem: number
): { realizado: number; budget: number; byPeriod: Record<string, { budget: number; razao: number }> } {
  if (linha.tipo === 'grupo') {
    const agg = grupoMap.get(linha.nome)
    return {
      realizado: (agg?.razao ?? 0) * linha.sinal,
      budget:    (agg?.budget ?? 0) * linha.sinal,
      byPeriod:  Object.fromEntries(
        Object.entries(agg?.byPeriod ?? {}).map(([p, v]) => [p, {
          budget: v.budget * linha.sinal,
          razao:  v.razao  * linha.sinal,
        }])
      ),
    }
  }
  // subtotal: sum all preceding grupo lines * their sinal, then * subtotal.sinal
  let sumRazao = 0, sumBudget = 0
  const sumByPeriod: Record<string, { budget: number; razao: number }> = {}
  for (const prev of allLinhas) {
    if (prev.tipo !== 'grupo' || prev.ordem >= linhaOrdem) continue
    const agg = grupoMap.get(prev.nome)
    if (!agg) continue
    sumRazao  += agg.razao  * prev.sinal
    sumBudget += agg.budget * prev.sinal
    for (const [p, v] of Object.entries(agg.byPeriod)) {
      if (!sumByPeriod[p]) sumByPeriod[p] = { budget: 0, razao: 0 }
      sumByPeriod[p].budget += v.budget * prev.sinal
      sumByPeriod[p].razao  += v.razao  * prev.sinal
    }
  }
  const s = linha.sinal
  return {
    realizado: sumRazao  * s,
    budget:    sumBudget * s,
    byPeriod:  Object.fromEntries(
      Object.entries(sumByPeriod).map(([p, v]) => [p, {
        budget: v.budget * s,
        razao:  v.razao  * s,
      }])
    ),
  }
}

// ─── Build full DreLine array ─────────────────────────────────────────────────

function buildDreLines(
  linhas: Array<{ id: number; nome: string; tipo: string; sinal: number; ordem: number; negrito: number; separador: number }>,
  grupoMap: Map<string, GrupoAgg>,
  filterNames?: string[]
): DreLine[] {
  const result: DreLine[] = []
  for (const linha of linhas) {
    if (linha.tipo === 'calculada') continue
    if (filterNames && !filterNames.includes(linha.nome)) continue
    const comp = computeLine(linha, grupoMap, linhas, linha.ordem)
    const desvio = comp.realizado - comp.budget
    result.push({
      estrutura: {
        ordem:     linha.ordem,
        nome:      linha.nome,
        tipo:      linha.tipo as 'grupo' | 'subtotal',
        sinal:     linha.sinal,
        negrito:   linha.negrito === 1,
        separador: linha.separador === 1,
      },
      realizado:   comp.realizado,
      budget:      comp.budget,
      desvio:      desvio,
      desvio_pct:  safePct(desvio, comp.budget),
    })
  }
  return result
}

// ─── getBiDimensoes ───────────────────────────────────────────────────────────

export async function getBiDimensoes(supabase: SupabaseClient) {
  const [ccRes, linhasRes] = await Promise.all([
    supabase.from('centros_custo')
      .select('centro_custo, nome_centro_custo, departamento, nome_departamento')
      .order('nome_departamento')
      .order('nome_centro_custo'),
    supabase.from('dre_linhas')
      .select('id, ordem, nome, tipo, sinal, formula_grupos, formula_sinais, negrito, separador')
      .order('ordem'),
  ])

  if (ccRes.error) throw new Error(ccRes.error.message)
  if (linhasRes.error) throw new Error(linhasRes.error.message)

  const rows = ccRes.data ?? []

  // Build unique departamentos list from centros_custo
  const deptMap = new Map<string, string>()
  for (const r of rows) {
    if (r.departamento && !deptMap.has(r.departamento)) {
      deptMap.set(r.departamento, r.nome_departamento ?? r.departamento)
    }
  }

  return {
    departamentos: [...deptMap.entries()].map(([id, nome]) => ({ id, nome })).sort((a,b) => a.nome.localeCompare(b.nome)),
    centros_custo: rows.map((r: Record<string, unknown>) => ({
      id:             r.centro_custo as string,
      nome:           (r.nome_centro_custo ?? r.centro_custo) as string,
      departamento_id: r.departamento as string,
    })),
    linhas_dre: (linhasRes.data ?? []).map((r: Record<string, unknown>) => ({
      ordem:     r.ordem as number,
      nome:      r.nome as string,
      tipo:      r.tipo as 'grupo' | 'subtotal' | 'calculada',
      sinal:     r.sinal as number,
      negrito:   r.negrito === 1,
      separador: r.separador === 1,
    })) as DreStructureLine[],
  }
}

// ─── runBiQuery — main entry point ────────────────────────────────────────────

export async function runBiQuery(
  widgetConfig: WidgetConfig,
  supabase: SupabaseClient
): Promise<BiQueryResult> {
  const scope   = widgetConfig.scope
  const metrica = widgetConfig.metrica
  const periodos = periodosFromBiPeriodo(scope.periodo)

  switch (metrica.tipo) {

    // ── Scalar: single DRE line value ─────────────────────────────────────────
    case 'linha_dre': {
      const [rows, linhas] = await Promise.all([
        fetchDREData(periodos, scope, supabase),
        fetchDRELinhas(supabase),
      ])
      const grupoMap = aggregateDRE(rows)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'escalar', valor: 0, comparativo: null, variacao_pct: null }

      const comp = computeLine(linha, grupoMap, linhas, linha.ordem)
      let comparativo: number | null = null

      if (scope.comparativo && scope.comparativo !== null) {
        const prevRows = await fetchDREData(
          prevPeriodo(scope.periodo, scope.comparativo === 'budget' ? 'mes_anterior' : scope.comparativo),
          scope, supabase
        )
        if (scope.comparativo === 'budget') {
          comparativo = comp.budget
        } else {
          const prevMap = aggregateDRE(prevRows)
          const prevComp = computeLine(linha, prevMap, linhas, linha.ordem)
          comparativo = prevComp.realizado
        }
      }

      const variacao_pct = comparativo != null && comparativo !== 0
        ? ((comp.realizado - comparativo) / Math.abs(comparativo)) * 100
        : null

      return { tipo: 'escalar', valor: comp.realizado, comparativo, variacao_pct }
    }

    // ── Time series ───────────────────────────────────────────────────────────
    case 'serie_temporal': {
      const [rows, linhas] = await Promise.all([
        fetchDREData(periodos, scope, supabase),
        fetchDRELinhas(supabase),
      ])
      const grupoMap = aggregateDRE(rows)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'serie', pontos: [] }

      const comp = computeLine(linha, grupoMap, linhas, linha.ordem)
      const pontos = periodos.map(p => ({
        periodo:   p,
        realizado: comp.byPeriod[p]?.razao  ?? 0,
        budget:    comp.byPeriod[p]?.budget ?? null,
      }))
      return { tipo: 'serie', pontos }
    }

    // ── Breakdown by department ───────────────────────────────────────────────
    case 'breakdown_dpto': {
      const linhas = await fetchDRELinhas(supabase)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'breakdown', itens: [] }

      const { data: ccRows } = await supabase
        .from('centros_custo')
        .select('departamento, nome_departamento')
      const depts = [...new Set((ccRows ?? []).map((r: Record<string,unknown>) => r.departamento as string).filter(Boolean))]

      const results: Array<{ label: string; realizado: number; budget: number }> = []
      for (const deptId of depts) {
        const scopeDept = { ...scope, departamento_id: deptId, centros_custo: undefined }
        const rows = await fetchDREData(periodos, scopeDept, supabase)
        const gMap = aggregateDRE(rows)
        const comp = computeLine(linha, gMap, linhas, linha.ordem)
        const nomeDept = ccRows?.find((r: Record<string,unknown>) => r.departamento === deptId)?.nome_departamento as string ?? deptId
        results.push({ label: nomeDept, realizado: comp.realizado, budget: comp.budget })
      }

      const total = results.reduce((s, r) => s + Math.abs(r.realizado), 0)
      const sorted = results
        .filter(r => r.realizado !== 0)
        .sort((a, b) => Math.abs(b.realizado) - Math.abs(a.realizado))

      return {
        tipo: 'breakdown',
        itens: sorted.map(r => ({
          label:            r.label,
          realizado:        r.realizado,
          budget:           r.budget,
          desvio_pct:       r.budget !== 0 ? ((r.realizado - r.budget) / Math.abs(r.budget)) * 100 : null,
          participacao_pct: total > 0 ? (Math.abs(r.realizado) / total) * 100 : 0,
        })),
      }
    }

    // ── Breakdown by centro de custo ──────────────────────────────────────────
    case 'breakdown_cc': {
      const linhas = await fetchDRELinhas(supabase)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'breakdown', itens: [] }

      const depts = scope.departamento_id ? [scope.departamento_id] : []
      const { data: ccRows } = await supabase
        .from('centros_custo')
        .select('centro_custo, nome_centro_custo')
        .in(depts.length ? 'departamento' : 'centro_custo',
            depts.length ? depts : scope.centros_custo ?? [])
      const centros = (ccRows ?? []) as Array<{ centro_custo: string; nome_centro_custo: string }>

      const results: Array<{ label: string; realizado: number; budget: number }> = []
      for (const cc of centros) {
        const scopeCC = { ...scope, centros_custo: [cc.centro_custo] }
        const rows = await fetchDREData(periodos, scopeCC, supabase)
        const gMap = aggregateDRE(rows)
        const comp = computeLine(linha, gMap, linhas, linha.ordem)
        if (comp.realizado !== 0 || comp.budget !== 0) {
          results.push({ label: cc.nome_centro_custo ?? cc.centro_custo, realizado: comp.realizado, budget: comp.budget })
        }
      }

      const total = results.reduce((s, r) => s + Math.abs(r.realizado), 0)
      const sorted = results.sort((a, b) => Math.abs(b.realizado) - Math.abs(a.realizado))

      return {
        tipo: 'breakdown',
        itens: sorted.map(r => ({
          label:            r.label,
          realizado:        r.realizado,
          budget:           r.budget,
          desvio_pct:       r.budget !== 0 ? ((r.realizado - r.budget) / Math.abs(r.budget)) * 100 : null,
          participacao_pct: total > 0 ? (Math.abs(r.realizado) / total) * 100 : 0,
        })),
      }
    }

    // ── Top-N ─────────────────────────────────────────────────────────────────
    case 'topN_grupo': {
      const rows = await fetchDREData(periodos, scope, supabase)
      // Group by CC within the requested grupo
      const { data: ccAll } = await supabase
        .from('lancamentos')
        .select('centro_custo, nome_conta_contabil')
        .limit(1)
      // Use the dre RPC grouped by CC — use run_star_query instead
      const dreRows = rows.filter(r => r.dre === metrica.grupo_nome)
      // Aggregate by centro_custo via direct query
      const { data: detailRows, error: detErr } = await supabase.rpc('get_dre', {
        p_periodos: periodos,
        p_departamentos: scope.departamento_id ? [scope.departamento_id] : [],
        p_centros: scope.centros_custo ?? [],
      })
      // Fall back to top-N by agrupamento_arvore within the grupo
      const byAgrup = new Map<string, number>()
      for (const r of (dreRows ?? [])) {
        const key = r.agrupamento_arvore || r.dre || 'Outros'
        byAgrup.set(key, (byAgrup.get(key) ?? 0) + (r.razao ?? 0))
      }
      let itens = [...byAgrup.entries()].map(([label, valor]) => ({ label, valor }))
      itens = metrica.ordem === 'desc'
        ? itens.sort((a, b) => b.valor - a.valor)
        : itens.sort((a, b) => a.valor - b.valor)
      itens = itens.slice(0, metrica.n)
      return { tipo: 'topN', itens, n: metrica.n, ordem: metrica.ordem }
    }

    // ── DRE completa ──────────────────────────────────────────────────────────
    case 'dre_completa': {
      const [rows, linhas] = await Promise.all([
        fetchDREData(periodos, scope, supabase),
        fetchDRELinhas(supabase),
      ])
      const grupoMap = aggregateDRE(rows)
      const dreLines = buildDreLines(linhas, grupoMap)
      return { tipo: 'dre', linhas: dreLines }
    }

    // ── DRE parcial ───────────────────────────────────────────────────────────
    case 'dre_parcial': {
      const [rows, linhas] = await Promise.all([
        fetchDREData(periodos, scope, supabase),
        fetchDRELinhas(supabase),
      ])
      const grupoMap = aggregateDRE(rows)
      const filterNames = metrica.linhas.length > 0 ? metrica.linhas : undefined
      const dreLines = buildDreLines(linhas, grupoMap, filterNames)
      return { tipo: 'dre', linhas: dreLines }
    }

    // ── Grupo DRE ─────────────────────────────────────────────────────────────
    case 'grupo_dre': {
      const rows = await fetchDREData(periodos, scope, supabase)
      const grupoMap = aggregateDRE(rows)
      const agg = grupoMap.get(metrica.grupo_nome)
      const realizado = agg?.razao  ?? 0
      const budget    = agg?.budget ?? 0
      const desvio    = realizado - budget
      return {
        tipo: 'escalar',
        valor: realizado,
        comparativo: budget || null,
        variacao_pct: budget !== 0 ? (desvio / Math.abs(budget)) * 100 : null,
      }
    }

    default:
      return { tipo: 'escalar', valor: 0, comparativo: null, variacao_pct: null }
  }
}
