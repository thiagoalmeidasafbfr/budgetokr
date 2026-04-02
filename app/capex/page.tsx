'use client'
import { useState, useEffect, useCallback } from 'react'
import { Table2, Download, BarChart3, ChevronDown, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FilterSidebar } from '@/components/FilterSidebar'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn, safePct } from '@/lib/utils'
import { YearFilter } from '@/components/YearFilter'
import dynamic from 'next/dynamic'

const CapexCharts = dynamic(() => import('@/components/CapexCharts'), {
  ssr: false,
  loading: () => <div className="h-[300px] bg-gray-50 rounded-lg animate-pulse" />,
})

interface CapexRow {
  nome_projeto?: string
  centro_custo?: string
  nome_centro_custo?: string
  departamento: string
  nome_departamento: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

type ViewMode = 'table' | 'chart'
type GroupBy = 'projeto' | 'departamento' | 'centro_custo' | 'periodo'

export default function CapexPage() {
  const [data,          setData]          = useState<CapexRow[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [projetos,      setProjetos]      = useState<string[]>([])
  const [selDepts,      setSelDepts]      = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  const [selProjetos,   setSelProjetos]   = useState<string[]>([])
  const [selCentros,    setSelCentros]    = useState<string[]>([])
  const [centrosDisp,   setCentrosDisp]   = useState<Array<{ cc: string; nome: string }>>([])
  const [selYear,       setSelYear]       = useState<string | null>(null)
  const [viewMode,      setViewMode]      = useState<ViewMode>('table')
  const [groupBy,       setGroupBy]       = useState<GroupBy>('projeto')
  const [loading,       setLoading]       = useState(false)
  const [deptUser,      setDeptUser]      = useState<{ department?: string; departments?: string[] } | null>(null)

  useEffect(() => {
    async function init() {
      const me = await fetch('/api/me').then(r => r.ok ? r.json() : null).catch(() => null)
      const meDepts: string[] = me?.departments ?? (me?.department ? [me.department] : [])
      const isDept = me?.role === 'dept' && meDepts.length > 0
      if (isDept) { setDeptUser({ department: meDepts[0], departments: meDepts }); setSelDepts(meDepts) }
      const [depts, dates, projs] = await Promise.all([
        fetch('/api/capex?type=distinct&col=nome_departamento', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/capex?type=distinct&col=data_lancamento', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/capex?type=distinct&col=nome_projeto', { cache: 'no-store' }).then(r => r.json()),
      ])
      setDepartamentos(Array.isArray(depts) ? depts : [])
      setPeriodos([...new Set((Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean))].sort() as string[])
      setProjetos(Array.isArray(projs) ? projs : [])
    }
    init()
  }, [])

  useEffect(() => {
    if (selYear) {
      setSelPeriods(periodos.filter(p => p.startsWith(selYear)))
    } else {
      setSelPeriods([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selYear])

  // Fetch cost centers when departments are selected
  useEffect(() => {
    if (!selDepts.length) { setCentrosDisp([]); return }
    const p = new URLSearchParams({ type: 'centros', departamentos: selDepts.join(',') })
    fetch(`/api/dre?${p}`).then(r => r.json()).then(d => {
      const avail = Array.isArray(d) ? (d as Array<{ cc: string; nome: string }>) : []
      setCentrosDisp(avail)
      setSelCentros(prev => prev.filter(c => avail.some(a => a.cc === c)))
    })
  }, [selDepts])

  useEffect(() => {
    loadData(selDepts, selPeriods, selProjetos, groupBy)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDepts, selPeriods, selProjetos, groupBy])

  const loadData = useCallback(async (depts: string[], prds: string[], projs: string[], gb: GroupBy) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depts.length) params.set('departamentos', depts.join(','))
    if (prds.length)  params.set('periodos', prds.join(','))
    if (projs.length) params.set('projetos', projs.join(','))
    params.set('groupByProjeto', String(gb === 'projeto' || gb === 'centro_custo'))
    params.set('groupByCentro', String(gb === 'centro_custo'))
    const res = await fetch(`/api/capex?${params}`, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  // Apply CC client-side filter
  const filteredData = selCentros.length > 0
    ? data.filter(row => selCentros.includes(row.centro_custo ?? ''))
    : data

  // Aggregate by groupBy key
  const grouped = filteredData.reduce<Record<string, { budget: number; razao: number; variacao: number; sub: Set<string>; projeto?: string; dept?: string; cc?: string }>>((acc, row) => {
    let key: string
    if (groupBy === 'projeto') {
      key = row.nome_projeto || '—'
    } else if (groupBy === 'departamento') {
      key = row.nome_departamento?.trim() || row.departamento || '—'
    } else if (groupBy === 'centro_custo') {
      key = `${row.nome_projeto || '—'} → ${row.nome_centro_custo?.trim() || row.centro_custo || '—'}`
    } else {
      key = row.periodo
    }
    if (!acc[key]) acc[key] = { budget: 0, razao: 0, variacao: 0, sub: new Set(), projeto: row.nome_projeto, dept: row.nome_departamento, cc: row.centro_custo }
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
      variacao_pct: safePct(vals.variacao, vals.budget),
    }))
    .sort((a, b) => groupBy === 'periodo'
      ? a.key.localeCompare(b.key)
      : Math.abs(b.variacao) - Math.abs(a.variacao))

  const totals = tableRows.reduce((a, r) => ({ budget: a.budget + r.budget, razao: a.razao + r.razao, variacao: a.variacao + r.variacao }), { budget: 0, razao: 0, variacao: 0 })
  const chartData = tableRows.slice(0, 15).map(r => ({ ...r, key: r.label }))

  const exportXLSX = async () => {
    const colLabel = groupBy === 'projeto' ? 'Projeto' : groupBy === 'departamento' ? 'Departamento' : groupBy === 'centro_custo' ? 'Projeto → Centro de Custo' : 'Período'
    const rows = [
      [colLabel, 'Budget', 'Razão', 'Variação', '%'],
      ...tableRows.map(r => [r.key, r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)]),
    ]
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'CAPEX')
    XLSX.writeFile(wb, 'capex-analise.xlsx')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <h1 className="page-title text-2xl md:text-3xl">CAPEX — Investimentos</h1>
          <p className="text-sm mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#B8924A", opacity: 0.55, letterSpacing: "0.04em" }}>Budget vs Realizado por projeto · {data.length.toLocaleString()} registros</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <YearFilter periodos={periodos} selYear={selYear} onChange={y => setSelYear(y)} />
          <Button variant="outline" size="sm" onClick={exportXLSX}><Download size={13} /> Excel</Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Sidebar filters */}
        <div className="w-full md:w-52 flex-shrink-0 space-y-3">
          <FilterSidebar
            deptUser={deptUser}
            departamentos={departamentos}
            selDepts={selDepts}
            onDeptsChange={setSelDepts}
            centrosDisp={centrosDisp}
            selCentros={selCentros}
            onCentrosChange={setSelCentros}
            periodos={periodos}
            selPeriods={selPeriods}
            onPeriodsChange={setSelPeriods}
            extraBefore={projetos.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Projetos</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {projetos.map(p => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selProjetos.includes(p)}
                        onChange={e => setSelProjetos(prev => e.target.checked ? [...prev, p] : prev.filter(x => x !== p))}
                        className="w-3 h-3 accent-gray-800" />
                      <span className="text-xs text-gray-600 truncate">{p || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : undefined}
          />
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Budget CAPEX</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(totals.budget)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Realizado CAPEX</p>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(totals.razao)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Variação</p>
                <p className={cn('text-lg font-bold', colorForVariance(totals.variacao))}>{formatCurrency(totals.variacao)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">% Variação</p>
                <p className={cn('text-lg font-bold', colorForVariance(totals.variacao))}>
                  {formatPct(safePct(totals.variacao, totals.budget))}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* View controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
              {([['table', 'Tabela', <Table2 key="t" size={13} />], ['chart', 'Gráfico', <BarChart3 key="c" size={13} />]] as const).map(([v, l, icon]) => (
                <button key={v} onClick={() => setViewMode(v as ViewMode)}
                  className={cn('flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  {icon}{l}
                </button>
              ))}
            </div>
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5 ml-auto">
              {([
                ['projeto',       'Projeto'],
                ['departamento',  'Departamento'],
                ['centro_custo',  'CC por Projeto'],
                ['periodo',       'Período'],
              ] as const).map(([g, label]) => (
                <button key={g} onClick={() => setGroupBy(g)}
                  className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    groupBy === g ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-50')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Active filters badges */}
          {(selDepts.length > 0 || selPeriods.length > 0 || selProjetos.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {selProjetos.map(p => <Badge key={`p-${p}`} variant="default" className="gap-1">{p}<button onClick={() => setSelProjetos(prev => prev.filter(x => x !== p))}><X size={9} /></button></Badge>)}
              {selDepts.map(d => <Badge key={`d-${d}`} variant="secondary" className="gap-1">{d}<button onClick={() => setSelDepts(prev => prev.filter(x => x !== d))}><X size={9} /></button></Badge>)}
              {selPeriods.map(p => <Badge key={`t-${p}`} variant="outline" className="gap-1">{formatPeriodo(p)}<button onClick={() => setSelPeriods(prev => prev.filter(x => x !== p))}><X size={9} /></button></Badge>)}
            </div>
          )}

          {loading && <div className="flex items-center justify-center h-40"><div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" /></div>}

          {/* TABLE VIEW */}
          {!loading && viewMode === 'table' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-500">
                      {groupBy === 'projeto' ? 'Projeto' : groupBy === 'departamento' ? 'Departamento' : groupBy === 'centro_custo' ? 'Projeto → Centro de Custo' : 'Período'}
                    </th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Budget</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Razão</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
                  </tr></thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">{row.label}</td>
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
                        {formatPct(safePct(totals.variacao, totals.budget))}
                      </span>
                    </td>
                  </tr></tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* CHART VIEW */}
          {!loading && viewMode === 'chart' && <CapexCharts chartData={chartData} groupBy={groupBy} />}
        </div>
      </div>
    </div>
  )
}
