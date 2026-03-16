'use client'
import { useState, useEffect, useCallback } from 'react'
import { Filter, X, BarChart3, Table2, Download, RefreshCw, Target, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import type { Medida } from '@/lib/types'

interface AnaliseRow {
  departamento: string
  nome_departamento: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

interface MedidaResult {
  medida: Medida
  departamento: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

type ViewMode = 'table' | 'chart' | 'medida'
type GroupBy = 'departamento' | 'periodo'

export default function AnalisePage() {
  const [data,          setData]          = useState<AnaliseRow[]>([])
  const [medidas,       setMedidas]       = useState<Medida[]>([])
  const [medidaResults, setMedidaResults] = useState<Record<number, MedidaResult[]>>({})
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [selDepts,      setSelDepts]      = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  const [selMedida,     setSelMedida]     = useState<number | null>(null)
  const [viewMode,      setViewMode]      = useState<ViewMode>('table')
  const [groupBy,       setGroupBy]       = useState<GroupBy>('departamento')
  const [loading,       setLoading]       = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/analise?type=distinct&col=departamento').then(r => r.json()),
      fetch('/api/analise?type=distinct&col=data_lancamento').then(r => r.json()),
      fetch('/api/medidas').then(r => r.json()),
    ]).then(([depts, periods, meds]) => {
      setDepartamentos(Array.isArray(depts) ? depts : [])
      // Extract YYYY-MM from dates
      const uniquePeriods = [...new Set((Array.isArray(periods) ? periods : []).map((d: string) => d?.substring(0, 7)).filter(Boolean))].sort()
      setPeriodos(uniquePeriods)
      setMedidas(Array.isArray(meds) ? meds : [])
    })
    loadData([], [])
  }, [])

  const loadData = useCallback(async (depts: string[], prds: string[]) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depts.length)  params.set('departamentos', depts.join(','))
    if (prds.length)   params.set('periodos', prds.join(','))
    const res = await fetch(`/api/analise?${params}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  const loadMedida = async (id: number) => {
    if (medidaResults[id]) return
    const res = await fetch(`/api/analise?type=medida&medidaId=${id}`)
    if (res.ok) {
      const results = await res.json()
      setMedidaResults(prev => ({ ...prev, [id]: Array.isArray(results) ? results : [] }))
    }
  }

  const toggleMedida = async (id: number) => {
    if (selMedida === id) { setSelMedida(null); setViewMode('table'); return }
    await loadMedida(id)
    setSelMedida(id)
    setViewMode('medida')
  }

  const applyFilters = () => loadData(selDepts, selPeriods)

  // Aggregate by groupBy key
  const grouped = data.reduce<Record<string, { budget: number; razao: number; variacao: number; sub: Set<string> }>>((acc, row) => {
    const key = groupBy === 'departamento' ? (row.departamento || row.nome_departamento || '—') : row.periodo
    if (!acc[key]) acc[key] = { budget: 0, razao: 0, variacao: 0, sub: new Set() }
    acc[key].budget   += row.budget
    acc[key].razao    += row.razao
    acc[key].variacao += row.variacao
    acc[key].sub.add(groupBy === 'departamento' ? row.periodo : row.departamento)
    return acc
  }, {})

  const tableRows = Object.entries(grouped)
    .map(([key, vals]) => ({ key, ...vals, variacao_pct: vals.budget ? (vals.variacao / Math.abs(vals.budget)) * 100 : 0 }))
    .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))

  const totals = tableRows.reduce((a, r) => ({ budget: a.budget + r.budget, razao: a.razao + r.razao, variacao: a.variacao + r.variacao }), { budget: 0, razao: 0, variacao: 0 })
  const chartData = tableRows.slice(0, 15)

  // Medida view
  const activeMedida = medidas.find(m => m.id === selMedida)
  const activeMedidaResults = selMedida ? (medidaResults[selMedida] ?? []) : []
  const medidaByDept = activeMedidaResults.reduce<Record<string, { budget: number; razao: number }>>((acc, r) => {
    if (!acc[r.departamento]) acc[r.departamento] = { budget: 0, razao: 0 }
    acc[r.departamento].budget += r.budget
    acc[r.departamento].razao  += r.razao
    return acc
  }, {})

  const exportCSV = () => {
    const rows = [
      [groupBy === 'departamento' ? 'Departamento' : 'Período', 'Budget', 'Razão', 'Variação', '%'],
      ...tableRows.map(r => [r.key, r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)])
    ]
    const csv  = rows.map(r => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'analise.csv'; a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análise Budget vs Razão</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data.length.toLocaleString()} registros</p>
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
                      <span className="text-xs text-gray-600">{p}</span>
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

          {medidas.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
                  <Target size={11} /> Medidas
                </p>
                {medidas.map(m => (
                  <button key={m.id} onClick={() => toggleMedida(m.id)}
                    className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors',
                      selMedida === m.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50 text-gray-600')}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.cor }} />
                    <span className="truncate">{m.nome}</span>
                  </button>
                ))}
                {selMedida && (
                  <button onClick={() => { setSelMedida(null); setViewMode('table') }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 mt-1">
                    <X size={9} /> Limpar
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* View controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
              {([['table','Tabela',<Table2 key="t" size={13} />],['chart','Gráfico',<BarChart3 key="c" size={13} />]] as const).map(([v,l,icon]) => (
                <button key={v} onClick={() => setViewMode(v as ViewMode)}
                  className={cn('flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  {icon}{l}
                </button>
              ))}
              {selMedida && (
                <button onClick={() => setViewMode('medida')}
                  className={cn('flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === 'medida' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  <Target size={13} />{activeMedida?.nome}
                </button>
              )}
            </div>
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5 ml-auto">
              {(['departamento','periodo'] as const).map(g => (
                <button key={g} onClick={() => setGroupBy(g)}
                  className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    groupBy === g ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-50')}>
                  Por {g === 'departamento' ? 'Departamento' : 'Período'}
                </button>
              ))}
            </div>
          </div>

          {/* Active filters */}
          {(selDepts.length > 0 || selPeriods.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {selDepts.map(d => <Badge key={d} variant="secondary" className="gap-1">{d}<button onClick={() => setSelDepts(p => p.filter(x => x !== d))}><X size={9} /></button></Badge>)}
              {selPeriods.map(p => <Badge key={p} variant="outline" className="gap-1">{p}<button onClick={() => setSelPeriods(prev => prev.filter(x => x !== p))}><X size={9} /></button></Badge>)}
            </div>
          )}

          {loading && <div className="flex items-center justify-center h-40"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}

          {/* TABLE VIEW */}
          {!loading && viewMode === 'table' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-500">{groupBy === 'departamento' ? 'Departamento' : 'Período'}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Budget</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Razão</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
                  </tr></thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">{row.key}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(row.budget)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(row.razao)}</td>
                        <td className={cn('px-5 py-3 text-right font-semibold', colorForVariance(row.variacao))}>{formatCurrency(row.variacao)}</td>
                        <td className="px-5 py-3 text-right"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(row.variacao))}>{formatPct(row.variacao_pct)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 text-right">{formatCurrency(totals.budget)}</td>
                    <td className="px-5 py-3 text-right">{formatCurrency(totals.razao)}</td>
                    <td className={cn('px-5 py-3 text-right', colorForVariance(totals.variacao))}>{formatCurrency(totals.variacao)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(totals.variacao))}>
                        {formatPct(totals.budget ? (totals.variacao / Math.abs(totals.budget)) * 100 : 0)}
                      </span>
                    </td>
                  </tr></tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* CHART VIEW */}
          {!loading && viewMode === 'chart' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Budget vs Razão</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="key" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                      <YAxis tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend />
                      <Bar dataKey="budget" name="Budget" fill="#818cf8" radius={[3,3,0,0]} />
                      <Bar dataKey="razao"  name="Razão"  fill="#34d399" radius={[3,3,0,0]} />
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
                      <XAxis type="number" tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="key" width={80} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="variacao" name="Variação" radius={[0,3,3,0]}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.variacao >= 0 ? '#34d399' : '#f87171'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* MEDIDA VIEW */}
          {!loading && viewMode === 'medida' && activeMedida && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: activeMedida.cor + '18', borderLeft: `4px solid ${activeMedida.cor}` }}>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-lg">{activeMedida.nome}</p>
                  {activeMedida.descricao && <p className="text-sm text-gray-500">{activeMedida.descricao}</p>}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {activeMedida.filtros.map((f, i) => (
                      <span key={i} className="text-xs bg-white/80 px-2 py-0.5 rounded-full font-mono text-gray-600">
                        {f.column} {f.operator} &quot;{f.value}&quot;
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(Object.values(medidaByDept).reduce((s,v) => s + v.razao, 0))}</p>
                  <p className="text-xs text-gray-500">Razão Total</p>
                  <p className="text-xs text-gray-400">Budget: {formatCurrency(Object.values(medidaByDept).reduce((s,v) => s + v.budget, 0))}</p>
                </div>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Departamento</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Budget</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Razão</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
                    </tr></thead>
                    <tbody>
                      {Object.entries(medidaByDept).map(([dept, vals], i) => {
                        const variacao = vals.razao - vals.budget
                        const pct = vals.budget ? (variacao / Math.abs(vals.budget)) * 100 : 0
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-5 py-3 font-medium text-gray-900">{dept || '—'}</td>
                            <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(vals.budget)}</td>
                            <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(vals.razao)}</td>
                            <td className={cn('px-5 py-3 text-right font-semibold', colorForVariance(variacao))}>{formatCurrency(variacao)}</td>
                            <td className="px-5 py-3 text-right"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(variacao))}>{formatPct(pct)}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
