'use client'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { formatCurrency, formatPct, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import { buildTreeFromLinhas, flattenTree } from '@/lib/dre-utils'
import type { DRERow, DREAccountRow, TreeNode, DRELinha } from '@/lib/dre-utils'
import dynamic from 'next/dynamic'
import type { ContextMenuState } from '@/components/DreDetalhamentoModal'
import type { PorUnidadeRow } from '@/lib/query'

const DetalhamentoModal = dynamic(() => import('@/components/DreDetalhamentoModal'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

interface Hierarchy { agrupamento_arvore: string; dre: string; ordem_dre: number }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PorUnidadePage() {
  const [rawData,     setRawData]     = useState<PorUnidadeRow[]>([])
  const [dreLinhas,   setDreLinhas]   = useState<DRELinha[]>([])
  const [hierarchy,   setHierarchy]   = useState<Hierarchy[]>([])
  const [unidades,    setUnidades]    = useState<string[]>([])
  const [periodos,    setPeriodos]    = useState<string[]>([])
  const [selUnidades, setSelUnidades] = useState<string[]>([])
  const [selPeriods,  setSelPeriods]  = useState<string[]>([])
  const [selYear,     setSelYear]     = useState<string | null>('2026')
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [loading,     setLoading]     = useState(false)
  const [viewMode,    setViewMode]    = useState<'total' | 'periodo'>('total')

  const [ctxMenu,  setCtxMenu]  = useState<ContextMenuState | null>(null)
  const [detModal, setDetModal] = useState<ContextMenuState | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return
    const h = () => setCtxMenu(null)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [ctxMenu])

  // ─── Load static config once ──────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const [distRes, hierRes, linhasRes] = await Promise.all([
        fetch('/api/por-unidade?type=distinct').then(r => r.json()),
        fetch('/api/dre?type=hierarchy').then(r => r.json()),
        fetch('/api/dre?type=linhas').then(r => r.json()),
      ])

      const uns: string[]  = distRes.unidades ?? []
      const pers: string[] = distRes.periodos  ?? []
      setUnidades(uns)
      setPeriodos(pers)
      setHierarchy(Array.isArray(hierRes) ? hierRes : [])
      setDreLinhas(Array.isArray(linhasRes) ? linhasRes : [])

      // Default: YTD of current year
      const now = new Date()
      const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const ytd = pers.filter(p => p.startsWith('2026') && p <= curMonth)
      const initPeriods = ytd.length > 0 ? ytd : pers.filter(p => p.startsWith('2026'))
      setSelPeriods(initPeriods)

      if (initPeriods.length > 0) {
        loadData(uns.length > 0 ? uns : [], initPeriods)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Reload data when filters change ──────────────────────────────────────

  function loadData(units: string[], periods: string[]) {
    setLoading(true)
    const p = new URLSearchParams()
    if (periods.length) p.set('periodos', periods.join(','))
    if (units.length)   p.set('unidades', units.join(','))
    fetch(`/api/por-unidade?${p}`)
      .then(r => r.json())
      .then(data => { setRawData(Array.isArray(data.rows) ? data.rows : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  const handlePeriodChange = useCallback((periods: string[]) => {
    setSelPeriods(periods)
    loadData(selUnidades, periods)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selUnidades])

  const handleUnidadeToggle = useCallback((u: string) => {
    const next = selUnidades.includes(u)
      ? selUnidades.filter(x => x !== u)
      : [...selUnidades, u]
    setSelUnidades(next)
    loadData(next, selPeriods)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selUnidades, selPeriods])

  const handleYearChange = useCallback((year: string | null) => {
    setSelYear(year)
    const filtered = year ? periodos.filter(p => p.startsWith(year)) : periodos
    setSelPeriods(filtered)
    loadData(selUnidades, filtered)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodos, selUnidades])

  // ─── Build per-unit trees ──────────────────────────────────────────────────

  const unitTrees = useMemo(() => {
    if (!dreLinhas.length || !rawData.length) return new Map<string, TreeNode[]>()

    // Determine which units to show
    const activeUnits = selUnidades.length > 0 ? selUnidades : unidades
    const result = new Map<string, TreeNode[]>()

    for (const unit of activeUnits) {
      const unitRows = rawData.filter(r => r.unidade === unit)
      if (!unitRows.length) continue

      // Convert to DRERow[] for buildTreeFromLinhas (aggregate periods per dre||agrup)
      const dreRows: DRERow[] = unitRows.map(r => ({
        dre: r.dre,
        agrupamento_arvore: r.agrupamento,
        ordem_dre: r.ordem_dre,
        periodo: r.periodo ?? '',
        budget: r.budget,
        razao: r.razao,
      }))

      // Convert to DREAccountRow[] for account-level detail
      const acctRows: DREAccountRow[] = unitRows.map(r => ({
        dre: r.dre,
        agrupamento_arvore: r.agrupamento,
        numero_conta_contabil: r.conta,
        nome_conta_contabil: r.nome_conta,
        periodo: r.periodo ?? '',
        budget: r.budget,
        razao: r.razao,
      }))

      result.set(unit, buildTreeFromLinhas(dreRows, hierarchy, dreLinhas, acctRows))
    }
    return result
  }, [rawData, hierarchy, dreLinhas, selUnidades, unidades])

  // ─── Sorted period labels for column headers ───────────────────────────────

  const periodCols = useMemo(() => [...selPeriods].sort(), [selPeriods])

  // ─── Context menu ──────────────────────────────────────────────────────────

  const openCtxMenu = useCallback((
    e: React.MouseEvent,
    node: TreeNode,
    unit: string,
    periodo?: string,
    tipo: 'budget' | 'razao' | 'ambos' = 'ambos'
  ) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({
      x: e.clientX, y: e.clientY, node, periodo, tipo,
      unidades: [unit],
      periodos: selPeriods.length ? selPeriods : undefined,
    })
  }, [selPeriods])

  // ─── Toggle expand ─────────────────────────────────────────────────────────

  const toggle = useCallback((key: string) =>
    setExpanded(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    }), [])

  // ─── Render helpers ───────────────────────────────────────────────────────

  const years = useMemo(() => [...new Set(periodos.map(p => p.slice(0, 4)))].sort(), [periodos])

  function renderValueCell(val: number, className = '') {
    return (
      <td className={cn('px-2 py-0.5 text-right tabular-nums text-xs whitespace-nowrap', className)}>
        {formatCurrency(val)}
      </td>
    )
  }

  function renderVariationCell(budget: number, razao: number) {
    const v = razao - budget
    const pct = budget ? (v / Math.abs(budget)) * 100 : 0
    return (
      <>
        <td className={cn('px-2 py-0.5 text-right tabular-nums text-xs whitespace-nowrap', colorForVariance(v))}>
          {formatCurrency(v)}
        </td>
        <td className={cn('px-2 py-0.5 text-right tabular-nums text-xs whitespace-nowrap', colorForVariance(v))}>
          {formatPct(pct)}
        </td>
      </>
    )
  }

  // Renders a DRE tree node row (and recursively its children if expanded)
  function renderNode(node: TreeNode, unit: string, depth = 0): React.ReactNode {
    if (node.isSeparator) return <tr key={`sep-${node.name}-${unit}`}><td colSpan={100} className="h-px bg-gray-200 dark:bg-slate-600 py-0" /></tr>

    const key = `${unit}||${node.name}`
    const isExp = expanded.has(key)
    const hasChildren = node.children.length > 0
    const indent = depth * 16 + 8

    const rowClass = cn(
      'hover:bg-gray-50 dark:hover:bg-slate-700 cursor-default',
      node.isSubtotal ? 'bg-gray-50 dark:bg-slate-700/50' : '',
      node.isBold ? 'font-semibold' : '',
    )

    const labelCell = (
      <td
        className="px-2 py-0.5 text-xs max-w-[260px] whitespace-nowrap"
        style={{ paddingLeft: indent }}
      >
        <div className="flex items-center gap-1">
          {hasChildren
            ? <button onClick={() => toggle(key)} className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-white">
                {isExp ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            : <span style={{ width: 16, display: 'inline-block' }} />}
          <span className={cn('truncate', node.isBold ? 'font-semibold text-gray-800 dark:text-slate-100' : 'text-gray-700 dark:text-slate-300')}>
            {node.name}
          </span>
        </div>
      </td>
    )

    const rows: React.ReactNode[] = []

    if (viewMode === 'total') {
      rows.push(
        <tr key={key} className={rowClass}
          onContextMenu={e => openCtxMenu(e, node, unit, undefined, 'ambos')}>
          {labelCell}
          {renderValueCell(node.budget, 'text-gray-600 dark:text-slate-400')}
          {renderValueCell(node.razao)}
          {renderVariationCell(node.budget, node.razao)}
        </tr>
      )
    } else {
      rows.push(
        <tr key={key} className={rowClass}>
          {labelCell}
          {periodCols.map(p => {
            const pv = node.byPeriod[p] ?? { budget: 0, razao: 0 }
            return (
              <React.Fragment key={p}>
                <td className="px-2 py-0.5 text-right tabular-nums text-xs whitespace-nowrap text-gray-500 dark:text-slate-400"
                  onContextMenu={e => openCtxMenu(e, node, unit, p, 'budget')}>
                  {formatCurrency(pv.budget)}
                </td>
                <td className="px-2 py-0.5 text-right tabular-nums text-xs whitespace-nowrap"
                  onContextMenu={e => openCtxMenu(e, node, unit, p, 'razao')}>
                  {formatCurrency(pv.razao)}
                </td>
              </React.Fragment>
            )
          })}
        </tr>
      )
    }

    if (isExp && hasChildren) {
      for (const child of node.children) {
        rows.push(...React.Children.toArray(
          [renderNode(child, unit, depth + 1)].flat()
        ))
      }
    }

    return rows
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const activeUnits = selUnidades.length > 0 ? selUnidades : unidades

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-y-auto">
        <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-widest">Filtros</h2>
        </div>

        {/* Year */}
        <div className="px-3 pt-3 pb-2">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Ano</p>
          <YearFilter years={years} selected={selYear} onChange={handleYearChange} />
        </div>

        {/* Periods */}
        <div className="px-3 pt-2 pb-2 border-t border-gray-50 dark:border-slate-700/50">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Períodos</p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {periodos.filter(p => !selYear || p.startsWith(selYear)).map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-slate-700">
                <input type="checkbox" className="w-3 h-3 accent-indigo-600"
                  checked={selPeriods.includes(p)}
                  onChange={() => handlePeriodChange(
                    selPeriods.includes(p) ? selPeriods.filter(x => x !== p) : [...selPeriods, p]
                  )} />
                <span className="text-xs text-gray-600 dark:text-slate-300">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Units */}
        <div className="px-3 pt-2 pb-2 border-t border-gray-50 dark:border-slate-700/50 flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Unidades</p>
            {selUnidades.length > 0 && (
              <button onClick={() => { setSelUnidades([]); loadData([], selPeriods) }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800">
                Limpar
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {unidades.map(u => (
              <label key={u} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-slate-700">
                <input type="checkbox" className="w-3 h-3 accent-indigo-600"
                  checked={selUnidades.length === 0 || selUnidades.includes(u)}
                  onChange={() => handleUnidadeToggle(u)} />
                <span className="text-xs text-gray-600 dark:text-slate-300 truncate" title={u}>{u}</span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Por Unidade de Negócio</h1>
            <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">DRE por unidade · Budget vs Razão · Clique direito para detalhamento</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden text-xs">
              {(['total', 'periodo'] as const).map(m => (
                <button key={m}
                  className={cn('px-3 py-1.5 font-medium transition-colors',
                    viewMode === m
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                  )}
                  onClick={() => setViewMode(m)}>
                  {m === 'total' ? 'Total' : 'Mensal'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="px-4 py-4">
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-8 bg-white dark:bg-slate-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden shadow-sm">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-600">
                    <th className="px-2 py-2 text-left font-semibold text-gray-600 dark:text-slate-300 min-w-[220px]">Linha DRE</th>
                    {viewMode === 'total' ? (
                      <>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600 dark:text-slate-300 w-28">Budget</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600 dark:text-slate-300 w-28">Realizado</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600 dark:text-slate-300 w-28">Variação</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600 dark:text-slate-300 w-16">%</th>
                      </>
                    ) : periodCols.map(p => (
                      <React.Fragment key={p}>
                        <th className="px-2 py-2 text-right font-semibold text-gray-500 dark:text-slate-400 w-24">{p} Bud</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600 dark:text-slate-300 w-24">{p} Real</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeUnits.map(unit => {
                    const tree = unitTrees.get(unit)
                    if (!tree) return null
                    const unitKey = `unit::${unit}`
                    const isExpUnit = expanded.has(unitKey)

                    // Compute unit totals (sum of all DRE grupo nodes excluding subtotals)
                    const unitBudget = tree.reduce((s, n) => s + (n.isSubtotal ? 0 : n.budget), 0)
                    const unitRazao  = tree.reduce((s, n) => s + (n.isSubtotal ? 0 : n.razao),  0)

                    return (
                      <React.Fragment key={unit}>
                        {/* Unit header row */}
                        <tr className="bg-indigo-50 dark:bg-indigo-950/30 border-t border-indigo-100 dark:border-indigo-900 cursor-pointer"
                          onClick={() => toggle(unitKey)}>
                          <td className="px-2 py-1.5 font-bold text-indigo-700 dark:text-indigo-300">
                            <div className="flex items-center gap-1.5">
                              {isExpUnit ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              {unit}
                            </div>
                          </td>
                          {viewMode === 'total' ? (
                            <>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-500 dark:text-slate-400">{formatCurrency(unitBudget)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-800 dark:text-slate-100">{formatCurrency(unitRazao)}</td>
                              <td className={cn('px-2 py-1.5 text-right tabular-nums font-semibold', colorForVariance(unitRazao - unitBudget))}>
                                {formatCurrency(unitRazao - unitBudget)}
                              </td>
                              <td className={cn('px-2 py-1.5 text-right tabular-nums font-semibold', colorForVariance(unitRazao - unitBudget))}>
                                {formatPct(unitBudget ? ((unitRazao - unitBudget) / Math.abs(unitBudget)) * 100 : 0)}
                              </td>
                            </>
                          ) : periodCols.map(p => {
                            const bud = tree.reduce((s, n) => s + (n.isSubtotal ? 0 : (n.byPeriod[p]?.budget ?? 0)), 0)
                            const raz = tree.reduce((s, n) => s + (n.isSubtotal ? 0 : (n.byPeriod[p]?.razao  ?? 0)), 0)
                            return (
                              <React.Fragment key={p}>
                                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-500 dark:text-slate-400">{formatCurrency(bud)}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-800 dark:text-slate-100">{formatCurrency(raz)}</td>
                              </React.Fragment>
                            )
                          })}
                        </tr>

                        {/* DRE rows for this unit */}
                        {isExpUnit && tree.map(node => renderNode(node, unit, 1))}
                      </React.Fragment>
                    )
                  })}
                  {activeUnits.length === 0 && (
                    <tr>
                      <td colSpan={100} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhuma unidade disponível.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div ref={ctxRef}
          className="fixed z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-2xl py-1.5 w-52"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <div className="px-3 py-1.5 border-b border-gray-100 dark:border-slate-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-slate-200 truncate">{ctxMenu.node.name}</p>
            {ctxMenu.unidades?.[0] && (
              <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{ctxMenu.unidades[0]}</p>
            )}
          </div>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950 flex items-center gap-2"
            onClick={() => { setDetModal(ctxMenu); setCtxMenu(null) }}>
            <ChevronRight size={11} className="text-indigo-500" />
            Ver lançamentos
          </button>
        </div>
      )}

      {/* ── Detalhamento modal ───────────────────────────────────────────── */}
      {detModal && (
        <DetalhamentoModal ctx={detModal} onClose={() => setDetModal(null)} />
      )}
    </div>
  )
}
