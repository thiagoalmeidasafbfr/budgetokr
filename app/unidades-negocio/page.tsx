'use client'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { ChevronRight, ChevronDown, Filter, X, Download, RefreshCw, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import { YearFilter } from '@/components/YearFilter'
import type { ContextMenuState } from '@/components/DreDetalhamentoModal'
import type { TreeNode } from '@/lib/dre-utils'

const DetalhamentoModal = dynamic(() => import('@/components/DreDetalhamentoModal'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface DreRow {
  unidade: string
  dre: string
  ordem_dre: number
  agrupamento_arvore: string
  numero_conta_contabil: string
  nome_conta_contabil: string
  periodo: string
  budget: number
  razao: number
}

interface PeriodoVal { budget: number; razao: number; variacao: number }

interface ContaNode {
  numero: string
  nome: string
  budget: number; razao: number; variacao: number; variacao_pct: number
  periodos: Record<string, PeriodoVal>
}
interface AgrupNode {
  agrupamento: string
  budget: number; razao: number; variacao: number; variacao_pct: number
  periodos: Record<string, PeriodoVal>
  contas: ContaNode[]
}
interface DreNode {
  dre: string
  ordemDre: number
  budget: number; razao: number; variacao: number; variacao_pct: number
  periodos: Record<string, PeriodoVal>
  agrupamentos: AgrupNode[]
}
interface UnidadeNode {
  unidade: string
  budget: number; razao: number; variacao: number; variacao_pct: number
  periodos: Record<string, PeriodoVal>
  dre_groups: DreNode[]
}

type ViewMode = 'total' | 'periodo'

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(data: DreRow[], dreLineOrder: Map<string, number>): UnidadeNode[] {
  const unMap = new Map<string, UnidadeNode>()

  for (const r of data) {
    if (!unMap.has(r.unidade)) {
      unMap.set(r.unidade, { unidade: r.unidade, budget: 0, razao: 0, variacao: 0, variacao_pct: 0, periodos: {}, dre_groups: [] })
    }
    const un = unMap.get(r.unidade)!

    let dreNode = un.dre_groups.find(d => d.dre === r.dre)
    if (!dreNode) {
      dreNode = { dre: r.dre, ordemDre: r.ordem_dre ?? 999, budget: 0, razao: 0, variacao: 0, variacao_pct: 0, periodos: {}, agrupamentos: [] }
      un.dre_groups.push(dreNode)
    }

    let ag = dreNode.agrupamentos.find(a => a.agrupamento === r.agrupamento_arvore)
    if (!ag) {
      ag = { agrupamento: r.agrupamento_arvore, budget: 0, razao: 0, variacao: 0, variacao_pct: 0, periodos: {}, contas: [] }
      dreNode.agrupamentos.push(ag)
    }

    let conta = ag.contas.find(c => c.numero === r.numero_conta_contabil)
    if (!conta) {
      conta = { numero: r.numero_conta_contabil, nome: r.nome_conta_contabil, budget: 0, razao: 0, variacao: 0, variacao_pct: 0, periodos: {} }
      ag.contas.push(conta)
    }

    conta.budget += r.budget
    conta.razao  += r.razao
    if (r.periodo) {
      if (!conta.periodos[r.periodo]) conta.periodos[r.periodo] = { budget: 0, razao: 0, variacao: 0 }
      conta.periodos[r.periodo].budget += r.budget
      conta.periodos[r.periodo].razao  += r.razao
    }
  }

  const addPeriodo = (target: Record<string, PeriodoVal>, src: Record<string, PeriodoVal>) => {
    for (const [p, pv] of Object.entries(src)) {
      if (!target[p]) target[p] = { budget: 0, razao: 0, variacao: 0 }
      target[p].budget += pv.budget
      target[p].razao  += pv.razao
    }
  }
  const calcVariance = (n: { budget: number; razao: number; variacao: number; variacao_pct: number; periodos: Record<string, PeriodoVal> }) => {
    n.variacao     = n.razao - n.budget
    n.variacao_pct = n.budget ? n.variacao / Math.abs(n.budget) * 100 : 0
    for (const pv of Object.values(n.periodos)) pv.variacao = pv.razao - pv.budget
  }

  for (const un of unMap.values()) {
    // Sort DRE groups using dre_linhas order (same as DRE page), fallback to ordem_dre
    un.dre_groups.sort((a, b) => {
      const oa = dreLineOrder.get(a.dre) ?? (a.ordemDre * 1000)
      const ob = dreLineOrder.get(b.dre) ?? (b.ordemDre * 1000)
      return oa - ob || a.dre.localeCompare(b.dre)
    })

    for (const dreNode of un.dre_groups) {
      // Sort agrupamentos alphabetically within each DRE
      dreNode.agrupamentos.sort((a, b) => a.agrupamento.localeCompare(b.agrupamento))

      for (const ag of dreNode.agrupamentos) {
        // Sort contas by numero
        ag.contas.sort((a, b) => a.numero.localeCompare(b.numero))

        for (const conta of ag.contas) {
          calcVariance(conta)
          ag.budget += conta.budget
          ag.razao  += conta.razao
          addPeriodo(ag.periodos, conta.periodos)
        }
        calcVariance(ag)
        dreNode.budget += ag.budget
        dreNode.razao  += ag.razao
        addPeriodo(dreNode.periodos, ag.periodos)
      }
      calcVariance(dreNode)
      un.budget += dreNode.budget
      un.razao  += dreNode.razao
      addPeriodo(un.periodos, dreNode.periodos)
    }
    calcVariance(un)
  }

  return [...unMap.values()].sort((a, b) => a.unidade.localeCompare(b.unidade))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UnidadesNegocioPage() {
  const [data,          setData]          = useState<DreRow[]>([])
  const [unidades,      setUnidades]      = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [selUnidades,   setSelUnidades]   = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  const [selYear,       setSelYear]       = useState<string | null>(null)
  const [viewMode,      setViewMode]      = useState<ViewMode>('total')
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const [loading,       setLoading]       = useState(false)
  const [dreLineOrder,  setDreLineOrder]  = useState<Map<string, number>>(new Map())
  const [ctxMenu,       setCtxMenu]       = useState<ContextMenuState | null>(null)
  const [detModal,      setDetModal]      = useState<ContextMenuState | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (uns: string[], pers: string[]) => {
    setLoading(true)
    const params = new URLSearchParams({ type: 'dre' })
    if (uns.length)  params.set('unidades', uns.join(','))
    if (pers.length) params.set('periodos',  pers.join(','))
    const res  = await fetch(`/api/unidades-negocio?${params}`)
    const rows = res.ok ? await res.json() : []
    setData(Array.isArray(rows) ? rows : [])
    setLoading(false)
  }, [])

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const handler = () => setCtxMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [ctxMenu])

  useEffect(() => {
    async function init() {
      // Use dedicated lightweight RPCs (few rows each) to populate sidebar filters
      const [unRes, perRes, linhasRes] = await Promise.all([
        fetch('/api/unidades-negocio?type=distinct_unidades'),
        fetch('/api/unidades-negocio?type=distinct_periodos'),
        fetch('/api/dre?type=linhas'),
      ])
      const uns    = unRes.ok    ? await unRes.json()    : []
      const pers   = perRes.ok   ? await perRes.json()   : []
      const linhas = linhasRes.ok ? await linhasRes.json() : []
      const allUnidades = Array.isArray(uns)  ? (uns  as string[]).filter(Boolean) : []
      const allPeriodos = Array.isArray(pers) ? (pers as string[]).filter(Boolean) : []
      setUnidades(allUnidades)
      setPeriodos(allPeriodos)

      // Build DRE line order map (tipo=grupo, ordem from dre_linhas)
      const orderMap = new Map<string, number>()
      for (const l of (linhas as Array<{ nome: string; tipo: string; ordem: number }>)) {
        if (l.tipo === 'grupo') orderMap.set(l.nome, l.ordem)
      }
      setDreLineOrder(orderMap)

      // Auto-select current year YTD so initial tree load is filtered (avoids row limit)
      const now      = new Date()
      const prev     = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const curYear  = String(now.getFullYear())
      const curMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
      const ytd      = allPeriodos.filter(p => p.startsWith(curYear) && p <= curMonth)
      const defaultPeriods = ytd.length > 0
        ? ytd
        : allPeriodos.filter(p => p.startsWith(curYear))
      setSelYear(curYear)
      setSelPeriods(defaultPeriods)
    }
    init()
  }, [])

  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    load(selUnidades, selPeriods)
  }, [selUnidades, selPeriods, load])

  const handleYearChange = (year: string | null) => {
    setSelYear(year)
    if (!year) { setSelPeriods([]); return }
    const now      = new Date()
    const prev     = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const curMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    const ytd = periodos.filter(p => p.startsWith(year) && p <= curMonth)
    setSelPeriods(ytd.length > 0 ? ytd : periodos.filter(p => p.startsWith(year)))
  }

  const filteredPeriods = selYear ? periodos.filter(p => p.startsWith(selYear)) : periodos
  const tree            = useMemo(() => buildTree(data, dreLineOrder), [data, dreLineOrder])
  const dataPeriods     = useMemo(() => [...new Set(data.map(r => r.periodo).filter(Boolean))].sort(), [data])

  const totals = useMemo(() => tree.reduce(
    (acc, u) => ({ budget: acc.budget + u.budget, razao: acc.razao + u.razao, variacao: acc.variacao + u.variacao }),
    { budget: 0, razao: 0, variacao: 0 }
  ), [tree])
  const totalPct = totals.budget ? totals.variacao / Math.abs(totals.budget) * 100 : 0

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const openCtxMenu = (
    e: React.MouseEvent,
    name: string,
    unidade: string,
    dre?: string,
    agrupamento?: string,
    conta?: string,
    tipo: 'budget' | 'razao' | 'ambos' = 'ambos',
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const node = {
      name, dre, agrupamento, conta,
      isGroup: false, depth: 0, ordem: 0,
      budget: 0, razao: 0, variacao: 0, variacao_pct: 0,
      children: [], byPeriod: {},
    } as TreeNode
    setCtxMenu({
      x: e.clientX, y: e.clientY, node, tipo,
      periodos:  selPeriods.length ? selPeriods : undefined,
      unidades:  [unidade],
    })
  }

  const expandAll = () => {
    const keys = new Set<string>()
    for (const un of tree) {
      keys.add(un.unidade)
      for (const d of un.dre_groups) {
        keys.add(`${un.unidade}::${d.dre}`)
        for (const ag of d.agrupamentos) keys.add(`${un.unidade}::${d.dre}::${ag.agrupamento}`)
      }
    }
    setExpanded(keys)
  }

  const exportCSV = () => {
    const rows: string[][] = [['Unidade', 'DRE', 'Agrupamento', 'Conta', 'Budget', 'Razão', 'Variação', '%']]
    for (const un of tree) {
      for (const dre of un.dre_groups) {
        for (const ag of dre.agrupamentos) {
          for (const ct of ag.contas) {
            rows.push([un.unidade, dre.dre, ag.agrupamento, `${ct.numero} — ${ct.nome}`,
              String(ct.budget), String(ct.razao), String(ct.variacao), ct.variacao_pct.toFixed(2)])
          }
        }
      }
    }
    const csv  = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `unidades-negocio-${Date.now()}.csv`; a.click()
  }

  // ── Value cell components ─────────────────────────────────────────────────
  const TotalCells = ({
    n, bold, onCtx,
  }: {
    n: { budget: number; razao: number; variacao: number; variacao_pct: number }
    bold?: boolean
    onCtx?: (tipo: 'budget' | 'razao' | 'ambos') => (e: React.MouseEvent) => void
  }) => (
    <>
      <td
        className={cn('px-5 py-2.5 text-right tabular-nums', bold ? 'font-semibold text-gray-800' : 'text-gray-600')}
        onContextMenu={onCtx?.('budget')}
      >
        {n.budget !== 0 ? formatCurrency(n.budget) : <span className="text-gray-300">—</span>}
      </td>
      <td
        className={cn('px-5 py-2.5 text-right tabular-nums', bold ? 'font-semibold text-gray-800' : 'text-gray-600')}
        onContextMenu={onCtx?.('razao')}
      >
        {n.razao !== 0 ? formatCurrency(n.razao) : <span className="text-gray-300">—</span>}
      </td>
      <td className={cn('px-5 py-2.5 text-right tabular-nums', bold ? 'font-semibold' : '', n.variacao !== 0 ? colorForVariance(n.variacao_pct) : 'text-gray-300')}>
        {n.variacao !== 0 ? formatCurrency(n.variacao) : '—'}
      </td>
      <td className="px-5 py-2.5 text-right">
        {n.budget !== 0 && n.variacao !== 0
          ? <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', bgColorForVariance(n.variacao_pct))}>{formatPct(n.variacao_pct)}</span>
          : null}
      </td>
    </>
  )

  const PeriodCells = ({ periodos: nodePeriods }: { periodos: Record<string, PeriodoVal> }) => (
    <>
      {dataPeriods.map(p => {
        const pv  = nodePeriods[p]
        const pct = pv?.budget ? pv.variacao / Math.abs(pv.budget) * 100 : 0
        return (
          <td key={p} className={cn('px-3 py-2.5 text-right tabular-nums text-xs',
            pv?.variacao ? colorForVariance(pct) : 'text-gray-300')}>
            {pv?.variacao ? formatCurrency(pv.variacao) : '—'}
          </td>
        )
      })}
    </>
  )

  const isTotalView = viewMode === 'total'

  return (
    <div className="space-y-4">
      {/* Context menu (botão direito) */}
      {ctxMenu && (
        <div ref={ctxRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}>
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
            onClick={() => { setDetModal(ctxMenu); setCtxMenu(null) }}>
            <ExternalLink size={13} /> Abrir detalhamento
          </button>
        </div>
      )}

      {/* Modal de detalhamento */}
      {detModal && (
        <DetalhamentoModal
          ctx={detModal}
          onClose={() => setDetModal(null)}
          endpoint="/api/unidades-negocio/detalhamento"
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Por Unidade de Negócio</h1>
          <p className="text-gray-500 text-sm mt-0.5">Budget vs Realizado · Expansível por DRE → Agrupamento → Conta · Clique direito para detalhamento</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(selUnidades, selPeriods)}>
            <RefreshCw size={13} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={tree.length === 0}>
            <Download size={13} /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div className="w-52 flex-shrink-0 space-y-3">

          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ano</p>
              <YearFilter periodos={periodos} selYear={selYear} onChange={handleYearChange} />
            </CardContent>
          </Card>

          {unidades.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <Filter size={11} /> Unidades
                </p>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {unidades.map(u => (
                    <label key={u} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selUnidades.includes(u)}
                        onChange={e => setSelUnidades(prev => e.target.checked ? [...prev, u] : prev.filter(x => x !== u))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600 truncate" title={u}>{u}</span>
                    </label>
                  ))}
                </div>
                {selUnidades.length > 0 && (
                  <button onClick={() => setSelUnidades([])}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1">
                    <X size={10} /> Limpar
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {filteredPeriods.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Períodos</p>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {filteredPeriods.map(p => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selPeriods.includes(p)}
                        onChange={e => setSelPeriods(prev => e.target.checked ? [...prev, p] : prev.filter(x => x !== p))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600">{formatPeriodo(p)}</span>
                    </label>
                  ))}
                </div>
                {selPeriods.length > 0 && (
                  <button onClick={() => setSelPeriods([])}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1">
                    <X size={10} /> Limpar
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visualização</p>
              <div className="flex flex-col gap-1">
                {(['total', 'periodo'] as const).map(m => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors text-left',
                      viewMode === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400')}>
                    {m === 'total' ? 'Consolidado' : 'Por Período'}
                  </button>
                ))}
              </div>
              <div className="border-t pt-2 flex flex-col gap-1">
                <button onClick={expandAll} className="text-xs text-indigo-600 hover:text-indigo-800 text-left px-1">Expandir todos</button>
                <button onClick={() => setExpanded(new Set())} className="text-xs text-indigo-600 hover:text-indigo-800 text-left px-1">Recolher todos</button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Main table ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-[60vh]">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-400">Nenhum dado encontrado. Importe lançamentos com <strong>ID CC-CC</strong> preenchido e cadastre as Unidades de Negócio.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-5 py-3 font-medium" style={{ minWidth: 280 }}>Unidade / DRE / Agrupamento / Conta</th>
                      {isTotalView ? (
                        <>
                          <th className="text-right px-5 py-3 font-medium w-36">Vlr. Orçado</th>
                          <th className="text-right px-5 py-3 font-medium w-36">Vlr. Realizado</th>
                          <th className="text-right px-5 py-3 font-medium w-36">Variação</th>
                          <th className="text-right px-5 py-3 font-medium w-20">%</th>
                        </>
                      ) : dataPeriods.map(p => (
                        <th key={p} className="text-right px-3 py-3 font-medium w-28 whitespace-nowrap">{formatPeriodo(p)}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {tree.map(un => {
                      const unKey      = un.unidade
                      const unExpanded = expanded.has(unKey)
                      return (
                        <React.Fragment key={unKey}>
                          {/* Level 1: Unidade */}
                          <tr className="border-b bg-gray-100/70 hover:bg-gray-100 cursor-pointer cursor-context-menu"
                            onClick={() => toggle(unKey)}
                            onContextMenu={e => openCtxMenu(e, un.unidade, un.unidade)}>
                            <td className="px-5 py-2.5 font-bold text-gray-900">
                              <div className="flex items-center gap-1.5">
                                <span className="flex-shrink-0">
                                  {unExpanded ? <ChevronDown size={15} className="text-gray-600" /> : <ChevronRight size={15} className="text-gray-600" />}
                                </span>
                                {un.unidade || <span className="italic text-gray-400">sem unidade</span>}
                              </div>
                            </td>
                            {isTotalView ? <TotalCells n={un} bold onCtx={tipo => e => { e.stopPropagation(); openCtxMenu(e, un.unidade, un.unidade, undefined, undefined, undefined, tipo) }} /> : <PeriodCells periodos={un.periodos} />}
                          </tr>

                          {unExpanded && un.dre_groups.map(dreNode => {
                            const dreKey     = `${unKey}::${dreNode.dre}`
                            const dreExpanded = expanded.has(dreKey)
                            return (
                              <React.Fragment key={dreKey}>
                                {/* Level 2: DRE */}
                                <tr className="border-b border-gray-100 bg-gray-50/50 hover:bg-gray-50 cursor-pointer cursor-context-menu"
                                  onClick={() => toggle(dreKey)}
                                  onContextMenu={e => openCtxMenu(e, dreNode.dre, un.unidade, dreNode.dre)}>
                                  <td className="py-2 font-semibold text-gray-800" style={{ paddingLeft: 40 }}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="flex-shrink-0">
                                        {dreExpanded ? <ChevronDown size={13} className="text-gray-500" /> : <ChevronRight size={13} className="text-gray-500" />}
                                      </span>
                                      {dreNode.dre}
                                    </div>
                                  </td>
                                    {isTotalView ? <TotalCells n={dreNode} onCtx={tipo => e => { e.stopPropagation(); openCtxMenu(e, dreNode.dre, un.unidade, dreNode.dre, undefined, undefined, tipo) }} /> : <PeriodCells periodos={dreNode.periodos} />}
                                </tr>

                                {dreExpanded && dreNode.agrupamentos.map(ag => {
                                  const agKey      = `${dreKey}::${ag.agrupamento}`
                                  const agExpanded = expanded.has(agKey)
                                  return (
                                    <React.Fragment key={agKey}>
                                      {/* Level 3: Agrupamento */}
                                      <tr className="border-b border-gray-50 hover:bg-indigo-50/20 cursor-pointer cursor-context-menu"
                                        onClick={() => toggle(agKey)}
                                        onContextMenu={e => openCtxMenu(e, ag.agrupamento, un.unidade, dreNode.dre, ag.agrupamento)}>
                                        <td className="py-2 font-medium text-gray-600 text-xs" style={{ paddingLeft: 64 }}>
                                          <div className="flex items-center gap-1.5">
                                            <span className="flex-shrink-0">
                                              {agExpanded ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />}
                                            </span>
                                            {ag.agrupamento}
                                          </div>
                                        </td>
                                        {isTotalView ? <TotalCells n={ag} onCtx={tipo => e => { e.stopPropagation(); openCtxMenu(e, ag.agrupamento, un.unidade, dreNode.dre, ag.agrupamento, undefined, tipo) }} /> : <PeriodCells periodos={ag.periodos} />}
                                      </tr>

                                      {/* Level 4: Conta contábil */}
                                      {agExpanded && ag.contas.map(ct => (
                                        <tr key={`${agKey}::${ct.numero}`}
                                          className="border-b border-gray-50/60 hover:bg-indigo-50/30 cursor-context-menu"
                                          onContextMenu={e => openCtxMenu(e, ct.nome, un.unidade, dreNode.dre, ag.agrupamento, ct.numero)}>
                                          <td className="py-1.5 text-gray-400 text-xs" style={{ paddingLeft: 88 }}>
                                            <span className="pl-2 border-l-2 border-indigo-100">
                                              <span className="text-gray-500 font-mono mr-1.5">{ct.numero}</span>
                                              {ct.nome}
                                            </span>
                                          </td>
                                          {isTotalView ? <TotalCells n={ct} onCtx={tipo => e => { e.stopPropagation(); openCtxMenu(e, ct.nome, un.unidade, dreNode.dre, ag.agrupamento, ct.numero, tipo) }} /> : <PeriodCells periodos={ct.periodos} />}
                                        </tr>
                                      ))}
                                    </React.Fragment>
                                  )
                                })}
                              </React.Fragment>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-gray-800 text-white font-bold">
                      <td className="px-5 py-3">Total Geral</td>
                      {isTotalView ? (
                        <>
                          <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.budget)}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totals.razao)}</td>
                          <td className={cn('px-5 py-3 text-right tabular-nums', totals.variacao >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                            {formatCurrency(totals.variacao)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {totals.budget !== 0 && (
                              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                                totals.variacao >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}>
                                {formatPct(totalPct)}
                              </span>
                            )}
                          </td>
                        </>
                      ) : dataPeriods.map(p => {
                        const pv  = tree.reduce((acc, un) => {
                          const pp = un.periodos[p]
                          return pp ? { budget: acc.budget + pp.budget, razao: acc.razao + pp.razao, variacao: acc.variacao + pp.variacao } : acc
                        }, { budget: 0, razao: 0, variacao: 0 })
                        return (
                          <td key={p} className={cn('px-3 py-3 text-right tabular-nums text-xs',
                            pv.variacao > 0 ? 'text-emerald-300' : pv.variacao < 0 ? 'text-red-300' : 'text-gray-400')}>
                            {pv.variacao ? formatCurrency(pv.variacao) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
