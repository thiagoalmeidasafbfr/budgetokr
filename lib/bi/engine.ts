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
//
// Tabela centros de custo: `centros_custo`
//   campos: centro_custo (PK text), nome_centro_custo, departamento (text CODE),
//   nome_departamento (TEXT — readable name used by get_dre RPC), area, nome_area
//
// ⚠ IMPORTANT: get_dre RPC filters by cc.nome_departamento (NOT by cc.departamento).
//   Therefore scope.departamentos[] must contain nome_departamento values (e.g. 'Comercial'),
//   NOT the departamento code (e.g. 'COMERC').
//
// RPCs disponíveis:
//   get_dre(p_periodos, p_departamentos, p_centros) → DRERow[]
//     p_departamentos: cc.nome_departamento values
//   run_star_query(p_tipo, p_filters, p_logic, p_extra_filters, p_periodos, p_group_dept, p_group_period, p_group_cc)

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  WidgetConfig, BiScope, BiPeriodo, BiMetrica,
  BiQueryResult, DreLine, DreStructureLine,
} from './widget-types'
import { safePct } from '@/lib/utils'
import { getMedidaResultados } from '@/lib/query'
import type { FilterCondition } from '@/lib/types'

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
  if (p.tipo === 'lista') {
    return p.periodos.slice().sort()
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
  if (p.tipo === 'lista') {
    if (p.periodos.length === 0) return '—'
    const sorted = [...p.periodos].sort()
    if (sorted.length === 1) {
      const [y, m] = sorted[0].split('-').map(Number)
      return `${MES[m-1]} ${y}`
    }
    const [y1, m1] = sorted[0].split('-').map(Number)
    const [y2, m2] = sorted[sorted.length-1].split('-').map(Number)
    return `${MES[m1-1]}–${MES[m2-1]} ${y1 === y2 ? y1 : `${y1}/${y2}`}`
  }
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

// Resolve unidade names → distinct centro_custo codes (via lancamentos.id_cc_cc)
async function resolveUnidades(unidades: string[], supabase: SupabaseClient): Promise<string[]> {
  if (!unidades.length) return []
  const { data: unRows } = await supabase
    .from('unidades_negocio')
    .select('id_cc_cc')
    .in('unidade', unidades)
  const idCcCcs = (unRows ?? []).map((r: Record<string,unknown>) => r.id_cc_cc as string).filter(Boolean)
  if (!idCcCcs.length) return []
  const { data: lcRows } = await supabase
    .from('lancamentos')
    .select('centro_custo')
    .in('id_cc_cc', idCcCcs)
  return [...new Set((lcRows ?? []).map((r: Record<string,unknown>) => r.centro_custo as string).filter(Boolean))]
}

async function fetchDREData(
  periodos: string[],
  scope: BiScope,
  supabase: SupabaseClient
): Promise<DREAggRow[]> {
  // ⚠ get_dre RPC expects nome_departamento (readable name), NOT departamento code.
  const depts   = scope.departamentos ?? []   // must be nome_departamento values
  let   centros = scope.centros_custo  ?? []

  // Resolve unidades de negócio → extra centro_custo codes
  const unidades = scope.unidades ?? []
  if (unidades.length > 0) {
    const unCentros = await resolveUnidades(unidades, supabase)
    // Merge with explicit centros (union), remove duplicates
    centros = [...new Set([...centros, ...unCentros])]
  }

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

// ─── Compute a single DRE line ────────────────────────────────────────────────

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
  const [ccRes, linhasRes, medidasRes, periodosRes, unidadesRes] = await Promise.all([
    supabase.from('centros_custo')
      .select('centro_custo, nome_centro_custo, departamento, nome_departamento')
      .order('nome_departamento')
      .order('nome_centro_custo'),
    supabase.from('dre_linhas')
      .select('id, ordem, nome, tipo, sinal, formula_grupos, formula_sinais, negrito, separador')
      .order('ordem'),
    supabase.from('medidas')
      .select('id, nome, descricao, unidade, tipo_medida, cor')
      .order('nome'),
    // Distinct periods from lancamentos via RPC
    supabase.rpc('get_distinct_periodos'),
    // Distinct business units
    supabase.rpc('get_distinct_unidades'),
  ])

  if (ccRes.error)    throw new Error(ccRes.error.message)
  if (linhasRes.error) throw new Error(linhasRes.error.message)

  const rows = ccRes.data ?? []

  // Build unique departamentos using nome_departamento as the identifier
  // (get_dre RPC filters by cc.nome_departamento — NOT by cc.departamento code)
  const deptMap = new Map<string, string>()  // nome_departamento → nome_departamento
  for (const r of rows) {
    const nome = r.nome_departamento ?? r.departamento
    if (nome && !deptMap.has(nome)) {
      deptMap.set(nome, nome)
    }
  }

  // Derive available periods — RPC returns TABLE(periodo TEXT)
  let periodos: string[] = []
  if (!periodosRes.error && Array.isArray(periodosRes.data)) {
    periodos = (periodosRes.data as Array<{ periodo: string }>)
      .map(r => r.periodo)
      .filter(Boolean)
      .sort()
  }

  return {
    // id = nome_departamento (what get_dre expects in p_departamentos)
    departamentos: [...deptMap.keys()].map(nome => ({ id: nome, nome })).sort((a,b) => a.nome.localeCompare(b.nome)),
    centros_custo: rows.map((r: Record<string, unknown>) => ({
      id:              r.centro_custo as string,
      nome:            (r.nome_centro_custo ?? r.centro_custo) as string,
      departamento_id: (r.nome_departamento ?? r.departamento) as string, // use nome_departamento for cascade
    })),
    linhas_dre: (linhasRes.data ?? []).map((r: Record<string, unknown>) => ({
      ordem:     r.ordem as number,
      nome:      r.nome as string,
      tipo:      r.tipo as 'grupo' | 'subtotal' | 'calculada',
      sinal:     r.sinal as number,
      negrito:   r.negrito === 1,
      separador: r.separador === 1,
    })) as DreStructureLine[],
    medidas: (medidasRes.data ?? []).map((r: Record<string, unknown>) => ({
      id:          r.id as number,
      nome:        r.nome as string,
      descricao:   (r.descricao ?? '') as string,
      unidade:     (r.unidade ?? '') as string,
      tipo_medida: (r.tipo_medida ?? 'simples') as string,
      cor:         (r.cor ?? '#6366f1') as string,
    })),
    periodos,
    unidades: (!unidadesRes.error && Array.isArray(unidadesRes.data))
      ? (unidadesRes.data as Array<{ unidade: string }>)
          .map(r => r.unidade)
          .filter(Boolean)
          .sort()
      : [],
  }
}

// ─── runBiQuery — main entry point ────────────────────────────────────────────

export async function runBiQuery(
  widgetConfig: WidgetConfig,
  supabase: SupabaseClient
): Promise<BiQueryResult> {
  const scope    = widgetConfig.scope
  const metrica  = widgetConfig.metrica
  const periodos = periodosFromBiPeriodo(scope.periodo)

  switch (metrica.tipo) {

    case 'linha_dre': {
      const depts   = scope.departamentos ?? []
      const centros = scope.centros_custo ?? []

      // Non-KPI visuals with dept/CC scope → return breakdown per CC
      if (widgetConfig.visual !== 'kpi_card' && (depts.length > 0 || centros.length > 0)) {
        const linhas = await fetchDRELinhas(supabase)
        const linha  = linhas.find(l => l.nome === metrica.linha_nome)
        if (!linha) return { tipo: 'breakdown', itens: [] }

        // Build CC list from explicit selection or from depts
        let ccList: Array<{ id: string; nome: string }> = []
        if (centros.length > 0) {
          const { data } = await supabase.from('centros_custo')
            .select('centro_custo, nome_centro_custo').in('centro_custo', centros)
          ccList = (data ?? []).map((r: Record<string,unknown>) => ({
            id: r.centro_custo as string, nome: (r.nome_centro_custo ?? r.centro_custo) as string,
          }))
        } else {
          const { data } = await supabase.from('centros_custo')
            .select('centro_custo, nome_centro_custo').in('nome_departamento', depts)
          ccList = (data ?? []).map((r: Record<string,unknown>) => ({
            id: r.centro_custo as string, nome: (r.nome_centro_custo ?? r.centro_custo) as string,
          }))
        }

        const results: Array<{ label: string; realizado: number; budget: number }> = []
        for (const cc of ccList) {
          const scopeCC: BiScope = { ...scope, departamentos: [], centros_custo: [cc.id] }
          const rows = await fetchDREData(periodos, scopeCC, supabase)
          const gMap = aggregateDRE(rows)
          const comp = computeLine(linha, gMap, linhas, linha.ordem)
          if (comp.realizado !== 0 || comp.budget !== 0) {
            results.push({ label: cc.nome, realizado: comp.realizado, budget: comp.budget })
          }
        }

        const total  = results.reduce((s, r) => s + Math.abs(r.realizado), 0)
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

      // Scalar path (kpi_card or no scope restriction)
      const [rows, linhas] = await Promise.all([
        fetchDREData(periodos, scope, supabase),
        fetchDRELinhas(supabase),
      ])
      const grupoMap = aggregateDRE(rows)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'escalar', valor: 0, comparativo: null, variacao_pct: null }

      const comp = computeLine(linha, grupoMap, linhas, linha.ordem)
      let comparativo: number | null = null

      if (scope.comparativo) {
        const prevRows = await fetchDREData(
          prevPeriodo(scope.periodo, scope.comparativo === 'budget' ? 'mes_anterior' : scope.comparativo),
          scope, supabase
        )
        if (scope.comparativo === 'budget') {
          comparativo = comp.budget
        } else {
          const prevMap = aggregateDRE(prevRows)
          comparativo = computeLine(linha, prevMap, linhas, linha.ordem).realizado
        }
      }

      return {
        tipo: 'escalar',
        valor: comp.realizado,
        comparativo,
        variacao_pct: comparativo != null && comparativo !== 0
          ? ((comp.realizado - comparativo) / Math.abs(comparativo)) * 100 : null,
      }
    }

    case 'serie_temporal': {
      const [rows, linhas] = await Promise.all([
        fetchDREData(periodos, scope, supabase),
        fetchDRELinhas(supabase),
      ])
      const grupoMap = aggregateDRE(rows)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'serie', pontos: [] }

      const comp = computeLine(linha, grupoMap, linhas, linha.ordem)
      return {
        tipo: 'serie',
        pontos: periodos.map(p => ({
          periodo:   p,
          realizado: comp.byPeriod[p]?.razao  ?? 0,
          budget:    comp.byPeriod[p]?.budget ?? null,
        })),
      }
    }

    case 'breakdown_dpto': {
      const linhas = await fetchDRELinhas(supabase)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'breakdown', itens: [] }

      // Get all unique nome_departamento values
      const { data: ccRows } = await supabase
        .from('centros_custo')
        .select('nome_departamento')
      const allNomes = [...new Set((ccRows ?? []).map((r: Record<string,unknown>) => r.nome_departamento as string).filter(Boolean))]

      // Restrict to scope if depts selected
      const nomes = (scope.departamentos?.length ?? 0) > 0
        ? allNomes.filter(n => scope.departamentos!.includes(n))
        : allNomes

      const results: Array<{ label: string; realizado: number; budget: number }> = []
      for (const nome of nomes) {
        const scopeDept: BiScope = { ...scope, departamentos: [nome], centros_custo: [] }
        const rows = await fetchDREData(periodos, scopeDept, supabase)
        const gMap = aggregateDRE(rows)
        const comp = computeLine(linha, gMap, linhas, linha.ordem)
        results.push({ label: nome, realizado: comp.realizado, budget: comp.budget })
      }

      const total = results.reduce((s, r) => s + Math.abs(r.realizado), 0)
      const sorted = results.filter(r => r.realizado !== 0).sort((a, b) => Math.abs(b.realizado) - Math.abs(a.realizado))

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

    case 'breakdown_cc': {
      const linhas = await fetchDRELinhas(supabase)
      const linha = linhas.find(l => l.nome === metrica.linha_nome)
      if (!linha) return { tipo: 'breakdown', itens: [] }

      // Filter CCs by nome_departamento (what scope.departamentos contains)
      const depts = scope.departamentos ?? []
      let ccQuery = supabase.from('centros_custo').select('centro_custo, nome_centro_custo')
      if (depts.length > 0) {
        ccQuery = ccQuery.in('nome_departamento', depts)   // ← fixed: was 'departamento'
      } else if ((scope.centros_custo ?? []).length > 0) {
        ccQuery = ccQuery.in('centro_custo', scope.centros_custo!)
      }
      const { data: ccRows } = await ccQuery
      const centros = (ccRows ?? []) as Array<{ centro_custo: string; nome_centro_custo: string }>

      const results: Array<{ label: string; realizado: number; budget: number }> = []
      for (const cc of centros) {
        const scopeCC: BiScope = { ...scope, departamentos: [], centros_custo: [cc.centro_custo] }
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

    case 'topN_grupo': {
      const rows = await fetchDREData(periodos, scope, supabase)
      const dreRows = rows.filter(r => r.dre === metrica.grupo_nome)
      const byAgrup = new Map<string, number>()
      for (const r of dreRows) {
        const key = r.agrupamento_arvore || r.dre || 'Outros'
        byAgrup.set(key, (byAgrup.get(key) ?? 0) + (r.razao ?? 0))
      }
      let itens = [...byAgrup.entries()].map(([label, valor]) => ({ label, valor }))
      itens = metrica.ordem === 'desc'
        ? itens.sort((a, b) => b.valor - a.valor)
        : itens.sort((a, b) => a.valor - b.valor)
      return { tipo: 'topN', itens: itens.slice(0, metrica.n), n: metrica.n, ordem: metrica.ordem }
    }

    case 'dre_completa': {
      const [rows, linhas] = await Promise.all([fetchDREData(periodos, scope, supabase), fetchDRELinhas(supabase)])
      return { tipo: 'dre', linhas: buildDreLines(linhas, aggregateDRE(rows)) }
    }

    case 'dre_parcial': {
      const [rows, linhas] = await Promise.all([fetchDREData(periodos, scope, supabase), fetchDRELinhas(supabase)])
      const filterNames = metrica.linhas.length > 0 ? metrica.linhas : undefined
      return { tipo: 'dre', linhas: buildDreLines(linhas, aggregateDRE(rows), filterNames) }
    }

    case 'grupo_dre': {
      const depts   = scope.departamentos ?? []
      const centros = scope.centros_custo ?? []

      // Non-KPI visuals with dept/CC scope → return breakdown per CC
      if (widgetConfig.visual !== 'kpi_card' && (depts.length > 0 || centros.length > 0)) {
        let ccList: Array<{ id: string; nome: string }> = []
        if (centros.length > 0) {
          const { data } = await supabase.from('centros_custo')
            .select('centro_custo, nome_centro_custo').in('centro_custo', centros)
          ccList = (data ?? []).map((r: Record<string,unknown>) => ({
            id: r.centro_custo as string, nome: (r.nome_centro_custo ?? r.centro_custo) as string,
          }))
        } else {
          const { data } = await supabase.from('centros_custo')
            .select('centro_custo, nome_centro_custo').in('nome_departamento', depts)
          ccList = (data ?? []).map((r: Record<string,unknown>) => ({
            id: r.centro_custo as string, nome: (r.nome_centro_custo ?? r.centro_custo) as string,
          }))
        }

        const results: Array<{ label: string; realizado: number; budget: number }> = []
        for (const cc of ccList) {
          const scopeCC: BiScope = { ...scope, departamentos: [], centros_custo: [cc.id] }
          const rows = await fetchDREData(periodos, scopeCC, supabase)
          const agg  = aggregateDRE(rows).get(metrica.grupo_nome)
          const realizado = (agg?.razao  ?? 0)
          const budget    = (agg?.budget ?? 0)
          if (realizado !== 0 || budget !== 0) {
            results.push({ label: cc.nome, realizado, budget })
          }
        }

        const total  = results.reduce((s, r) => s + Math.abs(r.realizado), 0)
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

      // Scalar path
      const rows = await fetchDREData(periodos, scope, supabase)
      const agg = aggregateDRE(rows).get(metrica.grupo_nome)
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

    // ── Medida criada ─────────────────────────────────────────────────────────
    case 'medida': {
      const depts    = scope.departamentos ?? []
      const unidades = scope.unidades ?? []
      // Resolve unidades → extra centros first, then merge
      const unCentros = unidades.length > 0 ? await resolveUnidades(unidades, supabase) : []
      const centros   = [...new Set([...(scope.centros_custo ?? []), ...unCentros])]

      // Scope restriction filters — use correct FilterCondition shape
      const extraFiltros: FilterCondition[] = []
      if (depts.length > 0) {
        extraFiltros.push({ column: 'nome_departamento', operator: 'in', value: depts.join(',') })
      }
      if (centros.length > 0) {
        extraFiltros.push({ column: 'centro_custo', operator: 'in', value: centros.join(',') })
      }

      // ── KPI card: aggregate into single scalar ────────────────────────────
      if (widgetConfig.visual === 'kpi_card') {
        const results = await getMedidaResultados(metrica.medida_id, {
          groupByDept: false, groupByPeriod: false, groupByCentroCusto: false,
          periodos, extraFiltros,
        })
        let totalRazao = 0, totalBudget = 0
        for (const r of results) { totalRazao += r.razao ?? 0; totalBudget += r.budget ?? 0 }
        const dev = totalRazao - totalBudget
        return {
          tipo: 'escalar',
          valor:        totalRazao,
          comparativo:  totalBudget || null,
          variacao_pct: totalBudget !== 0 ? (dev / Math.abs(totalBudget)) * 100 : null,
        }
      }

      // ── Table / chart visuals: return breakdown ───────────────────────────
      // Group by CC when depts or CCs are scoped (show per-CC detail).
      // Group by dept when no scope restriction (show company-wide view by dept).
      // NB: for ratio medidas, getMedidaResultados sums numerators and denominators
      //     across periods before dividing — so the ratio is always correct even when
      //     groupByPeriod=false spans multiple months.
      const groupByCc = depts.length > 0 || centros.length > 0
      const results = await getMedidaResultados(metrica.medida_id, {
        groupByDept:        !groupByCc,
        groupByPeriod:      false,
        groupByCentroCusto: groupByCc,
        periodos,
        extraFiltros,
      })

      if (results.length === 0) {
        return { tipo: 'breakdown', itens: [] }
      }

      const itens = results
        .filter(r => (r.razao ?? 0) !== 0 || (r.budget ?? 0) !== 0)
        .map(r => ({
          label: groupByCc
            ? (r.nome_centro_custo || r.centro_custo || r.nome_departamento || r.departamento || '—')
            : (r.nome_departamento || r.departamento || '—'),
          realizado:        r.razao   ?? 0,
          budget:           r.budget  ?? 0,
          desvio_pct:       r.variacao_pct ?? null,
          participacao_pct: 0,  // not meaningful for ratio medidas
        }))
        .sort((a, b) => Math.abs(b.realizado) - Math.abs(a.realizado))

      return { tipo: 'breakdown', itens }
    }

    default:
      return { tipo: 'escalar', valor: 0, comparativo: null, variacao_pct: null }
  }
}
