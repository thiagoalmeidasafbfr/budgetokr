'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart3, TrendingDown, TrendingUp, Upload, Target, AlertCircle, Database, FileText, Settings2, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, formatPeriodo, cn } from '@/lib/utils'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { YearFilter } from '@/components/YearFilter'

// Widget configuration
type WidgetId = 'summary' | 'charts' | 'dept-table'
interface WidgetConfig { id: WidgetId; label: string; visible: boolean; order: number }

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'summary', label: 'Resumo (Cards)', visible: true, order: 0 },
  { id: 'charts', label: 'Gráficos', visible: true, order: 1 },
  { id: 'dept-table', label: 'Tabela por Departamento', visible: true, order: 2 },
]

function loadWidgetConfig(): WidgetConfig[] {
  if (typeof window === 'undefined') return DEFAULT_WIDGETS
  try {
    const saved = localStorage.getItem('dashboard-widgets')
    if (saved) return JSON.parse(saved)
  } catch {}
  return DEFAULT_WIDGETS
}

function saveWidgetConfig(cfg: WidgetConfig[]) {
  localStorage.setItem('dashboard-widgets', JSON.stringify(cfg))
}

const DashboardCharts = dynamic(() => import('@/components/DashboardCharts'), {
  ssr: false,
  loading: () => <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><ChartSkeleton /><ChartSkeleton /></div>,
})

function ChartSkeleton() {
  return <Card><CardContent className="p-6"><div className="h-[230px] bg-gray-50 rounded-lg animate-pulse" /></CardContent></Card>
}

interface Summary {
  departamentos: number; periodos: number
  total_budget: number; total_razao: number
  linhas_budget: number; linhas_razao: number
  qtd_centros: number; qtd_contas: number
}

interface AnaliseRow {
  departamento: string; nome_departamento: string; periodo: string
  budget: number; razao: number; variacao: number; variacao_pct: number
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [analise, setAnalise] = useState<AnaliseRow[]>([])
  const [medidas, setMedidas] = useState<Array<{ id: number; nome: string; cor: string }>>([])
  const [loading, setLoading] = useState(true)
  const [empty,   setEmpty]   = useState(false)
  const [allPeriodos, setAllPeriodos] = useState<string[]>([])
  const [selYear,     setSelYear]     = useState<string | null>('2026')
  const [widgets,     setWidgets]     = useState<WidgetConfig[]>(DEFAULT_WIDGETS)
  const [showWidgetCfg, setShowWidgetCfg] = useState(false)

  // Load widget config from localStorage on mount
  useEffect(() => { setWidgets(loadWidgetConfig()) }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/analise?type=summary').then(r => r.json()),
      fetch('/api/analise').then(r => r.json()),
      fetch('/api/medidas').then(r => r.json()),
      fetch('/api/analise?type=distinct&col=data_lancamento', { cache: 'no-store' }).then(r => r.json()),
    ]).then(([sum, data, meds, dates]) => {
      const s = sum as Summary
      setEmpty(!s.linhas_budget && !s.linhas_razao)
      setSummary(s)
      setAnalise(Array.isArray(data) ? data : [])
      setMedidas(Array.isArray(meds) ? meds : [])
      const periodos = [...new Set((Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean))].sort() as string[]
      setAllPeriodos(periodos)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-[70vh]">
      <div className="flex flex-col items-center gap-2">
        <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Carregando…</p>
      </div>
    </div>
  )

  if (empty) return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
      <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
        <AlertCircle size={30} className="text-indigo-400" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Nenhum dado encontrado</h2>
        <p className="text-gray-500 text-sm mb-5">Importe os dados para começar. Sugestão de ordem:</p>
        <div className="flex flex-col gap-2 text-left max-w-xs mx-auto mb-5">
          {[
            ['1', 'Contas Contábeis', '/upload'],
            ['2', 'Centros de Custo', '/upload'],
            ['3', 'Lançamentos Budget', '/upload'],
            ['4', 'Lançamentos Razão', '/upload'],
          ].map(([n, l, href]) => (
            <div key={n} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <span className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{n}</span>
              <span className="text-sm text-gray-700">{l}</span>
            </div>
          ))}
        </div>
        <Link href="/upload"><Button><Upload size={15} /> Importar Dados</Button></Link>
      </div>
    </div>
  )

  // Apply year filter
  const filteredAnalise = selYear
    ? analise.filter(r => r.periodo.startsWith(selYear))
    : analise

  // YTD: all periods in the selected year up to and including the current month
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const ytdPeriodSet = new Set(filteredAnalise.map(r => r.periodo).filter(p => p <= currentMonth))
  const hasYtdData = ytdPeriodSet.size > 0

  const ytdData        = filteredAnalise.filter(r => ytdPeriodSet.has(r.periodo))
  const totalBudgetYtd = ytdData.reduce((s, r) => s + r.budget, 0)
  const totalRazaoYtd  = ytdData.reduce((s, r) => s + r.razao,  0)

  // Full period totals (for summary when no year selected)
  const totalBudgetFull = filteredAnalise.reduce((s, r) => s + r.budget, 0)
  const totalRazaoFull  = filteredAnalise.reduce((s, r) => s + r.razao,  0)

  // When year selected: use YTD budget to compare fairly with YTD razão
  const displayBudget = selYear && hasYtdData ? totalBudgetYtd : (selYear ? totalBudgetFull : (summary?.total_budget ?? 0))
  const displayRazao  = selYear && hasYtdData ? totalRazaoYtd  : (selYear ? totalRazaoFull  : (summary?.total_razao  ?? 0))

  const variacao    = displayRazao - displayBudget
  const variacaoPct = displayBudget ? (variacao / Math.abs(displayBudget)) * 100 : 0

  // YTD period label (e.g. "Jan–Mar/26")
  const ytdPeriods  = [...ytdPeriodSet].sort()
  const ytdLabelSub = ytdPeriods.length > 0
    ? `YTD · ${formatPeriodo(ytdPeriods[0])}${ytdPeriods.length > 1 ? `–${formatPeriodo(ytdPeriods[ytdPeriods.length - 1])}` : ''}`
    : (selYear ?? '')

  // Aggregate by department using YTD data when a year is selected (fair comparison)
  const deptSource = selYear && hasYtdData ? ytdData : filteredAnalise
  const byDept = deptSource.reduce<Record<string, { budget: number; razao: number; codigo: string }>>((acc, r) => {
    // chave de exibição: nome do departamento (fallback para código)
    const label = (r.nome_departamento && r.nome_departamento.trim())
      ? r.nome_departamento.trim()
      : (r.departamento || '—')
    if (!acc[label]) acc[label] = { budget: 0, razao: 0, codigo: r.departamento }
    acc[label].budget += r.budget
    acc[label].razao  += r.razao
    return acc
  }, {})

  // Aggregate by period — use YTD source so chart aligns with summary cards
  const periodSource = selYear && hasYtdData ? ytdData : filteredAnalise
  const byPeriod = periodSource.reduce<Record<string, { budget: number; razao: number }>>((acc, r) => {
    if (!acc[r.periodo]) acc[r.periodo] = { budget: 0, razao: 0 }
    acc[r.periodo].budget += r.budget
    acc[r.periodo].razao  += r.razao
    return acc
  }, {})

  const periodChartData = Object.entries(byPeriod)
    .map(([periodo, vals]) => ({ raw: periodo, periodo: formatPeriodo(periodo), ...vals }))
    .sort((a, b) => a.raw.localeCompare(b.raw))

  // Add YTD cumulative variance
  let ytdBudget = 0, ytdRazao = 0
  for (const row of periodChartData) {
    ytdBudget += row.budget
    ytdRazao += row.razao
    ;(row as Record<string, unknown>).variacaoYtd = ytdRazao - ytdBudget
    ;(row as Record<string, unknown>).budgetYtd = ytdBudget
    ;(row as Record<string, unknown>).razaoYtd = ytdRazao
  }

  const deptVariance = Object.entries(byDept)
    .map(([dept, vals]) => ({ dept, variacao: vals.razao - vals.budget }))
    .sort((a, b) => b.variacao - a.variacao)
    .slice(0, 10)

  const toggleWidget = useCallback((id: WidgetId) => {
    setWidgets(prev => {
      const next = prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w)
      saveWidgetConfig(next)
      return next
    })
  }, [])

  const moveWidget = useCallback((id: WidgetId, direction: -1 | 1) => {
    setWidgets(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex(w => w.id === id)
      const swapIdx = idx + direction
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev
      const temp = sorted[idx].order
      sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order }
      sorted[swapIdx] = { ...sorted[swapIdx], order: temp }
      saveWidgetConfig(sorted)
      return sorted
    })
  }, [])

  const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order)
  const isWidgetVisible = (id: WidgetId) => widgets.find(w => w.id === id)?.visible ?? true

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Visão consolidada Budget vs Razão</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <YearFilter periodos={allPeriodos} selYear={selYear} onChange={setSelYear} />
          {medidas.length > 0 && (
            <Link href="/medidas"><Button variant="outline" size="sm"><Target size={13} /> {medidas.length} Medida{medidas.length !== 1 ? 's' : ''}</Button></Link>
          )}
          <Link href="/analise"><Button size="sm"><BarChart3 size={13} /> Análise</Button></Link>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowWidgetCfg(v => !v)}>
              <Settings2 size={13} /> Widgets
            </Button>
            {showWidgetCfg && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-64 space-y-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2">Personalizar Dashboard</p>
                {sortedWidgets.map((w, i) => (
                  <div key={w.id} className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5">
                    <button onClick={() => toggleWidget(w.id)} className="flex-shrink-0">
                      {w.visible
                        ? <Eye size={13} className="text-indigo-500" />
                        : <EyeOff size={13} className="text-gray-300" />}
                    </button>
                    <span className={cn('text-xs flex-1', w.visible ? 'text-gray-700' : 'text-gray-400')}>{w.label}</span>
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button onClick={() => moveWidget(w.id, -1)} disabled={i === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={10} /></button>
                      <button onClick={() => moveWidget(w.id, 1)} disabled={i === sortedWidgets.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={10} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Render widgets in custom order */}
      {sortedWidgets.filter(w => w.visible).map(w => {
        if (w.id === 'summary') return (
      <div key="summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SCard
          title={selYear && hasYtdData ? 'Budget YTD' : 'Budget Total'}
          value={formatCurrency(displayBudget)}
          sub={selYear && hasYtdData ? ytdLabelSub : `${summary?.linhas_budget.toLocaleString()} linhas`}
          icon={<BarChart3 size={16} className="text-indigo-500" />} bg="bg-indigo-50" />
        <SCard
          title={selYear && hasYtdData ? 'Razão YTD' : 'Razão Total'}
          value={formatCurrency(displayRazao)}
          sub={selYear && hasYtdData ? ytdLabelSub : `${summary?.linhas_razao.toLocaleString()} linhas`}
          icon={<TrendingUp size={16} className="text-emerald-500" />} bg="bg-emerald-50" />
        <SCard title="Variação YTD"  value={formatCurrency(variacao)} sub={formatPct(variacaoPct)}
          icon={variacao >= 0 ? <TrendingUp size={16} className="text-emerald-500" /> : <TrendingDown size={16} className="text-red-400" />}
          bg={variacao >= 0 ? 'bg-emerald-50' : 'bg-red-50'} highlight />
        <SCard title="Dimensões"
          value={`${summary?.qtd_centros ?? 0} CC`}
          sub={`${summary?.qtd_contas ?? 0} contas · ${summary?.departamentos ?? 0} deptos`}
          icon={<Database size={16} className="text-purple-400" />} bg="bg-purple-50" />
      </div>

        )
        if (w.id === 'charts') return (
      <div key="charts"><DashboardCharts periodChartData={periodChartData} deptVariance={deptVariance} /></div>

        )
        if (w.id === 'dept-table') return (
      <Card key="dept-table">
        <CardHeader><CardTitle>Resumo por Departamento</CardTitle></CardHeader>
        <CardContent className="p-0">
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
                {Object.entries(byDept).map(([label, vals], i) => {
                  const variacao = vals.razao - vals.budget
                  const pct     = vals.budget ? (variacao / Math.abs(vals.budget)) * 100 : 0
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {label}
                        {vals.codigo && vals.codigo !== label && (
                          <span className="ml-2 text-xs text-gray-400 font-normal">{vals.codigo}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(vals.budget)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(vals.razao)}</td>
                      <td className={cn('px-5 py-3 text-right font-semibold', variacao >= 0 ? 'text-emerald-600' : 'text-red-500')}>{formatCurrency(variacao)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', variacao >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                          {formatPct(pct)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
        )
        return null
      })}
    </div>
  )
}

function SCard({ title, value, sub, icon, bg, highlight }: {
  title: string; value: string; sub: string; icon: React.ReactNode; bg: string; highlight?: boolean
}) {
  return (
    <Card className={cn(highlight && 'ring-1 ring-indigo-100')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
            <p className="text-xl font-bold text-gray-900 mt-1 leading-tight">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
