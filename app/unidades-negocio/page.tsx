'use client'
import { useState, useEffect, useCallback } from 'react'
import { Filter, X, RefreshCw, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import { YearFilter } from '@/components/YearFilter'

interface UnidadeRow {
  unidade: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

interface Totals {
  budget: number
  razao: number
  variacao: number
}

type GroupBy = 'unidade' | 'periodo'

export default function UnidadesNegocioPage() {
  const [data,        setData]        = useState<UnidadeRow[]>([])
  const [unidades,    setUnidades]    = useState<string[]>([])
  const [periodos,    setPeriodos]    = useState<string[]>([])
  const [selUnidades, setSelUnidades] = useState<string[]>([])
  const [selPeriods,  setSelPeriods]  = useState<string[]>([])
  const [selYear,     setSelYear]     = useState<string | null>(null)
  const [groupBy,     setGroupBy]     = useState<GroupBy>('unidade')
  const [loading,     setLoading]     = useState(false)

  const load = useCallback(async (uns: string[], pers: string[]) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (uns.length)  params.set('unidades', uns.join(','))
    if (pers.length) params.set('periodos', pers.join(','))
    const res = await fetch(`/api/unidades-negocio?${params}`)
    const rows = res.ok ? await res.json() : []
    setData(Array.isArray(rows) ? rows : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const [uns, raw] = await Promise.all([
        fetch('/api/unidades-negocio?type=distinct_unidades').then(r => r.json()),
        fetch('/api/unidades-negocio').then(r => r.json()),
      ])
      setUnidades(Array.isArray(uns) ? uns : [])
      const rows: UnidadeRow[] = Array.isArray(raw) ? raw : []
      setData(rows)
      const ps = [...new Set(rows.map(r => r.periodo).filter(Boolean))].sort()
      setPeriodos(ps)
    }
    init()
  }, [])

  // Filter periods by selected year
  const filteredPeriods = selYear
    ? periodos.filter(p => p.startsWith(selYear))
    : periodos

  const applyFilters = () => {
    const ps = selYear ? selPeriods.filter(p => p.startsWith(selYear!)) : selPeriods
    load(selUnidades, ps)
  }

  // Aggregate: group by unidade (sum across periods) or keep full breakdown
  const grouped = groupBy === 'unidade'
    ? Object.values(
        data.reduce((acc, r) => {
          if (!acc[r.unidade]) acc[r.unidade] = { unidade: r.unidade, periodo: '', budget: 0, razao: 0, variacao: 0, variacao_pct: 0 }
          acc[r.unidade].budget   += r.budget
          acc[r.unidade].razao    += r.razao
          acc[r.unidade].variacao += r.variacao
          return acc
        }, {} as Record<string, UnidadeRow>)
      ).map(r => ({
        ...r,
        variacao_pct: r.budget ? (r.variacao / Math.abs(r.budget)) * 100 : 0,
      })).sort((a, b) => a.unidade.localeCompare(b.unidade))
    : [...data].sort((a, b) => a.unidade.localeCompare(b.unidade) || a.periodo.localeCompare(b.periodo))

  const totals: Totals = grouped.reduce(
    (acc, r) => ({ budget: acc.budget + r.budget, razao: acc.razao + r.razao, variacao: acc.variacao + r.variacao }),
    { budget: 0, razao: 0, variacao: 0 }
  )

  const exportCSV = () => {
    const header = groupBy === 'unidade'
      ? ['Unidade', 'Budget', 'Razão', 'Variação', '%']
      : ['Unidade', 'Período', 'Budget', 'Razão', 'Variação', '%']
    const rows = grouped.map(r =>
      groupBy === 'unidade'
        ? [r.unidade, r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)]
        : [r.unidade, r.periodo, r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)]
    )
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `unidades-negocio-${Date.now()}.csv`; a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Por Unidade de Negócio</h1>
          <p className="text-gray-500 text-sm mt-0.5">Budget vs Realizado · Agrupado por Unidade · Ligação via ID CC- CC</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(selUnidades, selPeriods)}>
            <RefreshCw size={13} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={grouped.length === 0}>
            <Download size={13} /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar filters */}
        <div className="w-52 flex-shrink-0 space-y-3">

          {/* Year filter */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ano</p>
              <YearFilter periodos={periodos} selYear={selYear} onChange={y => { setSelYear(y); setSelPeriods([]) }} />
            </CardContent>
          </Card>

          {/* Agrupamento */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agrupar por</p>
              <div className="flex flex-col gap-1">
                {(['unidade', 'periodo'] as GroupBy[]).map(g => (
                  <button key={g} onClick={() => setGroupBy(g)}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors text-left',
                      groupBy === g ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400')}>
                    {g === 'unidade' ? 'Unidade' : 'Unidade + Período'}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Unidade filter */}
          {unidades.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <Filter size={11} /> Unidades
                </p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {unidades.map(u => (
                    <label key={u} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selUnidades.includes(u)}
                        onChange={e => setSelUnidades(prev => e.target.checked ? [...prev, u] : prev.filter(x => x !== u))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600 truncate">{u}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Period filter */}
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
                {(selUnidades.length > 0 || selPeriods.length > 0) && (
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" className="flex-1 text-xs h-7" onClick={applyFilters}>
                      Aplicar
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => { setSelUnidades([]); setSelPeriods([]); load([], []) }}>
                      <X size={10} />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main table */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-[60vh]">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-400">Nenhum dado encontrado. Importe os lançamentos com a coluna <strong>ID CC- CC</strong> preenchida e cadastre as Unidades de Negócio.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 font-medium" style={{ minWidth: 200 }}>Unidade</th>
                        {groupBy === 'periodo' && (
                          <th className="text-left px-4 py-2.5 font-medium w-28">Período</th>
                        )}
                        <th className="text-right px-4 py-2.5 font-medium w-36">Budget</th>
                        <th className="text-right px-4 py-2.5 font-medium w-36">Razão</th>
                        <th className="text-right px-4 py-2.5 font-medium w-36">Variação</th>
                        <th className="text-right px-4 py-2.5 font-medium w-20">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((row, i) => (
                        <tr key={`${row.unidade}-${row.periodo}-${i}`}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{row.unidade || <span className="text-gray-300 italic">sem unidade</span>}</td>
                          {groupBy === 'periodo' && (
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{formatPeriodo(row.periodo)}</td>
                          )}
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {row.budget !== 0 ? formatCurrency(row.budget) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {row.razao !== 0 ? formatCurrency(row.razao) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={cn('px-4 py-2.5 text-right tabular-nums',
                            row.variacao !== 0 && colorForVariance(row.variacao_pct))}>
                            {row.variacao !== 0 ? formatCurrency(row.variacao) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {row.budget !== 0 && row.variacao !== 0 ? (
                              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', bgColorForVariance(row.variacao_pct))}>
                                {formatPct(row.variacao_pct)}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-800 text-white font-bold text-sm">
                        <td className="px-4 py-3" colSpan={groupBy === 'periodo' ? 2 : 1}>Total Geral</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.budget)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.razao)}</td>
                        <td className={cn('px-4 py-3 text-right tabular-nums', totals.variacao >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                          {formatCurrency(totals.variacao)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {totals.budget !== 0 && (
                            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',
                              totals.variacao >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}>
                              {formatPct(totals.budget ? (totals.variacao / Math.abs(totals.budget)) * 100 : 0)}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
