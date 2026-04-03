'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart3, Upload, Target, AlertCircle, FileText, Settings2, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, formatPeriodo, cn, safePct } from '@/lib/utils'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { YearFilter } from '@/components/YearFilter'

// Widget configuration
type WidgetId = 'summary' | 'charts' | 'dept-table' | 'exec'
interface WidgetConfig { id: WidgetId; label: string; visible: boolean; order: number }

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'summary',    label: 'Resumo (Cards)',          visible: true, order: 0 },
  { id: 'charts',     label: 'Gráficos',                visible: true, order: 1 },
  { id: 'dept-table', label: 'Tabela por Departamento', visible: true, order: 2 },
  { id: 'exec',       label: 'Gráficos Executivos',     visible: true, order: 3 },
]

function loadWidgetConfig(): WidgetConfig[] {
  if (typeof window === 'undefined') return DEFAULT_WIDGETS
  try {
    const saved = localStorage.getItem('dashboard-widgets')
    if (saved) {
      const parsed = JSON.parse(saved) as WidgetConfig[]
      // Merge: add any new DEFAULT widgets not yet in saved config
      const existing = new Set(parsed.map(w => w.id))
      const merged = [...parsed]
      for (const def of DEFAULT_WIDGETS) {
        if (!existing.has(def.id)) merged.push({ ...def, order: merged.length })
      }
      return merged
    }
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

const ExecCharts = dynamic(() => import('@/components/ExecCharts'), { ssr: false })

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
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 rounded-full animate-spin" style={{ border: '2px solid rgba(184,146,74,0.2)', borderTopColor: '#B8924A' }} />
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#9B6E20', letterSpacing: '0.1em' }}>
          Carregando…
        </p>
      </div>
    </div>
  )

  if (empty) return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#FBF7EE', border: '0.5px solid #E4DFD5' }}>
        <AlertCircle size={30} style={{ color: '#B8924A' }} />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-1" style={{ color: '#1A1820' }}>Nenhum dado encontrado</h2>
        <p className="text-sm mb-5" style={{ color: '#B8924A', opacity: 0.6 }}>Importe os dados para começar. Sugestão de ordem:</p>
        <div className="flex flex-col gap-2 text-left max-w-xs mx-auto mb-5">
          {[
            ['1', 'Contas Contábeis', '/upload'],
            ['2', 'Centros de Custo', '/upload'],
            ['3', 'Lançamentos Budget', '/upload'],
            ['4', 'Lançamentos Realizado', '/upload'],
          ].map(([n, l, href]) => (
            <div key={n} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: '#FBF7EE', border: '0.5px solid #E4DFD5' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: '#1A1820', color: '#B8924A' }}>{n}</span>
              <span className="text-sm" style={{ color: '#1A1820' }}>{l}</span>
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
  const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const currentMonth = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}`
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
  const variacaoPct = safePct(variacao, displayBudget)

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

  const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order)
  const isWidgetVisible = (id: WidgetId) => widgets.find(w => w.id === id)?.visible ?? true

  // Props for ExecCharts
  const selPeriodos = selYear
    ? allPeriodos.filter(p => p.startsWith(selYear))
    : allPeriodos
  const allDepts = [...new Set(analise.map(r => r.nome_departamento?.trim() || r.departamento).filter(Boolean))]

  // Shared widget panel (rendered in left column)
  const widgetPanel = showWidgetCfg && (
    <div className="absolute left-0 top-full mt-1 z-30 rounded-xl shadow-xl p-3 w-56 space-y-1"
      style={{ backgroundColor: '#FFFFFF', border: '0.5px solid #E4DFD5' }}
    >
      <p className="px-1 mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.6 }}>
        Personalizar
      </p>
      {sortedWidgets.map((ww, i) => (
        <div key={ww.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
          style={{ cursor: 'default' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FBF7EE')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <button onClick={() => toggleWidget(ww.id)} className="flex-shrink-0">
            {ww.visible
              ? <Eye size={13} style={{ color: '#B8924A' }} />
              : <EyeOff size={13} style={{ color: '#E4DFD5' }} />
            }
          </button>
          <span className="text-xs flex-1" style={{ color: ww.visible ? '#1A1820' : '#B8924A', opacity: ww.visible ? 1 : 0.4 }}>{ww.label}</span>
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button onClick={() => moveWidget(ww.id, -1)} disabled={i === 0} style={{ color: '#B8924A', opacity: i === 0 ? 0.2 : 0.6 }}><ChevronUp size={10} /></button>
            <button onClick={() => moveWidget(ww.id, 1)} disabled={i === sortedWidgets.length - 1} style={{ color: '#B8924A', opacity: i === sortedWidgets.length - 1 ? 0.2 : 0.6 }}><ChevronDown size={10} /></button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header row — full width */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#9B6E20' }}>
            Dashboard
          </p>
          <div className="relative">
            <button
              onClick={() => setShowWidgetCfg(v => !v)}
              className="flex items-center gap-1.5 transition-colors"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '11px', color: '#9B6E20', opacity: 0.6 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
            >
              <Settings2 size={11} /> Widgets
            </button>
            {widgetPanel}
          </div>
        </div>
        <YearFilter periodos={allPeriodos} selYear={selYear} onChange={setSelYear} />
      </div>

      {/* Summary cards — mesma estrutura flex:2 / flex:1 que os gráficos abaixo */}
      {isWidgetVisible('summary') && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-5" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
          <SummaryCard
            title={selYear && hasYtdData ? 'Budget YTD' : 'Budget Total'}
            value={abbrev(displayBudget)}
            sub={selYear && hasYtdData ? ytdLabelSub : undefined}
          />
          <SummaryCard
            title="Variação de Performance"
            value={abbrev(variacao)}
            pct={formatPct(variacaoPct)}
            featured
            color={variacao >= 0 ? '#166534' : '#B91C1C'}
          />
          <SummaryCard
            title={selYear && hasYtdData ? 'Realizado YTD' : 'Realizado Total'}
            value={abbrev(displayRazao)}
            sub="Verificado"
          />
        </div>
      )}

      {/* Remaining widgets in custom order (summary handled above) */}
      {sortedWidgets.filter(w => w.visible && w.id !== 'summary').map(w => {
        if (w.id === 'charts') return (
          <div key="charts"><DashboardCharts periodChartData={periodChartData} deptVariance={deptVariance} totalBudget={displayBudget} totalRealizado={displayRazao} /></div>
        )
        if (w.id === 'exec') return (
          <div key="exec"><ExecCharts selPeriodos={selPeriodos} allDepts={allDepts} /></div>
        )
        if (w.id === 'dept-table') return (
          <Card key="dept-table">
            <CardHeader>
              <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Resumo por Departamento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #E4DFD5', backgroundColor: '#F7F6F2' }}>
                      {['Departamento', 'Budget', 'Realizado', 'Variação', '%'].map((h, hi) => (
                        <th key={h}
                          className={hi === 0 ? 'text-left px-3 md:px-5 py-2.5' : 'text-right px-3 md:px-5 py-2.5'}
                          style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9B6E20' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byDept).map(([label, vals], i) => {
                      const variacao = vals.razao - vals.budget
                      const pct     = safePct(variacao, vals.budget)
                      return (
                        <tr key={i} className="transition-colors"
                          style={{ borderBottom: '0.5px solid rgba(228,223,213,0.5)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FBF7EE')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <td className="px-3 md:px-5 py-2.5 font-medium" style={{ color: '#1A1820' }}>
                            {label}
                            {vals.codigo && vals.codigo !== label && (
                              <span className="ml-2 text-xs font-normal"
                                style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#9B6E20' }}>
                                {vals.codigo}
                              </span>
                            )}
                          </td>
                          <td className="px-3 md:px-5 py-2.5 text-right"
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#6B4E18' }}>
                            {formatCurrency(vals.budget)}
                          </td>
                          <td className="px-3 md:px-5 py-2.5 text-right"
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: '#6B4E18' }}>
                            {formatCurrency(vals.razao)}
                          </td>
                          <td className="px-3 md:px-5 py-2.5 text-right font-semibold"
                            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '12px', color: variacao >= 0 ? '#166534' : '#B91C1C' }}>
                            {formatCurrency(variacao)}
                          </td>
                          <td className="px-3 md:px-5 py-2.5 text-right">
                            <span className="text-xs px-2 py-0.5 rounded font-medium"
                              style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                backgroundColor: variacao >= 0 ? 'rgba(22,101,52,0.08)' : 'rgba(185,28,28,0.08)',
                                color: variacao >= 0 ? '#166534' : '#B91C1C',
                                border: `0.5px solid ${variacao >= 0 ? 'rgba(22,101,52,0.2)' : 'rgba(185,28,28,0.2)'}`,
                              }}>
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

function abbrev(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}R$\u00a0${(abs / 1_000_000_000).toFixed(2)}Bi`
  if (abs >= 1_000_000)     return `${sign}R$\u00a0${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)         return `${sign}R$\u00a0${(abs / 1_000).toFixed(1)}K`
  return `${sign}R$\u00a0${abs.toFixed(0)}`
}

function SummaryCard({ title, value, sub, pct, featured = false, color }: {
  title: string; value: string; sub?: string; pct?: string; featured?: boolean; color?: string
}) {
  const valueColor = color ?? '#1A1820'
  return (
    <div
      className="flex flex-col items-center justify-center px-8 py-7"
      style={{
        borderRadius: '8px',
        backgroundColor: featured ? '#FDFBF6' : '#FFFFFF',
        border: featured ? '1px solid rgba(184,146,74,0.35)' : '0.5px solid #E4DFD5',
        boxShadow: featured
          ? '0 2px 12px rgba(184,146,74,0.08)'
          : '0 2px 6px rgba(26,24,32,0.03)',
        minHeight: '160px',
      }}
    >
      <p style={{
        fontFamily: "'Big Shoulders Display', sans-serif",
        fontSize: '10px',
        fontWeight: 900,
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: featured ? '#6B4E18' : '#B8924A',
        marginBottom: '16px',
        textAlign: 'center',
      }}>
        {title}
      </p>
      <p style={{
        fontFamily: "'Big Shoulders Display', sans-serif",
        fontWeight: 900,
        fontSize: 'clamp(2rem, 3.2vw, 3.2rem)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        color: valueColor,
        textAlign: 'center',
      }}>
        {value}
      </p>
      {pct && (
        <p style={{
          fontFamily: "'Big Shoulders Display', sans-serif",
          fontWeight: 900,
          fontSize: '1.1rem',
          letterSpacing: '-0.01em',
          color: valueColor,
          opacity: 0.55,
          textAlign: 'center',
          marginTop: '6px',
        }}>
          ({pct})
        </p>
      )}
      {sub && (
        <p style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '9px',
          color: '#B8924A',
          opacity: 0.45,
          textAlign: 'center',
          marginTop: '12px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {sub}
        </p>
      )}
    </div>
  )
}
