'use client'
import { useState, useMemo } from 'react'
import { ArrowUpDown, TrendingUp, TrendingDown, Minus, Settings2 } from 'lucide-react'
import type { BoardDataRow, MetricDef } from '@/lib/onepage-insights-types'
import {
  pivotBoardData,
  computeMetric,
  formatMetricValue,
} from '@/lib/onepage-insights-types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(a: number, b: number) {
  if (!b) return 0
  return ((a - b) / Math.abs(b)) * 100
}

function variationColor(val: number): string {
  if (val > 1)  return '#16a34a'
  if (val < -1) return '#dc2626'
  return '#64748b'
}

function metricColor(value: number, format: 'currency' | 'pct', isCost = false): string {
  if (format === 'pct') {
    if (value >= 15) return '#16a34a'
    if (value >= 5)  return '#d97706'
    return '#dc2626'
  }
  // currency: positive = good (unless it's a cost metric)
  if (isCost) {
    if (value < 0) return '#16a34a'
    if (value > 0) return '#dc2626'
    return '#64748b'
  }
  if (value > 0) return '#16a34a'
  if (value < 0) return '#dc2626'
  return '#64748b'
}

function TrendIcon({ variation }: { variation: number }) {
  if (variation > 1)  return <TrendingUp  size={11} style={{ color: '#16a34a', flexShrink: 0 }} />
  if (variation < -1) return <TrendingDown size={11} style={{ color: '#dc2626', flexShrink: 0 }} />
  return <Minus size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MarginBoardProps {
  rawData: BoardDataRow[]
  metrics: MetricDef[]
  showBudget?: boolean
  onOpenConfig: () => void
  loading?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MarginBoard({
  rawData,
  metrics,
  showBudget = false,
  onOpenConfig,
  loading = false,
}: MarginBoardProps) {
  const [sortBy, setSortBy]   = useState<string>('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const orderedMetrics = useMemo(
    () => [...metrics].sort((a, b) => a.order - b.order),
    [metrics]
  )

  const rows = useMemo(() => {
    const pivoted = pivotBoardData(rawData)
    return pivoted.map(row => {
      const computed = Object.fromEntries(
        orderedMetrics.map(m => [m.id, computeMetric(row, m, orderedMetrics)])
      )
      return { ...row, computed }
    })
  }, [rawData, orderedMetrics])

  // Totals row (sum of all CC for each metric — only for non-ratio metrics)
  const totals = useMemo(() => {
    const t: Record<string, { razao: number; budget: number }> = {}
    for (const m of orderedMetrics) {
      if (m.type === 'simple') {
        let razao = 0; let budget = 0
        for (const r of rows) {
          razao  += r.computed[m.id]?.razao  ?? 0
          budget += r.computed[m.id]?.budget ?? 0
        }
        t[m.id] = { razao: m.invertSign ? -razao : razao, budget: m.invertSign ? -budget : budget }
      }
    }
    // ratio totals: recompute from the total simple metrics
    for (const m of orderedMetrics) {
      if (m.type === 'ratio') {
        const num = orderedMetrics.find(x => x.id === m.numeratorId)
        const den = orderedMetrics.find(x => x.id === m.denominatorId)
        if (num && den && t[num.id] && t[den.id]) {
          const razao  = t[den.id].razao  !== 0 ? (t[num.id].razao  / Math.abs(t[den.id].razao))  * 100 : 0
          const budget = t[den.id].budget !== 0 ? (t[num.id].budget / Math.abs(t[den.id].budget)) * 100 : 0
          t[m.id] = { razao, budget }
        } else {
          t[m.id] = { razao: 0, budget: 0 }
        }
      }
    }
    return t
  }, [rows, orderedMetrics])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let av: number | string
      let bv: number | string
      if (sortBy === 'nome') {
        av = a.nome_centro_custo; bv = b.nome_centro_custo
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av))
      }
      av = a.computed[sortBy]?.razao ?? 0
      bv = b.computed[sortBy]?.razao ?? 0
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [rows, sortBy, sortDir])

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.07)', backgroundColor: '#fff' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <div className="h-4 w-40 rounded animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }} />
          <div className="h-7 w-32 rounded-lg animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
        </div>
        <div className="p-5 space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-9 rounded-lg animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }} />
          ))}
        </div>
      </div>
    )
  }

  // ── Empty config ──────────────────────────────────────────────────────────
  if (orderedMetrics.length === 0) {
    return (
      <div
        className="rounded-2xl flex flex-col items-center justify-center gap-4 py-16"
        style={{ border: '1.5px dashed rgba(190,140,74,0.35)', backgroundColor: 'rgba(190,140,74,0.03)' }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(190,140,74,0.12)' }}
        >
          <Settings2 size={22} style={{ color: '#be8c4a' }} />
        </div>
        <div className="text-center">
          <p className="font-semibold" style={{ color: '#0f172a' }}>Nenhuma métrica configurada</p>
          <p className="text-sm mt-1" style={{ color: 'rgba(0,0,0,0.45)' }}>
            Defina quais métricas exibir nas colunas da tabela
          </p>
        </div>
        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: '#be8c4a' }}
        >
          <Settings2 size={14} /> Configurar Métricas
        </button>
      </div>
    )
  }

  // ── No data ───────────────────────────────────────────────────────────────
  if (rawData.length === 0) {
    return (
      <div
        className="rounded-2xl flex flex-col items-center justify-center gap-3 py-14"
        style={{ border: '1px solid rgba(0,0,0,0.07)', backgroundColor: '#fff' }}
      >
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.4)' }}>
          Nenhum dado encontrado para os filtros selecionados
        </p>
        <button onClick={onOpenConfig} className="text-xs underline" style={{ color: '#be8c4a' }}>
          Verificar configuração
        </button>
      </div>
    )
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  const colCount = orderedMetrics.length * (showBudget ? 3 : 2)
  const hasData  = colCount > 0

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(0,0,0,0.07)', backgroundColor: '#fff' }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              color: '#9B6E20',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            Margin Board
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-xs"
            style={{ backgroundColor: 'rgba(190,140,74,0.1)', color: '#9B6E20', fontSize: 10 }}
          >
            {sorted.length} lojas
          </span>
        </div>
        <button
          onClick={onOpenConfig}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#374151' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <Settings2 size={12} /> Configurar
        </button>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 600 }}>
          {/* Column groups: store + N metrics × (razao [+ budget + var]) */}
          <thead>
            {/* Top header: metric names spanning their sub-columns */}
            <tr style={{ backgroundColor: '#fafaf9' }}>
              <th
                className="text-left px-4 py-2 cursor-pointer select-none"
                style={{
                  width: 220,
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#64748b',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid rgba(0,0,0,0.07)',
                  position: 'sticky',
                  left: 0,
                  backgroundColor: '#fafaf9',
                  zIndex: 2,
                }}
                onClick={() => toggleSort('nome')}
              >
                <span className="flex items-center gap-1">
                  Loja / Centro de Custo
                  <ArrowUpDown size={10} style={{ opacity: sortBy === 'nome' ? 1 : 0.4 }} />
                </span>
              </th>
              {hasData && orderedMetrics.map(m => (
                <th
                  key={m.id}
                  colSpan={showBudget ? 3 : 2}
                  className="text-center px-3 py-2"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#374151',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid rgba(0,0,0,0.07)',
                    borderLeft: '1px solid rgba(0,0,0,0.05)',
                  }}
                >
                  {m.name}
                </th>
              ))}
            </tr>
            {/* Sub-header: Realizado | Budget | Var% */}
            <tr style={{ backgroundColor: '#f8f8f7' }}>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  backgroundColor: '#f8f8f7',
                  zIndex: 2,
                  borderBottom: '2px solid rgba(0,0,0,0.08)',
                }}
              />
              {hasData && orderedMetrics.map(m => (
                <HeaderSubCols
                  key={m.id}
                  metricId={m.id}
                  showBudget={showBudget}
                  sortBy={sortBy}
                  onSort={toggleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr
                key={row.centro_custo}
                style={{ backgroundColor: idx % 2 === 0 ? '#fff' : 'rgba(0,0,0,0.012)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(190,140,74,0.04)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = idx % 2 === 0 ? '#fff' : 'rgba(0,0,0,0.012)' }}
              >
                {/* Store name */}
                <td
                  className="px-4 py-2.5"
                  style={{
                    position: 'sticky',
                    left: 0,
                    backgroundColor: idx % 2 === 0 ? '#fff' : 'rgba(249,249,248,1)',
                    zIndex: 1,
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                    maxWidth: 220,
                  }}
                >
                  <div className="font-medium text-sm truncate" style={{ color: '#0f172a' }}>
                    {row.nome_centro_custo}
                  </div>
                  {row.nome_departamento && (
                    <div className="text-xs truncate mt-0.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
                      {row.nome_departamento}
                    </div>
                  )}
                </td>
                {/* Metric cells */}
                {hasData && orderedMetrics.map(m => {
                  const val = row.computed[m.id] ?? { razao: 0, budget: 0 }
                  const varPct = pct(val.razao, val.budget)
                  return (
                    <MetricCells
                      key={m.id}
                      razao={val.razao}
                      budget={val.budget}
                      varPct={varPct}
                      format={m.format}
                      showBudget={showBudget}
                    />
                  )
                })}
              </tr>
            ))}

            {/* Totals row */}
            <tr style={{ backgroundColor: '#fafaf9', borderTop: '2px solid rgba(0,0,0,0.08)' }}>
              <td
                className="px-4 py-2.5 font-semibold text-sm"
                style={{
                  position: 'sticky',
                  left: 0,
                  backgroundColor: '#fafaf9',
                  zIndex: 1,
                  color: '#0f172a',
                  letterSpacing: '0.04em',
                }}
              >
                TOTAL
              </td>
              {hasData && orderedMetrics.map(m => {
                const val = totals[m.id] ?? { razao: 0, budget: 0 }
                const varPct = pct(val.razao, val.budget)
                return (
                  <MetricCells
                    key={m.id}
                    razao={val.razao}
                    budget={val.budget}
                    varPct={varPct}
                    format={m.format}
                    showBudget={showBudget}
                    isBold
                  />
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function HeaderSubCols({
  metricId,
  showBudget,
  sortBy,
  onSort,
}: {
  metricId: string
  showBudget: boolean
  sortBy: string
  onSort: (col: string) => void
}) {
  const cellStyle: React.CSSProperties = {
    fontSize: 9,
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 600,
    color: '#94a3b8',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    paddingTop: 4,
    paddingBottom: 6,
    borderBottom: '2px solid rgba(0,0,0,0.08)',
    borderLeft: '1px solid rgba(0,0,0,0.05)',
    textAlign: 'right',
    cursor: 'pointer',
    userSelect: 'none',
  }
  return (
    <>
      <th
        style={{ ...cellStyle, paddingLeft: 12, paddingRight: 8 }}
        onClick={() => onSort(metricId)}
      >
        <span className="flex items-center justify-end gap-1">
          Realizado
          <ArrowUpDown size={9} style={{ opacity: sortBy === metricId ? 1 : 0.35 }} />
        </span>
      </th>
      {showBudget && (
        <th style={{ ...cellStyle, paddingLeft: 8, paddingRight: 8 }}>Budget</th>
      )}
      <th style={{ ...cellStyle, paddingLeft: 8, paddingRight: 12 }}>Var %</th>
    </>
  )
}

function MetricCells({
  razao,
  budget,
  varPct,
  format,
  showBudget,
  isBold = false,
}: {
  razao: number
  budget: number
  varPct: number
  format: 'currency' | 'pct'
  showBudget: boolean
  isBold?: boolean
}) {
  const mono: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: isBold ? 700 : 500,
    textAlign: 'right',
    paddingTop: 10,
    paddingBottom: 10,
    borderBottom: '1px solid rgba(0,0,0,0.04)',
    borderLeft: '1px solid rgba(0,0,0,0.04)',
    whiteSpace: 'nowrap',
  }
  return (
    <>
      <td style={{ ...mono, paddingLeft: 12, paddingRight: 8, color: metricColor(razao, format) }}>
        {formatMetricValue(razao, format)}
      </td>
      {showBudget && (
        <td style={{ ...mono, paddingLeft: 8, paddingRight: 8, color: '#64748b' }}>
          {formatMetricValue(budget, format)}
        </td>
      )}
      <td style={{ ...mono, paddingLeft: 8, paddingRight: 12 }}>
        <span className="flex items-center justify-end gap-1">
          <TrendIcon variation={varPct} />
          <span style={{ color: variationColor(varPct), fontSize: 11 }}>
            {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
          </span>
        </span>
      </td>
    </>
  )
}
