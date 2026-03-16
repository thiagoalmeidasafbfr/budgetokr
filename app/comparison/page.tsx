'use client'
import { useState, useEffect, useCallback } from 'react'
import { Filter, X, ChevronDown, BarChart3, Table2, Download, RefreshCw, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts'
import type { Metric } from '@/lib/types'

interface Row {
  department: string
  period: string
  budget: number
  actual: number
  variance: number
  variance_pct: number
}

interface MetricResult {
  metric: Metric
  department: string
  period: string
  budget: number
  actual: number
  variance: number
  variance_pct: number
}

type ViewMode = 'table' | 'chart' | 'metrics'

export default function ComparisonPage() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [data, setData] = useState<Row[]>([])
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [metricResults, setMetricResults] = useState<Record<number, MetricResult[]>>({})
  const [departments, setDepartments] = useState<string[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [selDepts, setSelDepts] = useState<string[]>([])
  const [selPeriods, setSelPeriods] = useState<string[]>([])
  const [selMetric, setSelMetric] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<'department' | 'period'>('department')

  useEffect(() => {
    fetch('/api/datasets').then(r => r.json()).then(async d => {
      if (!d.activeId) return
      setActiveId(d.activeId)

      const [depts, prds, mets] = await Promise.all([
        fetch(`/api/comparison?datasetId=${d.activeId}&type=distinct&col=department`).then(r => r.json()),
        fetch(`/api/comparison?datasetId=${d.activeId}&type=distinct&col=period`).then(r => r.json()),
        fetch('/api/metrics').then(r => r.json()),
      ])
      setDepartments(depts)
      setPeriods(prds)
      setMetrics(mets)
      loadData(d.activeId, [], [])
    })
  }, [])

  const loadData = useCallback(async (id: number, depts: string[], prds: string[]) => {
    setLoading(true)
    const params = new URLSearchParams({ datasetId: String(id) })
    if (depts.length) params.set('departments', depts.join(','))
    if (prds.length) params.set('periods', prds.join(','))

    const res = await fetch(`/api/comparison?${params}`)
    setData(await res.json())
    setLoading(false)
  }, [])

  const loadMetricResult = async (metricId: number) => {
    if (!activeId) return
    if (metricResults[metricId]) return // cached
    const res = await fetch(`/api/comparison?datasetId=${activeId}&type=metric&metricId=${metricId}`)
    const results = await res.json()
    setMetricResults(prev => ({ ...prev, [metricId]: results }))
  }

  const applyFilters = () => {
    if (activeId) loadData(activeId, selDepts, selPeriods)
  }

  const clearFilters = () => {
    setSelDepts([])
    setSelPeriods([])
    if (activeId) loadData(activeId, [], [])
  }

  const toggleMetricView = async (id: number) => {
    if (selMetric === id) { setSelMetric(null); return }
    await loadMetricResult(id)
    setSelMetric(id)
    setViewMode('metrics')
  }

  // Aggregate data
  const grouped = data.reduce<Record<string, { budget: number; actual: number; variance: number; periods: Set<string> }>>((acc, row) => {
    const key = groupBy === 'department' ? row.department : row.period
    if (!acc[key]) acc[key] = { budget: 0, actual: 0, variance: 0, periods: new Set() }
    acc[key].budget += row.budget
    acc[key].actual += row.actual
    acc[key].variance += row.variance
    acc[key].periods.add(groupBy === 'department' ? row.period : row.department)
    return acc
  }, {})

  const tableRows = Object.entries(grouped).map(([key, vals]) => ({
    key,
    budget: vals.budget,
    actual: vals.actual,
    variance: vals.variance,
    variance_pct: vals.budget ? (vals.variance / Math.abs(vals.budget)) * 100 : 0,
    sub: vals.periods.size,
  })).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))

  const totals = tableRows.reduce((acc, r) => ({
    budget: acc.budget + r.budget,
    actual: acc.actual + r.actual,
    variance: acc.variance + r.variance,
  }), { budget: 0, actual: 0, variance: 0 })

  const chartData = tableRows.slice(0, 15)

  // Metric data
  const activeMetricResults = selMetric ? (metricResults[selMetric] ?? []) : []
  const metricByDept = activeMetricResults.reduce<Record<string, { budget: number; actual: number }>>((acc, r) => {
    if (!acc[r.department]) acc[r.department] = { budget: 0, actual: 0 }
    acc[r.department].budget += r.budget
    acc[r.department].actual += r.actual
    return acc
  }, {})

  const exportCSV = () => {
    const rows = [
      [groupBy === 'department' ? 'Departamento' : 'Período', 'Budget', 'Realizado', 'Variação', '% Variação'],
      ...tableRows.map(r => [r.key, r.budget, r.actual, r.variance, r.variance_pct.toFixed(2)])
    ]
    const csv = rows.map(r => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'comparacao.csv'; a.click()
  }

  if (!activeId) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center">
        <BarChart3 size={48} className="text-gray-200 mb-3" />
        <p className="font-semibold text-gray-700">Nenhum dataset carregado</p>
        <p className="text-sm text-gray-400 mt-1">Importe dados para visualizar comparações</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget vs Realizado</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data.length.toLocaleString()} registros</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download size={14} /> Exportar CSV</Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Filters sidebar */}
        <div className="w-56 flex-shrink-0 space-y-3">
          <Card>
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Filter size={12} /> Filtros
              </p>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Departamentos</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {departments.map(d => (
                    <label key={d} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={selDepts.includes(d)}
                        onChange={e => setSelDepts(prev =>
                          e.target.checked ? [...prev, d] : prev.filter(x => x !== d)
                        )}
                        className="w-3.5 h-3.5 accent-indigo-600"
                      />
                      <span className="text-xs text-gray-600 truncate">{d || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Períodos</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {periods.map(p => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={selPeriods.includes(p)}
                        onChange={e => setSelPeriods(prev =>
                          e.target.checked ? [...prev, p] : prev.filter(x => x !== p)
                        )}
                        className="w-3.5 h-3.5 accent-indigo-600"
                      />
                      <span className="text-xs text-gray-600">{p || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-1">
                <Button size="sm" onClick={applyFilters} className="flex-1 text-xs h-7">
                  <RefreshCw size={11} /> Aplicar
                </Button>
                {(selDepts.length > 0 || selPeriods.length > 0) && (
                  <Button size="sm" variant="outline" onClick={clearFilters} className="text-xs h-7 px-2">
                    <X size={11} />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Metrics quick access */}
          {metrics.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <Target size={12} /> Métricas
                </p>
                {metrics.map(m => (
                  <button
                    key={m.id}
                    onClick={() => toggleMetricView(m.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors',
                      selMetric === m.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50 text-gray-600'
                    )}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
                {selMetric && (
                  <button onClick={() => { setSelMetric(null); setViewMode('table') }}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2">
                    <X size={10} /> Limpar métrica
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
              >
                <Table2 size={14} /> Tabela
              </button>
              <button
                onClick={() => setViewMode('chart')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  viewMode === 'chart' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
              >
                <BarChart3 size={14} /> Gráfico
              </button>
              {selMetric && (
                <button
                  onClick={() => setViewMode('metrics')}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === 'metrics' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}
                >
                  <Target size={14} /> {metrics.find(m => m.id === selMetric)?.name}
                </button>
              )}
            </div>

            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5 ml-auto">
              <button
                onClick={() => setGroupBy('department')}
                className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  groupBy === 'department' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-50')}
              >
                Por Departamento
              </button>
              <button
                onClick={() => setGroupBy('period')}
                className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  groupBy === 'period' ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-50')}
              >
                Por Período
              </button>
            </div>
          </div>

          {/* Active filters */}
          {(selDepts.length > 0 || selPeriods.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {selDepts.map(d => (
                <Badge key={d} variant="secondary" className="gap-1">
                  {d}
                  <button onClick={() => setSelDepts(prev => prev.filter(x => x !== d))}><X size={10} /></button>
                </Badge>
              ))}
              {selPeriods.map(p => (
                <Badge key={p} variant="outline" className="gap-1">
                  {p}
                  <button onClick={() => setSelPeriods(prev => prev.filter(x => x !== p))}><X size={10} /></button>
                </Badge>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && viewMode === 'table' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">
                        {groupBy === 'department' ? 'Departamento' : 'Período'}
                      </th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Budget</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Realizado</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Variação R$</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">% Var.</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">
                        {groupBy === 'department' ? 'Períodos' : 'Deptos.'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">{row.key || '—'}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(row.budget)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(row.actual)}</td>
                        <td className={cn('px-5 py-3 text-right font-semibold', colorForVariance(row.variance))}>
                          {formatCurrency(row.variance)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(row.variance))}>
                            {formatPct(row.variance_pct)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-400 text-xs">{row.sub}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                      <td className="px-5 py-3 text-gray-700">Total</td>
                      <td className="px-5 py-3 text-right text-gray-800">{formatCurrency(totals.budget)}</td>
                      <td className="px-5 py-3 text-right text-gray-800">{formatCurrency(totals.actual)}</td>
                      <td className={cn('px-5 py-3 text-right', colorForVariance(totals.variance))}>
                        {formatCurrency(totals.variance)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                          bgColorForVariance(totals.variance))}>
                          {formatPct(totals.budget ? (totals.variance / Math.abs(totals.budget)) * 100 : 0)}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {!loading && viewMode === 'chart' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Budget vs Realizado</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="key"
                        angle={-30}
                        textAnchor="end"
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <YAxis tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend />
                      <Bar dataKey="budget" name="Budget" fill="#818cf8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="actual" name="Realizado" fill="#34d399" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Variação</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="key" width={80} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="variance" name="Variação" radius={[0, 3, 3, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={entry.variance >= 0 ? '#34d399' : '#f87171'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {!loading && viewMode === 'metrics' && selMetric && (
            <div className="space-y-4">
              {(() => {
                const metric = metrics.find(m => m.id === selMetric)!
                const results = Object.entries(metricByDept).map(([dept, vals]) => ({
                  department: dept,
                  ...vals,
                  variance: vals.actual - vals.budget,
                  variance_pct: vals.budget ? ((vals.actual - vals.budget) / Math.abs(vals.budget)) * 100 : 0,
                }))
                const total = results.reduce((a, r) => ({ budget: a.budget + r.budget, actual: a.actual + r.actual }), { budget: 0, actual: 0 })

                return (
                  <>
                    {/* Metric header */}
                    <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: metric.color + '18', borderLeft: `4px solid ${metric.color}` }}>
                      <div>
                        <p className="font-bold text-gray-900 text-lg">{metric.name}</p>
                        {metric.description && <p className="text-sm text-gray-500">{metric.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {metric.filters.map((f, i) => (
                            <span key={i} className="text-xs bg-white/80 px-2 py-0.5 rounded-full font-mono text-gray-600">
                              {f.column} {f.operator} &quot;{f.value}&quot;
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="ml-auto text-right">
                        <p className="text-2xl font-bold text-gray-900">{formatCurrency(total.actual)}</p>
                        <p className="text-sm text-gray-500">Realizado Total</p>
                        <p className="text-sm text-gray-400">Budget: {formatCurrency(total.budget)}</p>
                      </div>
                    </div>

                    <Card>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left px-5 py-3 font-medium text-gray-500">Departamento</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-500">Budget</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-500">Realizado</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.map((r, i) => (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="px-5 py-3 font-medium text-gray-900">{r.department || '—'}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(r.budget)}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(r.actual)}</td>
                                <td className={cn('px-5 py-3 text-right font-semibold', colorForVariance(r.variance))}>
                                  {formatCurrency(r.variance)}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(r.variance))}>
                                    {formatPct(r.variance_pct)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                              <td className="px-5 py-3 text-gray-700">Total</td>
                              <td className="px-5 py-3 text-right">{formatCurrency(total.budget)}</td>
                              <td className="px-5 py-3 text-right">{formatCurrency(total.actual)}</td>
                              <td className={cn('px-5 py-3 text-right', colorForVariance(total.actual - total.budget))}>
                                {formatCurrency(total.actual - total.budget)}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                                  bgColorForVariance(total.actual - total.budget))}>
                                  {formatPct(total.budget ? ((total.actual - total.budget) / Math.abs(total.budget)) * 100 : 0)}
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </Card>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
