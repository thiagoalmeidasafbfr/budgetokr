'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, Filter, X, Download, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'

interface DRERow {
  dre: string
  agrupamento_arvore: string
  periodo: string
  budget: number
  razao: number
}

interface TreeNode {
  name: string
  isGroup: boolean
  depth: number
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
  children: TreeNode[]
  byPeriod: Record<string, { budget: number; razao: number }>
}

export default function DREPage() {
  const [rawData,       setRawData]       = useState<DRERow[]>([])
  const [hierarchy,     setHierarchy]     = useState<Array<{ agrupamento_arvore: string; dre: string }>>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [selDepts,      setSelDepts]      = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const [loading,       setLoading]       = useState(false)
  const [viewMode,      setViewMode]      = useState<'total' | 'periodo'>('total')

  useEffect(() => {
    Promise.all([
      fetch('/api/dre?type=hierarchy').then(r => r.json()),
      fetch('/api/dre?type=distinct&col=nome_departamento').then(r => r.json()),
      fetch('/api/dre?type=distinct&col=data_lancamento').then(r => r.json()),
    ]).then(([hier, depts, dates]) => {
      setHierarchy(Array.isArray(hier) ? hier : [])
      setDepartamentos(Array.isArray(depts) ? depts : [])
      const uniquePeriods = [...new Set(
        (Array.isArray(dates) ? dates : [])
          .map((d: string) => d?.substring(0, 7))
          .filter(Boolean)
      )].sort() as string[]
      setPeriodos(uniquePeriods)
      // Expand all groups by default
      const groups = new Set((Array.isArray(hier) ? hier : []).map((h: { agrupamento_arvore: string }) => h.agrupamento_arvore).filter(Boolean))
      setExpanded(groups)
    })
    loadData([], [])
  }, [])

  const loadData = useCallback(async (depts: string[], prds: string[]) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depts.length) params.set('departamentos', depts.join(','))
    if (prds.length)  params.set('periodos', prds.join(','))
    const res = await fetch(`/api/dre?${params}`)
    if (res.ok) setRawData(await res.json())
    setLoading(false)
  }, [])

  const applyFilters = () => loadData(selDepts, selPeriods)

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const expandAll = () => {
    const groups = new Set(hierarchy.map(h => h.agrupamento_arvore).filter(Boolean))
    setExpanded(groups)
  }
  const collapseAll = () => setExpanded(new Set())

  // Build tree from raw data
  const tree = buildTree(rawData, hierarchy)

  // Get all periods from data
  const dataPeriods = [...new Set(rawData.map(r => r.periodo).filter(Boolean))].sort()

  // Flatten tree for table rendering
  const flatRows = flattenTree(tree, expanded)

  // Totals
  const totals = flatRows
    .filter(r => r.depth === 0 && r.isGroup)
    .reduce((acc, r) => ({
      budget: acc.budget + r.budget,
      razao: acc.razao + r.razao,
    }), { budget: 0, razao: 0 })

  const exportCSV = () => {
    const header = viewMode === 'total'
      ? ['Linha DRE', 'Budget', 'Razão', 'Variação', '%']
      : ['Linha DRE', ...dataPeriods.flatMap(p => [`Budget ${formatPeriodo(p)}`, `Razão ${formatPeriodo(p)}`])]
    const rows = flatRows.map(r => {
      if (viewMode === 'total') {
        return [
          '  '.repeat(r.depth) + r.name,
          r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2),
        ]
      }
      return [
        '  '.repeat(r.depth) + r.name,
        ...dataPeriods.flatMap(p => [r.byPeriod[p]?.budget ?? 0, r.byPeriod[p]?.razao ?? 0]),
      ]
    })
    const csv = [header, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'dre.csv'; a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DRE — Demonstrativo de Resultados</h1>
          <p className="text-gray-500 text-sm mt-0.5">P&L por linha contábil · Budget vs Razão</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download size={13} /> CSV</Button>
      </div>

      <div className="flex gap-4">
        {/* Sidebar filters */}
        <div className="w-52 flex-shrink-0 space-y-3">
          <Card>
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Filter size={11} /> Filtros
              </p>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Departamentos</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {departamentos.map(d => (
                    <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selDepts.includes(d)}
                        onChange={e => setSelDepts(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600 truncate">{d || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Períodos</p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {periodos.map(p => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selPeriods.includes(p)}
                        onChange={e => setSelPeriods(prev => e.target.checked ? [...prev, p] : prev.filter(x => x !== p))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600">{formatPeriodo(p)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={applyFilters} className="flex-1 text-xs h-7"><RefreshCw size={10} /> Filtrar</Button>
                {(selDepts.length > 0 || selPeriods.length > 0) && (
                  <Button size="sm" variant="outline" onClick={() => { setSelDepts([]); setSelPeriods([]); loadData([],[]) }} className="h-7 px-2"><X size={10} /></Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visualização</p>
              <div className="flex flex-col gap-1">
                <button onClick={expandAll} className="text-xs text-indigo-600 hover:text-indigo-800 text-left px-1">Expandir todos</button>
                <button onClick={collapseAll} className="text-xs text-indigo-600 hover:text-indigo-800 text-left px-1">Recolher todos</button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* View toggle */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
              {([['total', 'Consolidado'], ['periodo', 'Por Período']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  {label}
                </button>
              ))}
            </div>

            {/* Active filter badges */}
            {(selDepts.length > 0 || selPeriods.length > 0) && (
              <div className="flex flex-wrap gap-1 ml-2">
                {selDepts.map(d => <Badge key={d} variant="secondary" className="gap-1">{d}<button onClick={() => setSelDepts(p => p.filter(x => x !== d))}><X size={9} /></button></Badge>)}
                {selPeriods.map(p => <Badge key={p} variant="outline" className="gap-1">{formatPeriodo(p)}<button onClick={() => setSelPeriods(prev => prev.filter(x => x !== p))}><X size={9} /></button></Badge>)}
              </div>
            )}
          </div>

          {loading && <div className="flex items-center justify-center h-40"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}

          {!loading && viewMode === 'total' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Demonstrativo Gerencial</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Vlr. Orçado</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Vlr. Realizado</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Var. Orçado x Real</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">% Var.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row, i) => (
                      <tr key={i}
                        className={cn(
                          'border-b transition-colors',
                          row.isGroup
                            ? 'bg-gray-50/80 hover:bg-gray-100/80'
                            : 'border-gray-50 hover:bg-gray-50',
                        )}>
                        <td className={cn('px-5 py-2.5', row.isGroup ? 'font-bold text-gray-900' : 'text-gray-700')}
                          style={{ paddingLeft: `${20 + row.depth * 24}px` }}>
                          <div className="flex items-center gap-1.5">
                            {row.isGroup ? (
                              <button onClick={() => toggleExpand(row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                {expanded.has(row.name)
                                  ? <ChevronDown size={14} className="text-gray-400" />
                                  : <ChevronRight size={14} className="text-gray-400" />}
                              </button>
                            ) : (
                              <span className="w-5" />
                            )}
                            {row.name}
                          </div>
                        </td>
                        <td className={cn('px-5 py-2.5 text-right', row.isGroup ? 'font-bold text-gray-900' : 'text-gray-600')}>
                          {formatCurrency(row.budget)}
                        </td>
                        <td className={cn('px-5 py-2.5 text-right', row.isGroup ? 'font-bold text-gray-900' : 'text-gray-600')}>
                          {formatCurrency(row.razao)}
                        </td>
                        <td className={cn('px-5 py-2.5 text-right font-semibold', colorForVariance(row.variacao))}>
                          {formatCurrency(row.variacao)}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(row.variacao))}>
                            {formatPct(row.variacao_pct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                      <td className="px-5 py-3">Total Geral</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(totals.budget)}</td>
                      <td className="px-5 py-3 text-right">{formatCurrency(totals.razao)}</td>
                      <td className={cn('px-5 py-3 text-right', colorForVariance(totals.razao - totals.budget))}>
                        {formatCurrency(totals.razao - totals.budget)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(totals.razao - totals.budget))}>
                          {formatPct(totals.budget ? ((totals.razao - totals.budget) / Math.abs(totals.budget)) * 100 : 0)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {!loading && viewMode === 'periodo' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[240px]">
                        Demonstrativo Gerencial
                      </th>
                      {dataPeriods.map(p => (
                        <th key={p} colSpan={3} className="text-center px-1 py-2 font-medium text-gray-500 border-l border-gray-200">
                          {formatPeriodo(p)}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b bg-gray-50/50">
                      <th className="sticky left-0 bg-gray-50/50 z-10" />
                      {dataPeriods.map(p => (
                        <React.Fragment key={p}>
                          <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Orçado</th>
                          <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs">Realizado</th>
                          <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs">Var.</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row, i) => (
                      <tr key={i}
                        className={cn(
                          'border-b transition-colors',
                          row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50',
                        )}>
                        <td className={cn('px-4 py-2 sticky left-0 bg-white z-10', row.isGroup ? 'font-bold text-gray-900 bg-gray-50/80' : 'text-gray-700')}
                          style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                          <div className="flex items-center gap-1">
                            {row.isGroup ? (
                              <button onClick={() => toggleExpand(row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                {expanded.has(row.name)
                                  ? <ChevronDown size={13} className="text-gray-400" />
                                  : <ChevronRight size={13} className="text-gray-400" />}
                              </button>
                            ) : <span className="w-4" />}
                            <span className="truncate">{row.name}</span>
                          </div>
                        </td>
                        {dataPeriods.map(p => {
                          const cell = row.byPeriod[p] ?? { budget: 0, razao: 0 }
                          const v = cell.razao - cell.budget
                          return (
                            <React.Fragment key={p}>
                              <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-100', row.isGroup ? 'font-bold' : 'text-gray-600')}>
                                {formatCurrency(cell.budget)}
                              </td>
                              <td className={cn('px-2 py-2 text-right text-xs', row.isGroup ? 'font-bold' : 'text-gray-600')}>
                                {formatCurrency(cell.razao)}
                              </td>
                              <td className={cn('px-2 py-2 text-right text-xs font-semibold', colorForVariance(v))}>
                                {formatCurrency(v)}
                              </td>
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tree building ─────────────────────────────────────────────────────────────

function buildTree(
  data: DRERow[],
  hierarchy: Array<{ agrupamento_arvore: string; dre: string }>
): TreeNode[] {
  // Group hierarchy entries by agrupamento_arvore
  const groupMap = new Map<string, string[]>()
  for (const h of hierarchy) {
    const group = h.agrupamento_arvore || ''
    if (!groupMap.has(group)) groupMap.set(group, [])
    groupMap.get(group)!.push(h.dre)
  }

  // Aggregate data by dre line
  const dreAgg = new Map<string, { budget: number; razao: number; byPeriod: Record<string, { budget: number; razao: number }> }>()
  for (const row of data) {
    const key = row.dre
    if (!dreAgg.has(key)) dreAgg.set(key, { budget: 0, razao: 0, byPeriod: {} })
    const agg = dreAgg.get(key)!
    agg.budget += row.budget
    agg.razao += row.razao
    if (row.periodo) {
      if (!agg.byPeriod[row.periodo]) agg.byPeriod[row.periodo] = { budget: 0, razao: 0 }
      agg.byPeriod[row.periodo].budget += row.budget
      agg.byPeriod[row.periodo].razao += row.razao
    }
  }

  // Build tree nodes
  const tree: TreeNode[] = []

  // DRE lines that belong to a group
  const assignedDREs = new Set<string>()

  for (const [group, dreLines] of groupMap) {
    if (!group) continue // skip empty group names

    const children: TreeNode[] = []
    let groupBudget = 0
    let groupRazao = 0
    const groupByPeriod: Record<string, { budget: number; razao: number }> = {}

    for (const dre of dreLines) {
      assignedDREs.add(dre)
      const agg = dreAgg.get(dre) ?? { budget: 0, razao: 0, byPeriod: {} }
      groupBudget += agg.budget
      groupRazao += agg.razao

      // Merge period data
      for (const [p, vals] of Object.entries(agg.byPeriod)) {
        if (!groupByPeriod[p]) groupByPeriod[p] = { budget: 0, razao: 0 }
        groupByPeriod[p].budget += vals.budget
        groupByPeriod[p].razao += vals.razao
      }

      const variacao = agg.razao - agg.budget
      children.push({
        name: dre,
        isGroup: false,
        depth: 1,
        budget: agg.budget,
        razao: agg.razao,
        variacao,
        variacao_pct: agg.budget ? (variacao / Math.abs(agg.budget)) * 100 : 0,
        children: [],
        byPeriod: agg.byPeriod,
      })
    }

    const variacao = groupRazao - groupBudget
    tree.push({
      name: group,
      isGroup: true,
      depth: 0,
      budget: groupBudget,
      razao: groupRazao,
      variacao,
      variacao_pct: groupBudget ? (variacao / Math.abs(groupBudget)) * 100 : 0,
      children,
      byPeriod: groupByPeriod,
    })
  }

  // Add unassigned DRE lines (no group)
  for (const [dre, agg] of dreAgg) {
    if (assignedDREs.has(dre)) continue
    const variacao = agg.razao - agg.budget
    tree.push({
      name: dre,
      isGroup: false,
      depth: 0,
      budget: agg.budget,
      razao: agg.razao,
      variacao,
      variacao_pct: agg.budget ? (variacao / Math.abs(agg.budget)) * 100 : 0,
      children: [],
      byPeriod: agg.byPeriod,
    })
  }

  return tree
}

function flattenTree(tree: TreeNode[], expanded: Set<string>): TreeNode[] {
  const result: TreeNode[] = []
  for (const node of tree) {
    result.push(node)
    if (node.isGroup && expanded.has(node.name)) {
      for (const child of node.children) {
        result.push(child)
      }
    }
  }
  return result
}

// React import needed for Fragment
import React from 'react'
