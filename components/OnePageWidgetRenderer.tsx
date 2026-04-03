'use client'
import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { formatCurrency, formatPct, formatPeriodo } from '@/lib/utils'
import { CHART_COLORS } from '@/lib/constants'
import type { WidgetConfig, DataSource } from '@/lib/one-page-types'

// ─── Color schemes ────────────────────────────────────────────────────────────

const SCHEMES: Record<string, string[]> = {
  default: [...CHART_COLORS],
  green:   ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'],
  gold:    ['#be8c4a', '#d4a76a', '#e8c48a', '#f0d4a8', '#f8e4cc'],
  blue:    ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
  mono:    ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db'],
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function fetchWidgetData(ds: DataSource, periods: string[]): Promise<unknown[]> {
  const pp = periods.length ? `&periodos=${encodeURIComponent(periods.join(','))}` : ''

  if (ds.kind === 'summary') {
    const d = await fetch('/api/analise?type=summary', { cache: 'no-store' }).then(r => r.json())
    return [d]
  }

  if (ds.kind === 'exec_chart') {
    const params = new URLSearchParams({
      groupBy: ds.groupBy,
      field:   ds.field,
      topN:    String(ds.topN),
    })
    if (periods.length)     params.set('periodos', periods.join(','))
    if (ds.depts?.length)   params.set('depts',    ds.depts.join(','))
    if (ds.centros?.length) params.set('centros',  ds.centros.join(','))
    const d = await fetch(`/api/exec-chart?${params}`, { cache: 'no-store' }).then(r => r.json())
    return Array.isArray(d?.items) ? d.items : []
  }

  if (ds.kind === 'analise') {
    const params = new URLSearchParams()
    if (periods.length)    params.set('periodos',      periods.join(','))
    if (ds.depts?.length)  params.set('departamentos', ds.depts.join(','))
    const d = await fetch(`/api/analise?${params}`, { cache: 'no-store' }).then(r => r.json())
    return Array.isArray(d) ? d : []
  }

  if (ds.kind === 'medida') {
    const params = new URLSearchParams({
      type:         'medida',
      medidaId:     String(ds.medidaId),
      groupByPeriod: 'true',
    })
    if (periods.length) params.set('periodos', periods.join(','))
    const d = await fetch(`/api/analise?${params}${pp ? '' : ''}`, { cache: 'no-store' }).then(r => r.json())
    return Array.isArray(d) ? d : []
  }

  return []
}

// ─── Data transforms ──────────────────────────────────────────────────────────

type ChartRow = { name: string; value: number; budget?: number; razao?: number }

function toExecChartRows(raw: unknown[]): ChartRow[] {
  return (raw as Array<{ name?: string; value?: number; budget?: number; razao?: number }>).map(r => ({
    name:   String(r.name ?? ''),
    value:  Number(r.value ?? 0),
    budget: Number(r.budget ?? 0),
    razao:  Number(r.razao  ?? 0),
  }))
}

function toAnaliseByDept(raw: unknown[], field: 'razao' | 'budget' | 'variacao'): ChartRow[] {
  const acc: Record<string, { budget: number; razao: number }> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.nome_departamento ?? r.departamento ?? 'N/A')
    if (!acc[key]) acc[key] = { budget: 0, razao: 0 }
    acc[key].budget += Number(r.budget ?? 0)
    acc[key].razao  += Number(r.razao  ?? 0)
  }
  return Object.entries(acc)
    .map(([name, v]) => ({
      name,
      value: field === 'variacao' ? v.razao - v.budget : field === 'budget' ? v.budget : v.razao,
      budget: v.budget,
      razao:  v.razao,
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

function toAnaliseByPeriodo(raw: unknown[], field: 'razao' | 'budget' | 'variacao'): ChartRow[] {
  const acc: Record<string, { budget: number; razao: number }> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.periodo ?? '')
    if (!key) continue
    if (!acc[key]) acc[key] = { budget: 0, razao: 0 }
    acc[key].budget += Number(r.budget ?? 0)
    acc[key].razao  += Number(r.razao  ?? 0)
  }
  return Object.entries(acc)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, v]) => ({
      name:  formatPeriodo(periodo),
      value: field === 'variacao' ? v.razao - v.budget : field === 'budget' ? v.budget : v.razao,
      budget: v.budget,
      razao:  v.razao,
    }))
}

function toMedidaByPeriodo(raw: unknown[], viewField: string): ChartRow[] {
  const acc: Record<string, number> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.periodo ?? '')
    if (!key) continue
    acc[key] = (acc[key] ?? 0) + Number(r[viewField] ?? 0)
  }
  return Object.entries(acc)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, value]) => ({ name: formatPeriodo(periodo), value }))
}

// ─── KPI value ────────────────────────────────────────────────────────────────

function getKPIValue(config: WidgetConfig, raw: unknown[]): { value: number; delta?: number; deltaPct?: number } {
  const ds = config.dataSource

  if (ds.kind === 'summary') {
    const d = (raw[0] ?? {}) as Record<string, number>
    const value = d[ds.field] ?? 0
    return { value, delta: d.variacao, deltaPct: d.variacao_pct }
  }

  if (ds.kind === 'exec_chart') {
    const rows = toExecChartRows(raw)
    return { value: rows.reduce((s, r) => s + r.value, 0) }
  }

  if (ds.kind === 'analise') {
    const rows = raw as Array<Record<string, number>>
    const budget = rows.reduce((s, r) => s + (r.budget ?? 0), 0)
    const razao  = rows.reduce((s, r) => s + (r.razao  ?? 0), 0)
    const value  = ds.field === 'variacao' ? razao - budget : ds.field === 'budget' ? budget : razao
    const delta  = razao - budget
    const pct    = budget !== 0 ? (delta / Math.abs(budget)) * 100 : 0
    return { value, delta, deltaPct: pct }
  }

  if (ds.kind === 'medida') {
    const rows = raw as Array<Record<string, number>>
    return { value: rows.reduce((s, r) => s + (r[ds.viewField] ?? 0), 0) }
  }

  return { value: 0 }
}

// ─── Sub-widgets ──────────────────────────────────────────────────────────────

function SkeletonWidget({ h }: { h: number }) {
  return (
    <div
      className="animate-pulse rounded-xl"
      style={{ height: h * 80, backgroundColor: 'rgba(0,0,0,0.05)' }}
    />
  )
}

function ErrorWidget({ h }: { h: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{ height: h * 80 }}
    >
      <p style={{ fontSize: 12, color: '#dc2626', fontFamily: "'IBM Plex Mono', monospace" }}>
        Erro ao carregar dados
      </p>
    </div>
  )
}

function WidgetHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 8, paddingTop: 2 }}>
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: '#be8c4a',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{subtitle}</p>
      )}
    </div>
  )
}

function KPIWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const { value, delta, deltaPct } = getKPIValue(config, raw)
  const valueSizes = { sm: 24, md: 36, lg: 48, xl: 64 }
  const vSize = valueSizes[config.fontSize]
  const colors = SCHEMES[config.colorScheme]

  return (
    <div
      className="flex flex-col items-center justify-center p-4"
      style={{ height: config.h * 80 }}
    >
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: '#be8c4a',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {config.title}
      </p>
      {config.subtitle && (
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{config.subtitle}</p>
      )}
      <p
        className="font-bold mt-2"
        style={{ fontSize: vSize, lineHeight: 1, color: colors[0] === '#be8c4a' ? '#be8c4a' : '#0f172a' }}
      >
        {formatCurrency(value)}
      </p>
      {config.showDelta && delta !== undefined && (
        <div className="flex items-center gap-2 mt-2">
          <span
            style={{
              fontSize: 12,
              color: delta >= 0 ? '#16a34a' : '#dc2626',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
          </span>
          {deltaPct !== undefined && (
            <span
              style={{
                fontSize: 11,
                color: delta >= 0 ? '#16a34a' : '#dc2626',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              ({formatPct(deltaPct)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function BarWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds = config.dataSource
  const colors = SCHEMES[config.colorScheme]

  const chartData = (() => {
    if (ds.kind === 'exec_chart') return toExecChartRows(raw).slice(0, 12)
    if (ds.kind === 'analise')    return toAnaliseByDept(raw, ds.field).slice(0, 12)
    return (raw as ChartRow[]).slice(0, 12)
  })()

  const chartH = config.h * 80 - 50

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={chartData} margin={{ top: 0, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            angle={-20}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}K`}
            width={38}
          />
          <Tooltip
            formatter={(v: number) => [formatCurrency(v), 'Valor']}
            contentStyle={{ fontSize: 11, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8 }}
          />
          {config.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {chartData.map((_: unknown, i: number) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function LineWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds = config.dataSource
  const colors = SCHEMES[config.colorScheme]

  const chartData = (() => {
    if (ds.kind === 'analise') return toAnaliseByPeriodo(raw, ds.field)
    if (ds.kind === 'medida')  return toMedidaByPeriodo(raw, ds.viewField)
    if (ds.kind === 'exec_chart') return toExecChartRows(raw)
    return (raw as ChartRow[])
  })()

  const chartH = config.h * 80 - 50

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <LineChart data={chartData} margin={{ top: 0, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `${(Number(v) / 1000).toFixed(0)}K`}
            width={38}
          />
          <Tooltip
            formatter={(v: number) => [formatCurrency(v), 'Valor']}
            contentStyle={{ fontSize: 11, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8 }}
          />
          {config.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
          <Line
            type="monotone"
            dataKey="value"
            stroke={colors[0]}
            strokeWidth={2.2}
            dot={{ r: 2.5, fill: colors[0] }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function DonutWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds = config.dataSource
  const colors = SCHEMES[config.colorScheme]

  const chartData = (() => {
    if (ds.kind === 'exec_chart') return toExecChartRows(raw).slice(0, 8)
    if (ds.kind === 'analise')    return toAnaliseByDept(raw, ds.field).slice(0, 8)
    return (raw as ChartRow[]).slice(0, 8)
  })()

  const chartH = config.h * 80 - 50

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="52%"
            outerRadius="78%"
            paddingAngle={1.5}
          >
            {chartData.map((_: unknown, i: number) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => [formatCurrency(v), 'Valor']}
            contentStyle={{ fontSize: 11, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8 }}
          />
          {config.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function TableWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds = config.dataSource

  const rows = (() => {
    if (ds.kind === 'exec_chart') return toExecChartRows(raw).slice(0, 8)
    if (ds.kind === 'analise')    return toAnaliseByDept(raw, ds.field).slice(0, 8)
    return (raw as ChartRow[]).slice(0, 8)
  })()

  const tableH = config.h * 80 - 50

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <div style={{ height: tableH, overflowY: 'auto' }}>
        <table className="w-full" style={{ fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <th
                className="text-left pb-1.5 pr-3 font-medium"
                style={{ color: 'rgba(0,0,0,0.45)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}
              >
                Nome
              </th>
              <th
                className="text-right pb-1.5 font-medium"
                style={{ color: 'rgba(0,0,0,0.45)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10 }}
              >
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row: ChartRow, i: number) => (
              <tr key={i} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.04)' }}>
                <td
                  className="py-1.5 pr-3"
                  style={{
                    color: '#0f172a',
                    maxWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.name || '—'}
                </td>
                <td
                  className="text-right py-1.5"
                  style={{ color: '#0f172a', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}
                >
                  {formatCurrency(row.value)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={2} className="py-4 text-center" style={{ color: 'rgba(0,0,0,0.3)', fontSize: 12 }}>
                  Sem dados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TitleWidget({ config }: { config: WidgetConfig }) {
  const sizes = { sm: 18, md: 26, lg: 36, xl: 48 }

  return (
    <div
      className="flex flex-col justify-center px-6 py-4"
      style={{ height: config.h * 80 }}
    >
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: '#be8c4a',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        BI Canvas
      </p>
      <h2
        style={{
          fontSize: sizes[config.fontSize],
          fontWeight: 700,
          color: '#0f172a',
          lineHeight: 1.2,
        }}
      >
        {config.title}
      </h2>
      {config.subtitle && (
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', marginTop: 6 }}>
          {config.subtitle}
        </p>
      )}
    </div>
  )
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function OnePageWidgetRenderer({
  config,
  periods,
}: {
  config: WidgetConfig
  periods: string[]
}) {
  const [raw, setRaw]       = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (config.type === 'title') {
      setLoading(false)
      return
    }
    setLoading(true)
    setHasError(false)
    fetchWidgetData(config.dataSource, periods)
      .then(data => { setRaw(data); setLoading(false) })
      .catch(() => { setHasError(true); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(config.dataSource), JSON.stringify(periods), config.type])

  if (config.type === 'title') return <TitleWidget config={config} />
  if (loading)  return <SkeletonWidget h={config.h} />
  if (hasError) return <ErrorWidget h={config.h} />

  switch (config.type) {
    case 'kpi':    return <KPIWidget    config={config} raw={raw} />
    case 'bar':    return <BarWidget    config={config} raw={raw} />
    case 'line':   return <LineWidget   config={config} raw={raw} />
    case 'donut':  return <DonutWidget  config={config} raw={raw} />
    case 'table':  return <TableWidget  config={config} raw={raw} />
    default:       return null
  }
}
