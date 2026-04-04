'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { BarChart2, RefreshCw, SlidersHorizontal, EyeOff, Eye } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { MarginBoard } from '@/components/MarginBoard'
import { MetricConfigPanel } from '@/components/MetricConfigPanel'
import { formatPeriodo } from '@/lib/utils'
import type { BoardDataRow } from '@/lib/onepage-insights-types'
import {
  BOARD_CONFIG_KEY,
  defaultBoardConfig,
  pivotBoardData,
  computeMetric,
  formatMetricValue,
  type BoardConfig,
} from '@/lib/onepage-insights-types'

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      className="flex-1 min-w-0 rounded-2xl px-5 py-4"
      style={{
        backgroundColor: accent ? 'rgba(190,140,74,0.08)' : '#fff',
        border: accent ? '1px solid rgba(190,140,74,0.2)' : '1px solid rgba(0,0,0,0.07)',
      }}
    >
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: accent ? '#9B6E20' : '#94a3b8',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </p>
      <p
        className="font-bold"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 22,
          color: accent ? '#9B6E20' : '#0f172a',
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.4)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnePageFinanceiro() {
  // ── Filter state ────────────────────────────────────────────────────────────
  const [allPeriodos, setAllPeriodos]   = useState<string[]>([])
  const [selYear, setSelYear]           = useState<string | null>('2026')
  const [selPeriods, setSelPeriods]     = useState<string[]>([])
  const [selCentros, setSelCentros]     = useState<string[]>([])
  const [showBudget, setShowBudget]     = useState(false)
  const isFirstLoad = useRef(true)

  // ── Data state ──────────────────────────────────────────────────────────────
  const [rawData, setRawData]           = useState<BoardDataRow[]>([])
  const [dreGroups, setDreGroups]       = useState<string[]>([])
  const [availCentros, setAvailCentros] = useState<{ cc: string; nome: string }[]>([])
  const [loading, setLoading]           = useState(false)
  const [lastFetch, setLastFetch]       = useState<Date | null>(null)

  // ── Config state ────────────────────────────────────────────────────────────
  const [config, setConfig]             = useState<BoardConfig>(defaultBoardConfig)
  const [configOpen, setConfigOpen]     = useState(false)

  // ─── Load metric config from localStorage ──────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BOARD_CONFIG_KEY)
      if (saved) setConfig(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  function saveConfig(c: BoardConfig) {
    setConfig(c)
    try { localStorage.setItem(BOARD_CONFIG_KEY, JSON.stringify(c)) } catch { /* ignore */ }
  }

  // ─── Load available periods and centros ────────────────────────────────────
  useEffect(() => {
    // Periods
    fetch('/api/analise?type=distinct&col=data_lancamento', { cache: 'no-store' })
      .then(r => r.json())
      .then((dates: string[]) => {
        const periodos = [
          ...new Set(
            (Array.isArray(dates) ? dates : [])
              .map((d: string) => d?.substring(0, 7))
              .filter(Boolean)
          ),
        ].sort() as string[]
        setAllPeriodos(periodos)

        if (isFirstLoad.current) {
          isFirstLoad.current = false
          const now  = new Date()
          const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          const cur  = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
          const ytd  = periodos.filter(p => p.startsWith('2026') && p <= cur)
          setSelPeriods(ytd.length > 0 ? ytd : periodos.filter(p => p.startsWith('2026')))
        }
      })
      .catch(() => {})

    // DRE groups
    fetch('/api/onepage-insights?type=dre_groups', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: string[]) => {
        if (Array.isArray(data)) setDreGroups(data)
      })
      .catch(() => {})

    // Available centros
    fetch('/api/onepage-insights?type=centros', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { cc: string; nome: string }[]) => {
        if (Array.isArray(data)) setAvailCentros(data)
      })
      .catch(() => {})
  }, [])

  // Auto-select YTD when year changes
  useEffect(() => {
    if (!allPeriodos.length || isFirstLoad.current) return
    if (selYear) {
      const now  = new Date()
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const cur  = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
      const ytd  = allPeriodos.filter(p => p.startsWith(selYear) && p <= cur)
      setSelPeriods(ytd.length > 0 ? ytd : allPeriodos.filter(p => p.startsWith(selYear)))
    } else {
      setSelPeriods([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selYear])

  // ─── Fetch board data ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!selPeriods.length) { setRawData([]); return }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('periodos', selPeriods.join(','))
      if (selCentros.length) params.set('centros', selCentros.join(','))
      const res  = await fetch(`/api/onepage-insights?${params}`, { cache: 'no-store' })
      const data = await res.json()
      setRawData(Array.isArray(data) ? data : [])
      setLastFetch(new Date())
    } catch { setRawData([]) }
    setLoading(false)
  }, [selPeriods, selCentros])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Derived summary KPIs ──────────────────────────────────────────────────
  const kpis = (() => {
    const metrics = config.metrics
    const pivoted = pivotBoardData(rawData)

    // Find the first currency metric (used as "revenue" for the KPI strip)
    const revMetric = metrics.find(m => m.format === 'currency' && m.type === 'simple')
    // Find ratio metrics for margin display
    const ratioMetrics = metrics.filter(m => m.format === 'pct' && m.type === 'ratio').slice(0, 2)

    let totalRev = 0
    if (revMetric) {
      for (const row of pivoted) {
        const val = computeMetric(row, revMetric, metrics)
        totalRev += val.razao
      }
    }

    const ratioTotals = ratioMetrics.map(rm => {
      // Sum numerator and denominator across all centros, then compute ratio
      const num = metrics.find(m => m.id === rm.numeratorId)
      const den = metrics.find(m => m.id === rm.denominatorId)
      if (!num || !den) return { metric: rm, value: 0 }
      let numSum = 0; let denSum = 0
      for (const row of pivoted) {
        const nv = computeMetric(row, num, metrics); numSum += nv.razao
        const dv = computeMetric(row, den, metrics); denSum += dv.razao
      }
      const value = denSum !== 0 ? (numSum / Math.abs(denSum)) * 100 : 0
      return { metric: rm, value }
    })

    return { totalRev, ratioTotals, storeCount: pivoted.length }
  })()

  // ─── Period helpers ────────────────────────────────────────────────────────
  const yearPeriods = selYear ? allPeriodos.filter(p => p.startsWith(selYear)) : allPeriodos

  function togglePeriod(p: string) {
    setSelPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort())
  }

  function toggleCentro(cc: string) {
    setSelCentros(prev => prev.includes(cc) ? prev.filter(x => x !== cc) : [...prev, cc])
  }

  // ─── Período label helper ──────────────────────────────────────────────────
  const periodLabel = (() => {
    if (!selPeriods.length) return 'Nenhum período'
    if (selPeriods.length === 1) return formatPeriodo(selPeriods[0])
    const first = formatPeriodo(selPeriods[0])
    const last  = formatPeriodo(selPeriods[selPeriods.length - 1])
    return `${first} → ${last}`
  })()

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F6F2' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 backdrop-blur-sm border-b"
        style={{ backgroundColor: 'rgba(255,255,255,0.96)', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        {/* Title + primary controls */}
        <div className="flex items-center gap-3 flex-wrap px-6 py-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(190,140,74,0.12)' }}
            >
              <BarChart2 size={16} style={{ color: '#be8c4a' }} />
            </div>
            <div>
              <p
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  color: '#9B6E20',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                Financial Intelligence
              </p>
              <h1 className="text-lg font-bold leading-tight" style={{ color: '#0f172a' }}>
                One Page
              </h1>
            </div>
          </div>

          <YearFilter periodos={allPeriodos} selYear={selYear} onChange={setSelYear} />

          {/* Budget toggle */}
          <button
            onClick={() => setShowBudget(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
            style={{
              borderColor: showBudget ? 'rgba(190,140,74,0.4)' : 'rgba(0,0,0,0.1)',
              backgroundColor: showBudget ? 'rgba(190,140,74,0.08)' : 'transparent',
              color: showBudget ? '#9B6E20' : '#374151',
            }}
          >
            {showBudget ? <Eye size={12} /> : <EyeOff size={12} />}
            Budget
          </button>

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
            style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#374151' }}
            title={lastFetch ? `Atualizado às ${lastFetch.toLocaleTimeString('pt-BR')}` : 'Atualizar dados'}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Carregando...' : 'Atualizar'}
          </button>

          {/* Metric config */}
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: '#be8c4a' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#a87840' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#be8c4a' }}
          >
            <SlidersHorizontal size={12} /> Métricas
          </button>
        </div>

        {/* Period selector row */}
        {yearPeriods.length > 0 && (
          <div
            className="border-t px-6 py-2 flex items-center gap-3 flex-wrap"
            style={{ borderColor: 'rgba(0,0,0,0.04)', backgroundColor: 'rgba(0,0,0,0.01)' }}
          >
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: '#9B6E20',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Período
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {yearPeriods.map(p => {
                const active = selPeriods.includes(p)
                return (
                  <button
                    key={p}
                    onClick={() => togglePeriod(p)}
                    className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                    style={{
                      backgroundColor: active ? 'rgba(190,140,74,0.15)' : 'transparent',
                      color: active ? '#9B6E20' : 'rgba(0,0,0,0.35)',
                      border: active ? '1px solid rgba(190,140,74,0.3)' : '1px solid transparent',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                    }}
                  >
                    {formatPeriodo(p)}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelPeriods(yearPeriods)}
                className="text-xs"
                style={{ color: '#9B6E20', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9 }}
              >
                Todos
              </button>
              <button
                onClick={() => setSelPeriods([])}
                className="text-xs"
                style={{ color: 'rgba(0,0,0,0.35)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9 }}
              >
                Limpar
              </button>
            </div>

            {/* Centros quick filter */}
            {availCentros.length > 0 && (
              <>
                <div className="w-px h-4 mx-1" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }} />
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9,
                    color: '#9B6E20',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}
                >
                  Lojas
                </span>
                <div className="flex items-center gap-1 flex-wrap max-w-xl overflow-hidden">
                  {availCentros.slice(0, 20).map(c => {
                    const active = selCentros.includes(c.cc)
                    return (
                      <button
                        key={c.cc}
                        onClick={() => toggleCentro(c.cc)}
                        className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                        title={c.nome}
                        style={{
                          backgroundColor: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                          color: active ? '#6366f1' : 'rgba(0,0,0,0.35)',
                          border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 9,
                          maxWidth: 80,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.nome}
                      </button>
                    )
                  })}
                  {availCentros.length > 20 && (
                    <span className="text-xs" style={{ color: 'rgba(0,0,0,0.3)', fontSize: 9 }}>
                      +{availCentros.length - 20} mais
                    </span>
                  )}
                </div>
                {selCentros.length > 0 && (
                  <button
                    onClick={() => setSelCentros([])}
                    className="text-xs"
                    style={{ color: 'rgba(0,0,0,0.35)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9 }}
                  >
                    Limpar lojas
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="px-6 py-5 space-y-5">

        {/* Context bar */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: '#0f172a' }}>
            {periodLabel}
          </span>
          {selCentros.length > 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: '#6366f1' }}
            >
              {selCentros.length} loja{selCentros.length !== 1 ? 's' : ''} selecionada{selCentros.length !== 1 ? 's' : ''}
            </span>
          )}
          {loading && (
            <span className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}>Carregando dados...</span>
          )}
        </div>

        {/* KPI strip */}
        {config.metrics.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {/* Total from first currency metric */}
            {kpis.totalRev !== 0 && (() => {
              const m = config.metrics.find(x => x.format === 'currency' && x.type === 'simple')
              if (!m) return null
              return (
                <KpiCard
                  key={m.id}
                  label={m.name}
                  value={formatMetricValue(kpis.totalRev, 'currency')}
                  sub={`${kpis.storeCount} lojas · Realizado`}
                  accent
                />
              )
            })()}

            {/* Ratio KPIs */}
            {kpis.ratioTotals.map(({ metric, value }) => (
              <KpiCard
                key={metric.id}
                label={metric.name}
                value={formatMetricValue(value, 'pct')}
                sub="Consolidado · Realizado"
              />
            ))}

            {/* Loja count */}
            <KpiCard
              label="Lojas analisadas"
              value={String(kpis.storeCount)}
              sub={selCentros.length > 0 ? 'Filtrado' : 'Todas as lojas'}
            />
          </div>
        )}

        {/* Margin board */}
        <MarginBoard
          rawData={rawData}
          metrics={config.metrics}
          showBudget={showBudget}
          onOpenConfig={() => setConfigOpen(true)}
          loading={loading}
        />

        {/* No period selected */}
        {!selPeriods.length && !loading && (
          <div
            className="rounded-2xl py-12 flex flex-col items-center gap-3"
            style={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <p className="font-semibold" style={{ color: '#0f172a' }}>Selecione um período</p>
            <p className="text-sm" style={{ color: 'rgba(0,0,0,0.45)' }}>
              Escolha os meses que deseja analisar na barra de períodos acima
            </p>
          </div>
        )}
      </div>

      {/* ── Metric config panel ──────────────────────────────────────────────── */}
      {configOpen && (
        <MetricConfigPanel
          config={config}
          dreGroups={dreGroups}
          onSave={saveConfig}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}
