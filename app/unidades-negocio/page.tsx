'use client'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, ChevronDown, Filter, X, Download, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import { YearFilter } from '@/components/YearFilter'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DreRow {
  unidade: string
  dre: string
  agrupamento_arvore: string
  periodo: string
  budget: number
  razao: number
}

interface PeriodoVal { budget: number; razao: number; variacao: number }

interface AgrupNode {
  agrupamento: string
  budget: number; razao: number; variacao: number; variacao_pct: number
  periodos: Record<string, PeriodoVal>
}
interface DreNode {
  dre: string
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

function buildTree(data: DreRow[]): UnidadeNode[] {
  const unMap = new Map<string, UnidadeNode>()

  for (const r of data) {
    if (!unMap.has(r.unidade)) {
      unMap.set(r.unidade, { unidade: r.unidade, budget: 0, razao: 0, variacao: 0, variacao_pct: 0, periodos: {}, dre_groups: [] })
    }
    const un = unMap.get(r.unidade)!

    let dreNode = un.dre_groups.find(d => d.dre === r.dre)
    if (!dreNode) {
      dreNode = { dre: r.dre, budget: 0, razao: 0, variacao: 0, variacao_pct: 0, periodos: {}, agrupamentos: [] }
      un.dre_groups.push(dreNode)
    }

    let ag = dreNode.agrupamentos.find(a => a.agrupamento === r.agrupamento_arvore)
    if (!ag) {
      ag = { agrupamento: r.agrupamento_arvore, budget: 0, razao: 0, variacao: 0, variacao_pct: 0, periodos: {} }
      dreNode.agrupamentos.push(ag)
    }

    ag.budget += r.budget
    ag.razao  += r.razao
    if (r.periodo) {
      if (!ag.periodos[r.periodo]) ag.periodos[r.periodo] = { budget: 0, razao: 0, variacao: 0 }
      ag.periodos[r.periodo].budget += r.budget
      ag.periodos[r.periodo].razao  += r.razao
    }
  }

  for (const un of unMap.values()) {
    for (const dreNode of un.dre_groups) {
      for (const ag of dreNode.agrupamentos) {
        ag.variacao     = ag.razao - ag.budget
        ag.variacao_pct = ag.budget ? ag.variacao / Math.abs(ag.budget) * 100 : 0
        for (const pv of Object.values(ag.periodos)) pv.variacao = pv.razao - pv.budget

        dreNode.budget += ag.budget
        dreNode.razao  += ag.razao
        for (const [p, pv] of Object.entries(ag.periodos)) {
          if (!dreNode.periodos[p]) dreNode.periodos[p] = { budget: 0, razao: 0, variacao: 0 }
          dreNode.periodos[p].budget += pv.budget
          dreNode.periodos[p].razao  += pv.razao
        }
      }
      dreNode.variacao     = dreNode.razao - dreNode.budget
      dreNode.variacao_pct = dreNode.budget ? dreNode.variacao / Math.abs(dreNode.budget) * 100 : 0
      for (const pv of Object.values(dreNode.periodos)) pv.variacao = pv.razao - pv.budget

      un.budget += dreNode.budget
      un.razao  += dreNode.razao
      for (const [p, pv] of Object.entries(dreNode.periodos)) {
        if (!un.periodos[p]) un.periodos[p] = { budget: 0, razao: 0, variacao: 0 }
        un.periodos[p].budget += pv.budget
        un.periodos[p].razao  += pv.razao
      }
    }
    un.variacao     = un.razao - un.budget
    un.variacao_pct = un.budget ? un.variacao / Math.abs(un.budget) * 100 : 0
    for (const pv of Object.values(un.periodos)) pv.variacao = pv.razao - pv.budget
  }

  return [...unMap.values()].sort((a, b) => a.unidade.localeCompare(b.unidade))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UnidadesNegocioPage() {
  const [data,        setData]        = useState<DreRow[]>([])
  const [unidades,    setUnidades]    = useState<string[]>([])
  const [periodos,    setPeriodos]    = useState<string[]>([])
  const [selUnidades, setSelUnidades] = useState<string[]>([])
  const [selPeriods,  setSelPeriods]  = useState<string[]>([])
  const [selYear,     setSelYear]     = useState<string | null>(null)
  const [viewMode,    setViewMode]    = useState<ViewMode>('total')
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [loading,     setLoading]     = useState(false)

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

  // Initial load
  useEffect(() => {
    async function init() {
      const [uns, rows] = await Promise.all([
        fetch('/api/unidades-negocio?type=distinct_unidades').then(r => r.json()),
        fetch('/api/unidades-negocio?type=dre').then(r => r.json()),
      ])
      setUnidades(Array.isArray(uns) ? uns : [])
      const dRows: DreRow[] = Array.isArray(rows) ? rows : []
      setData(dRows)
      const ps = [...new Set(dRows.map(r => r.periodo).filter(Boolean))].sort()
      setPeriodos(ps)
    }
    init()
  }, [])

  // Reactive reload when filters change (skip first render — init handles it)
  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    load(selUnidades, selPeriods)
  }, [selUnidades, selPeriods, load])

  const handleYearChange = (year: string | null) => {
    setSelYear(year)
    if (!year) { setSelPeriods([]); return }
    const now      = new Date()
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const ytd = periodos.filter(p => p.startsWith(year) && p <= curMonth)
    setSelPeriods(ytd.length > 0 ? ytd : periodos.filter(p => p.startsWith(year)))
  }

  const filteredPeriods = selYear ? periodos.filter(p => p.startsWith(selYear)) : periodos

  const tree = useMemo(() => buildTree(data), [data])

  const dataPeriods = useMemo(
    () => [...new Set(data.map(r => r.periodo).filter(Boolean))].sort(),
    [data]
  )

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

  const expandAll = () => {
    const keys = new Set<string>()
    for (const un of tree) {
      keys.add(un.unidade)
      for (const d of un.dre_groups) keys.add(`${un.unidade}::${d.dre}`)
    }
    setExpanded(keys)
  }

  const exportCSV = () => {
    const rows: string[][] = [['Unidade', 'DRE', 'Agrupamento', 'Budget', 'Razão', 'Variação', '%']]
    for (const un of tree) {
      for (const dre of un.dre_groups) {
        for (const ag of dre.agrupamentos) {
          rows.push([un.unidade, dre.dre, ag.agrupamento,
            String(ag.budget), String(ag.razao), String(ag.variacao), ag.variacao_pct.toFixed(2)])
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
  const TotalCells = ({ n }: { n: { budget: number; razao: number; variacao: number; variacao_pct: number } }) => (
    <>
      <td className="px-5 py-2.5 text-right tabular-nums text-gray-600">
        {n.budget !== 0 ? formatCurrency(n.budget) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-5 py-2.5 text-right tabular-nums text-gray-600">
        {n.razao !== 0 ? formatCurrency(n.razao) : <span className="text-gray-300">—</span>}
      </td>
      <td className={cn('px-5 py-2.5 text-right tabular-nums', n.variacao !== 0 ? colorForVariance(n.variacao_pct) : 'text-gray-300')}>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Por Unidade de Negócio</h1>
          <p className="text-gray-500 text-sm mt-0.5">Budget vs Realizado · Expansível por DRE e Agrupamento</p>
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
                      <th className="text-left px-5 py-3 font-medium" style={{ minWidth: 260 }}>Unidade / DRE / Agrupamento</th>
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
                      const unKey     = un.unidade
                      const unExpanded = expanded.has(unKey)
                      return (
                        <React.Fragment key={unKey}>
                          {/* Level 1: Unidade */}
                          <tr className="border-b bg-gray-50/80 hover:bg-gray-100/60 cursor-pointer"
                            onClick={() => toggle(unKey)}>
                            <td className="px-5 py-2.5 font-semibold text-gray-800">
                              <div className="flex items-center gap-1.5">
                                <span className="p-0.5 flex-shrink-0">
                                  {unExpanded
                                    ? <ChevronDown size={14} className="text-gray-500" />
                                    : <ChevronRight size={14} className="text-gray-500" />}
                                </span>
                                {un.unidade || <span className="italic text-gray-400">sem unidade</span>}
                              </div>
                            </td>
                            {isTotalView ? <TotalCells n={un} /> : <PeriodCells periodos={un.periodos} />}
                          </tr>

                          {unExpanded && un.dre_groups.map(dreNode => {
                            const dreKey     = `${unKey}::${dreNode.dre}`
                            const dreExpanded = expanded.has(dreKey)
                            return (
                              <React.Fragment key={dreKey}>
                                {/* Level 2: DRE */}
                                <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                                  onClick={() => toggle(dreKey)}>
                                  <td className="py-2 font-medium text-gray-700" style={{ paddingLeft: 44 }}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="p-0.5 flex-shrink-0">
                                        {dreExpanded
                                          ? <ChevronDown size={13} className="text-gray-400" />
                                          : <ChevronRight size={13} className="text-gray-400" />}
                                      </span>
                                      <span className="text-sm">{dreNode.dre}</span>
                                    </div>
                                  </td>
                                  {isTotalView ? <TotalCells n={dreNode} /> : <PeriodCells periodos={dreNode.periodos} />}
                                </tr>

                                {/* Level 3: Agrupamento */}
                                {dreExpanded && dreNode.agrupamentos.map(ag => (
                                  <tr key={`${dreKey}::${ag.agrupamento}`}
                                    className="border-b border-gray-50 hover:bg-indigo-50/30">
                                    <td className="py-2 text-gray-500 text-xs" style={{ paddingLeft: 68 }}>
                                      <span className="pl-2 border-l-2 border-gray-200">{ag.agrupamento}</span>
                                    </td>
                                    {isTotalView ? <TotalCells n={ag} /> : <PeriodCells periodos={ag.periodos} />}
                                  </tr>
                                ))}
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
                        const pct = pv.budget ? pv.variacao / Math.abs(pv.budget) * 100 : 0
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
