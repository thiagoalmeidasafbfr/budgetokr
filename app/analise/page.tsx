'use client'
import { useState, useEffect, useCallback } from 'react'
import { Filter, X, BarChart3, Table2, Download, RefreshCw, Target, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import type { Medida } from '@/lib/types'

interface AnaliseRow {
  departamento: string
  nome_departamento: string
  centro_custo?: string
  nome_centro_custo?: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

interface MedidaResult {
  medida: Medida
  departamento: string
  nome_departamento: string
  centro_custo: string
  nome_centro_custo: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

type ViewMode = 'table' | 'chart' | 'medida'
type GroupBy = 'departamento' | 'centro_custo' | 'periodo'

export default function AnalisePage() {
  const [data,          setData]          = useState<AnaliseRow[]>([])
  const [medidas,       setMedidas]       = useState<Medida[]>([])
  const [medidaResults, setMedidaResults] = useState<MedidaResult[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [selDepts,      setSelDepts]      = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  // medida view state
  const [selMedida,        setSelMedida]        = useState<number | null>(null)
  const [medidaGroupBy,    setMedidaGroupBy]    = useState<'departamento' | 'periodo' | 'centro_custo'>('departamento')
  const [medidaSelPeriods, setMedidaSelPeriods] = useState<string[]>([])
  const [medidaLoading,    setMedidaLoading]    = useState(false)
  const [medidaPeriodView, setMedidaPeriodView] = useState<'mes' | 'acumulado'>('mes')
  const [viewMode,      setViewMode]      = useState<ViewMode>('table')
  const [groupBy,       setGroupBy]       = useState<GroupBy>('departamento')
  const [loading,       setLoading]       = useState(false)
  const [deptUser,      setDeptUser]      = useState<{ department: string } | null>(null)

  useEffect(() => {
    async function init() {
      const me = await fetch('/api/me').then(r => r.ok ? r.json() : null).catch(() => null)
      const isDept = me?.role === 'dept' && me.department
      if (isDept) { setDeptUser({ department: me.department }); setSelDepts([me.department]) }
      const medsUrl = isDept ? `/api/medidas?departamento=${encodeURIComponent(me.department)}` : '/api/medidas'
      const [depts, dates, meds] = await Promise.all([
        fetch('/api/analise?type=distinct&col=nome_departamento', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/analise?type=distinct&col=data_lancamento',   { cache: 'no-store' }).then(r => r.json()),
        fetch(medsUrl, { cache: 'no-store' }).then(r => r.json()),
      ])
      setDepartamentos(Array.isArray(depts) ? depts : [])
      setPeriodos([...new Set((Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean))].sort() as string[])
      setMedidas(Array.isArray(meds) ? meds : [])
    }
    init()
  }, [])

  // Auto-apply filters whenever selection or groupBy changes
  useEffect(() => {
    loadData(selDepts, selPeriods, groupBy)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDepts, selPeriods, groupBy])

  const loadData = useCallback(async (depts: string[], prds: string[], gb: GroupBy) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depts.length)        params.set('departamentos', depts.join(','))
    if (prds.length)         params.set('periodos', prds.join(','))
    if (gb === 'centro_custo') params.set('groupByCentro', 'true')
    const res = await fetch(`/api/analise?${params}`, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  const loadMedidaResults = useCallback(async (
    id: number,
    gb: 'departamento' | 'periodo' | 'centro_custo',
    prds: string[]
  ) => {
    setMedidaLoading(true)
    const params = new URLSearchParams({
      type: 'medida',
      medidaId: String(id),
      groupByDept:        String(gb === 'departamento'),
      groupByPeriod:      String(gb === 'periodo'),
      groupByCentroCusto: String(gb === 'centro_custo'),
    })
    if (prds.length) params.set('periodos', prds.join(','))
    const res = await fetch(`/api/analise?${params}`)
    if (res.ok) setMedidaResults(await res.json())
    setMedidaLoading(false)
  }, [])

  const selectMedida = (id: number) => {
    setSelMedida(id)
    setViewMode('medida')
    setMedidaSelPeriods([])
    setMedidaGroupBy('departamento')
    loadMedidaResults(id, 'departamento', [])
  }

  const applyFilters = () => loadData(selDepts, selPeriods, groupBy)

  // Re-fetch medida when groupBy or period filter changes
  useEffect(() => {
    if (selMedida !== null) {
      loadMedidaResults(selMedida, medidaGroupBy, medidaSelPeriods)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medidaGroupBy, medidaSelPeriods])

  // Aggregate by groupBy key
  const grouped = data.reduce<Record<string, { budget: number; razao: number; variacao: number; sub: Set<string>; codigo: string; dept?: string }>>((acc, row) => {
    let key: string
    if (groupBy === 'departamento') {
      key = (row.nome_departamento && row.nome_departamento.trim())
        ? row.nome_departamento.trim()
        : (row.departamento || '—')
    } else if (groupBy === 'centro_custo') {
      key = (row.nome_centro_custo && row.nome_centro_custo.trim())
        ? row.nome_centro_custo.trim()
        : (row.centro_custo || '—')
    } else {
      key = row.periodo
    }
    if (!acc[key]) acc[key] = { budget: 0, razao: 0, variacao: 0, sub: new Set(), codigo: groupBy === 'centro_custo' ? (row.centro_custo || '') : row.departamento, dept: row.nome_departamento || row.departamento }
    acc[key].budget   += row.budget
    acc[key].razao    += row.razao
    acc[key].variacao += row.variacao
    acc[key].sub.add(row.periodo)
    return acc
  }, {})

  const tableRows = Object.entries(grouped)
    .map(([key, vals]) => ({
      key,
      label: groupBy === 'periodo' ? formatPeriodo(key) : key,
      ...vals,
      variacao_pct: vals.budget ? (vals.variacao / Math.abs(vals.budget)) * 100 : 0,
    }))
    .sort((a, b) => groupBy === 'periodo'
      ? a.key.localeCompare(b.key)
      : Math.abs(b.variacao) - Math.abs(a.variacao))

  const totals = tableRows.reduce((a, r) => ({ budget: a.budget + r.budget, razao: a.razao + r.razao, variacao: a.variacao + r.variacao }), { budget: 0, razao: 0, variacao: 0 })
  // Chart usa label já formatado
  const chartData = tableRows.slice(0, 15).map(r => ({ ...r, key: r.label }))

  // Medida view aggregation
  const activeMedida = medidas.find(m => m.id === selMedida)
  const isRatioMedida = (medidaResults[0] as MedidaResult & { is_ratio?: boolean } | undefined)?.is_ratio === true

  // Label helper for medida rows
  const medidaRowLabel = (r: MedidaResult) => {
    if (medidaGroupBy === 'departamento') return r.nome_departamento?.trim() || r.departamento || '—'
    if (medidaGroupBy === 'centro_custo') return r.nome_centro_custo?.trim() || r.centro_custo || '—'
    return r.periodo || '—'
  }

  // For ratio medidas: aggregate raw numerador/denominador so the total ratio is correct
  type AggBucket = { budget: number; razao: number; num_b: number; num_r: number; den_b: number; den_r: number }
  const medidaAgg = medidaResults.reduce<Record<string, AggBucket>>((acc, r) => {
    const k = medidaRowLabel(r)
    if (!acc[k]) acc[k] = { budget: 0, razao: 0, num_b: 0, num_r: 0, den_b: 0, den_r: 0 }
    const rx = r as MedidaResult & { numerador_budget?: number; numerador_razao?: number; denominador_budget?: number; denominador_razao?: number }
    if (isRatioMedida) {
      acc[k].num_b += rx.numerador_budget ?? 0
      acc[k].num_r += rx.numerador_razao  ?? 0
      acc[k].den_b += rx.denominador_budget ?? 0
      acc[k].den_r += rx.denominador_razao  ?? 0
    } else {
      acc[k].budget += r.budget
      acc[k].razao  += r.razao
    }
    return acc
  }, {})

  // Resolve display values for each bucket
  const resolveAgg = (v: AggBucket) => isRatioMedida
    ? {
        budget: v.den_b ? (v.num_b / Math.abs(v.den_b)) * 100 : 0,
        razao:  v.den_r ? (v.num_r / Math.abs(v.den_r)) * 100 : 0,
      }
    : { budget: v.budget, razao: v.razao }

  const medidaTotalsRaw = Object.values(medidaAgg).reduce(
    (a, v) => ({ num_b: a.num_b + v.num_b, num_r: a.num_r + v.num_r, den_b: a.den_b + v.den_b, den_r: a.den_r + v.den_r, budget: a.budget + v.budget, razao: a.razao + v.razao }),
    { num_b: 0, num_r: 0, den_b: 0, den_r: 0, budget: 0, razao: 0 }
  )
  const medidaTotals = resolveAgg(medidaTotalsRaw)

  const exportCSV = () => {
    const colLabel = groupBy === 'departamento' ? 'Departamento' : groupBy === 'centro_custo' ? 'Centro de Custo' : 'Período'
    const rows = [
      groupBy === 'centro_custo'
        ? [colLabel, 'Departamento', 'Budget', 'Razão', 'Variação', '%']
        : [colLabel, 'Budget', 'Razão', 'Variação', '%'],
      ...tableRows.map(r => groupBy === 'centro_custo'
        ? [r.key, r.dept ?? '', r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)]
        : [r.key, r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)])
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
              {deptUser ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Departamento</p>
                  <p className="text-xs text-indigo-700 font-semibold px-1 py-0.5 bg-indigo-50 rounded">{deptUser.department}</p>
                </div>
              ) : (
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
              )}
              {/* Seletor de Ano (toggle style) */}
              {(() => {
                const anos = [...new Set(periodos.map(p => p.split('-')[0]))].sort()
                if (anos.length <= 1) return null
                const activeYear = anos.find(ano => {
                  const anoP = periodos.filter(p => p.startsWith(ano + '-'))
                  return anoP.length > 0 && anoP.every(p => selPeriods.includes(p)) && selPeriods.every(p => p.startsWith(ano + '-'))
                }) ?? ''
                return (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Ano</p>
                    <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
                      <button onClick={() => setSelPeriods([])}
                        className={cn('px-2 py-1 rounded-md text-xs font-medium transition-colors',
                          !selPeriods.length ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                        Todos
                      </button>
                      {anos.map(ano => (
                        <button key={ano} onClick={() => {
                          setSelPeriods(periodos.filter(p => p.startsWith(ano + '-')))
                        }}
                          className={cn('px-2 py-1 rounded-md text-xs font-medium transition-colors',
                            activeYear === ano ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                          {ano}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}
              {(selDepts.length > 0 || selPeriods.length > 0) && (
                <Button size="sm" variant="outline" onClick={() => { setSelDepts([]); setSelPeriods([]) }} className="w-full h-7 text-xs"><X size={10} /> Limpar filtros</Button>
              )}
            </CardContent>
          </Card>

          {medidas.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
                  <Target size={11} /> Medidas
                </p>
                {medidas.map(m => (
                  <button key={m.id} onClick={() => selectMedida(m.id)}
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
            {viewMode !== 'medida' && (
              <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5 ml-auto">
                {([
                  ['departamento', 'Departamento'],
                  ['centro_custo', 'Centro de Custo'],
                  ['periodo',      'Período'],
                ] as const).map(([g, label]) => (
                  <button key={g} onClick={() => setGroupBy(g)}
                    className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      groupBy === g ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-50')}>
                    Por {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active filters badges */}
          {viewMode !== 'medida' && (selDepts.length > 0 || selPeriods.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {selDepts.map(d => <Badge key={d} variant="secondary" className="gap-1">{d}<button onClick={() => setSelDepts(p => p.filter(x => x !== d))}><X size={9} /></button></Badge>)}
              {selPeriods.map(p => <Badge key={p} variant="outline" className="gap-1">{formatPeriodo(p)}<button onClick={() => setSelPeriods(prev => prev.filter(x => x !== p))}><X size={9} /></button></Badge>)}
            </div>
          )}

          {loading && <div className="flex items-center justify-center h-40"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}

          {/* TABLE VIEW */}
          {!loading && viewMode === 'table' && (
            <Card>
              {groupBy === 'centro_custo' && selDepts.length === 0 && (
                <div className="px-5 pt-3 pb-0">
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Dica: filtre por um departamento na sidebar para ver apenas os centros de custo daquele departamento.
                  </p>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-500">
                      {groupBy === 'departamento' ? 'Departamento' : groupBy === 'centro_custo' ? 'Centro de Custo' : 'Período'}
                    </th>
                    {groupBy === 'centro_custo' && <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs">Departamento</th>}
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Budget</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Razão</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
                  </tr></thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {row.label}
                          {groupBy !== 'centro_custo' && row.codigo && row.codigo !== row.label && (
                            <span className="ml-2 text-xs text-gray-400 font-normal">{row.codigo}</span>
                          )}
                        </td>
                        {groupBy === 'centro_custo' && (
                          <td className="px-5 py-3 text-xs text-gray-400">{row.dept}</td>
                        )}
                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(row.budget)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(row.razao)}</td>
                        <td className={cn('px-5 py-3 text-right font-semibold', colorForVariance(row.variacao))}>{formatCurrency(row.variacao)}</td>
                        <td className="px-5 py-3 text-right"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(row.variacao))}>{formatPct(row.variacao_pct)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                    <td className="px-5 py-3" colSpan={groupBy === 'centro_custo' ? 2 : 1}>Total</td>
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
                      <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 10 }} />
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
          {viewMode === 'medida' && activeMedida && (
            <div className="space-y-3">
              {/* Medida header */}
              <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: activeMedida.cor + '18', borderLeft: `4px solid ${activeMedida.cor}` }}>
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
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-gray-900">
                    {isRatioMedida ? formatPct(medidaTotals.razao) : formatCurrency(medidaTotals.razao)}
                  </p>
                  <p className="text-xs text-gray-500">{isRatioMedida ? 'Ratio Razão' : 'Razão Total'}</p>
                  <p className="text-xs text-gray-400">
                    Budget: {isRatioMedida ? formatPct(medidaTotals.budget) : formatCurrency(medidaTotals.budget)}
                  </p>
                </div>
              </div>

              {/* Medida controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* GroupBy */}
                <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
                  {([
                    ['departamento', 'Por Departamento'],
                    ['centro_custo', 'Por Centro de Custo'],
                    ['periodo',      'Por Período'],
                  ] as const).map(([g, label]) => (
                    <button key={g} onClick={() => { setMedidaGroupBy(g); setMedidaPeriodView('mes') }}
                      className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        medidaGroupBy === g ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Accumulated toggle — only for period groupBy */}
                {medidaGroupBy === 'periodo' && (
                  <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
                    {([['mes', 'Mês a Mês'], ['acumulado', 'Acumulado YTD']] as const).map(([v, label]) => (
                      <button key={v} onClick={() => setMedidaPeriodView(v)}
                        className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                          medidaPeriodView === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Period filter for medida */}
                <div className="relative group">
                  <button className="flex items-center gap-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50">
                    <Filter size={11} />
                    {medidaSelPeriods.length > 0 ? `${medidaSelPeriods.length} período(s)` : 'Todos os períodos'}
                    <ChevronDown size={11} />
                  </button>
                  <div className="absolute top-full left-0 z-20 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg min-w-[160px] p-2 hidden group-focus-within:block group-hover:block">
                    <p className="text-xs font-semibold text-gray-400 px-2 mb-1">Filtrar por período</p>
                    {periodos.map(p => (
                      <label key={p} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={medidaSelPeriods.includes(p)}
                          onChange={e => setMedidaSelPeriods(prev =>
                            e.target.checked ? [...prev, p] : prev.filter(x => x !== p))}
                          className="w-3 h-3 accent-indigo-600" />
                        <span className="text-xs text-gray-600">{formatPeriodo(p)}</span>
                      </label>
                    ))}
                    {medidaSelPeriods.length > 0 && (
                      <button onClick={() => setMedidaSelPeriods([])}
                        className="w-full text-left text-xs text-red-400 hover:text-red-600 px-2 py-1 mt-1 border-t border-gray-50">
                        <X size={9} className="inline mr-1" />Limpar
                      </button>
                    )}
                  </div>
                </div>

                {medidaLoading && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
              </div>

              {/* Active period badges */}
              {medidaSelPeriods.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {medidaSelPeriods.map(p => (
                    <Badge key={p} variant="outline" className="gap-1">{formatPeriodo(p)}
                      <button onClick={() => setMedidaSelPeriods(prev => prev.filter(x => x !== p))}><X size={9} /></button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Medida table */}
              {!medidaLoading && medidaGroupBy === 'periodo' && medidaPeriodView === 'acumulado'
                ? <MedidaAcumuladoTable
                    medidaAgg={medidaAgg}
                    isRatioMedida={isRatioMedida}
                    resolveAgg={resolveAgg}
                    medidaTotals={medidaTotals}
                  />
                : !medidaLoading && (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-500">
                          {medidaGroupBy === 'departamento' ? 'Departamento'
                            : medidaGroupBy === 'centro_custo' ? 'Centro de Custo'
                            : 'Período'}
                        </th>
                        <th className="text-right px-5 py-3 font-medium text-gray-500">{isRatioMedida ? 'Budget %' : 'Budget'}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-500">{isRatioMedida ? 'Razão %' : 'Razão'}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-500">{isRatioMedida ? 'Δ pp' : 'Variação'}</th>
                        {!isRatioMedida && <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>}
                      </tr></thead>
                      <tbody>
                        {Object.entries(medidaAgg)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([label, bucket], i) => {
                            const { budget, razao } = resolveAgg(bucket)
                            const variacao = razao - budget
                            const pct = budget ? (variacao / Math.abs(budget)) * 100 : 0
                            const fmt = (v: number) => isRatioMedida ? formatPct(v) : formatCurrency(v)
                            const displayLabel = medidaGroupBy === 'periodo' ? formatPeriodo(label) : label
                            return (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="px-5 py-3 font-medium text-gray-900">{displayLabel}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{fmt(budget)}</td>
                                <td className="px-5 py-3 text-right text-gray-600">{fmt(razao)}</td>
                                <td className={cn('px-5 py-3 text-right font-semibold', colorForVariance(variacao))}>
                                  {isRatioMedida ? `${variacao >= 0 ? '+' : ''}${variacao.toFixed(1)} pp` : formatCurrency(variacao)}
                                </td>
                                {!isRatioMedida && (
                                  <td className="px-5 py-3 text-right"><span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(variacao))}>{formatPct(pct)}</span></td>
                                )}
                              </tr>
                            )
                          })}
                      </tbody>
                      <tfoot><tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                        <td className="px-5 py-3">Total</td>
                        <td className="px-5 py-3 text-right">{isRatioMedida ? formatPct(medidaTotals.budget) : formatCurrency(medidaTotals.budget)}</td>
                        <td className="px-5 py-3 text-right">{isRatioMedida ? formatPct(medidaTotals.razao) : formatCurrency(medidaTotals.razao)}</td>
                        <td className={cn('px-5 py-3 text-right', colorForVariance(medidaTotals.razao - medidaTotals.budget))}>
                          {isRatioMedida
                            ? `${(medidaTotals.razao - medidaTotals.budget) >= 0 ? '+' : ''}${(medidaTotals.razao - medidaTotals.budget).toFixed(1)} pp`
                            : formatCurrency(medidaTotals.razao - medidaTotals.budget)}
                        </td>
                        {!isRatioMedida && (
                          <td className="px-5 py-3 text-right">
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(medidaTotals.razao - medidaTotals.budget))}>
                              {formatPct(medidaTotals.budget ? ((medidaTotals.razao - medidaTotals.budget) / Math.abs(medidaTotals.budget)) * 100 : 0)}
                            </span>
                          </td>
                        )}
                      </tr></tfoot>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Accumulated period table ──────────────────────────────────────────────────
type AggBucketPublic = { budget: number; razao: number; num_b: number; num_r: number; den_b: number; den_r: number }

function MedidaAcumuladoTable({
  medidaAgg, isRatioMedida, resolveAgg, medidaTotals
}: {
  medidaAgg: Record<string, AggBucketPublic>
  isRatioMedida: boolean
  resolveAgg: (v: AggBucketPublic) => { budget: number; razao: number }
  medidaTotals: { budget: number; razao: number }
}) {
  const sorted = Object.entries(medidaAgg).sort(([a], [b]) => a.localeCompare(b))

  let cumNum_b = 0, cumNum_r = 0, cumDen_b = 0, cumDen_r = 0
  let cumBudget = 0, cumRazao = 0

  const rows = sorted.map(([period, bucket]) => {
    const { budget: mBudget, razao: mRazao } = resolveAgg(bucket)
    if (isRatioMedida) {
      cumNum_b += bucket.num_b; cumNum_r += bucket.num_r
      cumDen_b += bucket.den_b; cumDen_r += bucket.den_r
      const cumBgt = cumDen_b ? (cumNum_b / Math.abs(cumDen_b)) * 100 : 0
      const cumRaz = cumDen_r ? (cumNum_r / Math.abs(cumDen_r)) * 100 : 0
      return { period, mBudget, mRazao, monthNum_r: bucket.num_r, monthDen_r: bucket.den_r, cumNum_r, cumDen_r, cumBgt, cumRaz }
    } else {
      cumBudget += mBudget; cumRazao += mRazao
      return { period, mBudget, mRazao, monthNum_r: 0, monthDen_r: 0, cumNum_r: 0, cumDen_r: 0, cumBgt: cumBudget, cumRaz: cumRazao }
    }
  })

  if (isRatioMedida) {
    return (
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs" rowSpan={2}>Período</th>
                <th className="text-center px-2 py-1 font-medium text-gray-400 text-xs border-b border-gray-100 bg-gray-50/80" colSpan={3}>Mês</th>
                <th className="text-center px-2 py-1 font-medium text-indigo-500 text-xs border-b border-indigo-100 border-l bg-indigo-50/40" colSpan={4}>Acumulado YTD</th>
              </tr>
              <tr className="border-b bg-gray-50">
                <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">Numerador</th>
                <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">Denominador</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">% Mês</th>
                <th className="text-right px-3 py-2 font-medium text-indigo-400 text-xs border-l border-indigo-100">Num. Acum.</th>
                <th className="text-right px-3 py-2 font-medium text-indigo-400 text-xs">Den. Acum.</th>
                <th className="text-right px-3 py-2 font-medium text-indigo-700 text-xs">% Acum.</th>
                <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">Bgd % Acum.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{formatPeriodo(r.period)}</td>
                  <td className="px-3 py-3 text-right text-gray-500 text-xs">{formatCurrency(r.monthNum_r)}</td>
                  <td className="px-3 py-3 text-right text-gray-500 text-xs">{formatCurrency(r.monthDen_r)}</td>
                  <td className="px-3 py-3 text-right text-gray-700 font-medium">{formatPct(r.mRazao)}</td>
                  <td className="px-3 py-3 text-right text-indigo-500 text-xs border-l border-indigo-50">{formatCurrency(r.cumNum_r)}</td>
                  <td className="px-3 py-3 text-right text-indigo-500 text-xs">{formatCurrency(r.cumDen_r)}</td>
                  <td className="px-3 py-3 text-right font-bold text-indigo-700">{formatPct(r.cumRaz)}</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">{formatPct(r.cumBgt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                <td className="px-4 py-3 text-xs" colSpan={4}>Total Acumulado</td>
                <td className="px-3 py-3 border-l border-indigo-50" colSpan={2} />
                <td className="px-3 py-3 text-right text-indigo-700">{formatPct(medidaTotals.razao)}</td>
                <td className="px-3 py-3 text-right text-gray-400 text-xs">{formatPct(medidaTotals.budget)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    )
  }

  // Simple medida accumulated
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gray-500 text-xs" rowSpan={2}>Período</th>
              <th className="text-center px-2 py-1 font-medium text-gray-400 text-xs border-b border-gray-100" colSpan={2}>Mês</th>
              <th className="text-center px-2 py-1 font-medium text-indigo-500 text-xs border-b border-indigo-100 border-l bg-indigo-50/40" colSpan={3}>Acumulado YTD</th>
            </tr>
            <tr className="border-b bg-gray-50">
              <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">Razão</th>
              <th className="text-right px-3 py-2 font-medium text-gray-400 text-xs">Budget</th>
              <th className="text-right px-3 py-2 font-medium text-indigo-600 text-xs border-l border-indigo-100">Razão Acum.</th>
              <th className="text-right px-3 py-2 font-medium text-indigo-400 text-xs">Budget Acum.</th>
              <th className="text-right px-3 py-2 font-medium text-indigo-400 text-xs">Δ Acum.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const delta = r.cumRaz - r.cumBgt
              return (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{formatPeriodo(r.period)}</td>
                  <td className="px-3 py-3 text-right text-gray-600">{formatCurrency(r.mRazao)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{formatCurrency(r.mBudget)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-indigo-700 border-l border-indigo-50">{formatCurrency(r.cumRaz)}</td>
                  <td className="px-3 py-3 text-right text-indigo-500">{formatCurrency(r.cumBgt)}</td>
                  <td className={cn('px-3 py-3 text-right font-semibold', colorForVariance(delta))}>{formatCurrency(delta)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
              <td className="px-4 py-3 text-xs" colSpan={3}>Total Acumulado</td>
              <td className="px-3 py-3 text-right text-indigo-700">{formatCurrency(medidaTotals.razao)}</td>
              <td className="px-3 py-3 text-right">{formatCurrency(medidaTotals.budget)}</td>
              <td className={cn('px-3 py-3 text-right', colorForVariance(medidaTotals.razao - medidaTotals.budget))}>{formatCurrency(medidaTotals.razao - medidaTotals.budget)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}
