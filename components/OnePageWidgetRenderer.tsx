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
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  Sector,
  TooltipProps,
} from 'recharts'
import { formatCurrency, formatPct, formatPeriodo } from '@/lib/utils'
import type { WidgetConfig, DataSource } from '@/lib/one-page-types'

// ─── Color palettes ───────────────────────────────────────────────────────────

const PALETTES: Record<string, string[]> = {
  default: ['#1A1820','#B8924A','#6B4E18','#334155','#166534','#B91C1C','#475569','#D97706','#064e3b','#7c3aed'],
  green:   ['#064e3b','#059669','#10b981','#34d399','#6ee7b7','#a7f3d0','#065f46','#059669'],
  gold:    ['#78350f','#d97706','#f59e0b','#fbbf24','#fde68a','#92400e','#b45309','#d97706'],
  blue:    ['#1e3a5f','#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#1e40af','#1d4ed8'],
  mono:    ['#1e293b','#334155','#475569','#64748b','#94a3b8','#cbd5e1','#1e293b','#334155'],
}
function getPalette(scheme: string): string[] {
  return PALETTES[scheme] ?? PALETTES.default
}

function tickFmt(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{ background: '#1A1820', borderRadius: 6, padding: '10px 14px', border: '0.5px solid rgba(184,146,74,0.25)', minWidth: 120 }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.7, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
        {d.name}
      </p>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: '#fff' }}>
        {formatCurrency(Number(d.value))}
      </p>
    </div>
  )
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function fetchWidgetData(ds: DataSource, periods: string[]): Promise<unknown[]> {
  if (ds.kind === 'summary') {
    const d = await fetch('/api/analise?type=summary', { cache: 'no-store' }).then(r => r.json())
    return [d]
  }

  if (ds.kind === 'exec_chart') {
    // When filtering by unidade de negócio, fetch all units and filter client-side
    const filteringByUnidade = (ds.filterUnidades?.length ?? 0) > 0
    const params = new URLSearchParams({
      groupBy: filteringByUnidade ? 'unidade_negocio' : ds.groupBy,
      field:   ds.field,
      topN:    filteringByUnidade ? '50' : String(ds.topN),
    })
    if (ds.sortOrder)               params.set('sortOrder',     ds.sortOrder)
    if (periods.length)             params.set('periodos',      periods.join(','))
    if (ds.filterDepts?.length)     params.set('departamentos', ds.filterDepts.join(','))
    if (ds.filterCentros?.length)   params.set('centros',       ds.filterCentros.join(','))
    if (ds.filterDreGroup)          params.set('dreGroup',      ds.filterDreGroup)
    const d = await fetch(`/api/exec-chart?${params}`, { cache: 'no-store' }).then(r => r.json())
    let items: { name: string; value: number; budget: number; razao: number }[] =
      Array.isArray(d?.items) ? d.items : []
    // Filter by unidade client-side if needed
    if (filteringByUnidade) {
      items = items.filter(r => ds.filterUnidades!.includes(r.name))
    }
    return items
  }

  if (ds.kind === 'analise') {
    const params = new URLSearchParams()
    if (periods.length)    params.set('periodos',      periods.join(','))
    if (ds.depts?.length)  params.set('departamentos', ds.depts.join(','))
    const d = await fetch(`/api/analise?${params}`, { cache: 'no-store' }).then(r => r.json())
    return Array.isArray(d) ? d : []
  }

  if (ds.kind === 'medida') {
    const gb = ds.medidaGroupBy ?? 'periodo'
    const params = new URLSearchParams({
      type:                'medida',
      medidaId:            String(ds.medidaId),
      groupByPeriod:       gb === 'periodo' ? 'true' : 'false',
      groupByDept:         gb === 'departamento' ? 'true' : 'false',
      groupByCentroCusto:  gb === 'centro_custo' ? 'true' : 'false',
    })
    if (periods.length) params.set('periodos', periods.join(','))
    const d = await fetch(`/api/analise?${params}`, { cache: 'no-store' }).then(r => r.json())
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

function toMedidaByCentroCusto(raw: unknown[], viewField: string): ChartRow[] {
  const acc: Record<string, number> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.nome_centro_custo ?? r.centro_custo ?? 'N/A')
    if (!key) continue
    acc[key] = (acc[key] ?? 0) + Number(r[viewField] ?? 0)
  }
  return Object.entries(acc)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

function toMedidaByDept(raw: unknown[], viewField: string): ChartRow[] {
  const acc: Record<string, number> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.nome_departamento ?? r.departamento ?? 'N/A')
    if (!key) continue
    acc[key] = (acc[key] ?? 0) + Number(r[viewField] ?? 0)
  }
  return Object.entries(acc)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

// ─── KPI value ────────────────────────────────────────────────────────────────

function getKPIValue(config: WidgetConfig, raw: unknown[]): { value: number; delta?: number; deltaPct?: number } {
  const ds = config.dataSource

  if (ds.kind === 'summary') {
    const d = (raw[0] ?? {}) as Record<string, number>
    const budget = d.total_budget ?? 0
    const razao  = d.total_razao  ?? 0
    const variacao = razao - budget
    const variacaoPct = budget !== 0 ? (variacao / Math.abs(budget)) * 100 : 0
    const fieldMap: Record<string, number> = {
      budget_ytd: budget, razao_ytd: razao,
      variacao: variacao, variacao_pct: variacaoPct,
    }
    return { value: fieldMap[ds.field] ?? 0, delta: variacao, deltaPct: variacaoPct }
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
    <div className="p-4 flex flex-col justify-end gap-2 pb-3" style={{ height: h * 80 }}>
      {[55, 75, 40, 90, 65].map((pct, i) => (
        <div key={i} className="rounded-sm animate-pulse w-full"
          style={{ height: `${Math.max(8, pct * 0.4)}px`, background: `rgba(184,146,74,${0.04 + i * 0.025})` }} />
      ))}
    </div>
  )
}

function ErrorWidget({ h }: { h: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl" style={{ height: h * 80 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#FBF7EE', border: '0.5px solid #E4DFD5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>⚠</span>
      </div>
      <p style={{ fontSize: 9, color: '#B8924A', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.15em', textTransform: 'uppercase', opacity: 0.4 }}>
        Erro ao carregar
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
  const colors = getPalette(config.colorScheme)

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
  const colors = getPalette(config.colorScheme)
  const showAxisX = config.showAxisX !== false
  const showAxisY = config.showAxisY !== false
  const showGrid = config.showGrid !== false

  const chartData = (() => {
    if (ds.kind === 'exec_chart') return toExecChartRows(raw).slice(0, 12)
    if (ds.kind === 'analise')    return toAnaliseByDept(raw, ds.field).slice(0, 12)
    if (ds.kind === 'medida') {
      const gb = ds.medidaGroupBy ?? 'periodo'
      if (gb === 'centro_custo') return toMedidaByCentroCusto(raw, ds.viewField).slice(0, 12)
      if (gb === 'departamento') return toMedidaByDept(raw, ds.viewField).slice(0, 12)
      return toMedidaByPeriodo(raw, ds.viewField).slice(0, 12)
    }
    return (raw as ChartRow[]).slice(0, 12)
  })()
  // use absolute values for chart display
  const absData = chartData.map(r => ({ ...r, absValue: Math.abs(r.value) }))

  const chartH = config.h * 80 - 50

  const barLabel = config.showDataLabels
    ? { formatter: (v: number) => tickFmt(v), position: 'top' as const, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fill: '#94a3b8' }
    : false

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={absData} margin={{ top: 14, right: 8, left: -10, bottom: 24 }}>
          {showGrid && <CartesianGrid vertical={false} stroke="#F0EDE8" strokeWidth={0.5} />}
          {showAxisX && (
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}
              axisLine={false}
              tickLine={false}
              angle={-30}
              textAnchor="end"
              interval={0}
              tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 11) + '…' : v}
            />
          )}
          {showAxisY && (
            <YAxis
              tickFormatter={tickFmt}
              tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}
              axisLine={false}
              tickLine={false}
            />
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(184,146,74,0.04)' }} />
          {config.showLegend && <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />}
          <Bar dataKey="absValue" radius={[2, 2, 0, 0]} maxBarSize={28} label={barLabel}>
            {absData.map((_: unknown, i: number) => (
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
  const colors = getPalette(config.colorScheme)
  const showAxisX = config.showAxisX !== false
  const showAxisY = config.showAxisY !== false
  const showGrid = config.showGrid !== false
  const areaColor = colors[0]

  const chartData = (() => {
    if (ds.kind === 'analise') return toAnaliseByPeriodo(raw, ds.field)
    if (ds.kind === 'medida') {
      const gb = ds.medidaGroupBy ?? 'periodo'
      if (gb === 'centro_custo') return toMedidaByCentroCusto(raw, ds.viewField)
      if (gb === 'departamento') return toMedidaByDept(raw, ds.viewField)
      return toMedidaByPeriodo(raw, ds.viewField)
    }
    if (ds.kind === 'exec_chart') return toExecChartRows(raw)
    return (raw as ChartRow[])
  })()

  const chartH = config.h * 80 - 50

  const areaLabel = config.showDataLabels
    ? { formatter: (v: number) => tickFmt(v), position: 'top' as const, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fill: '#94a3b8' }
    : false

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <AreaChart data={chartData} margin={{ top: 14, right: 8, left: -10, bottom: 24 }}>
          {showGrid && <CartesianGrid vertical={false} stroke="#F0EDE8" strokeWidth={0.5} />}
          {showAxisX && (
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}
              axisLine={false}
              tickLine={false}
            />
          )}
          {showAxisY && (
            <YAxis
              tickFormatter={tickFmt}
              tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}
              axisLine={false}
              tickLine={false}
            />
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: areaColor, strokeWidth: 1, strokeDasharray: '4 2' }} />
          {config.showLegend && <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />}
          <Area
            type="monotone"
            dataKey="value"
            stroke={areaColor}
            strokeWidth={2}
            fill={areaColor}
            fillOpacity={0.08}
            dot={{ fill: areaColor, r: 3.5, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: areaColor }}
            label={areaLabel}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function DonutWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds = config.dataSource
  const colors = getPalette(config.colorScheme)
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  const chartData = (() => {
    if (ds.kind === 'exec_chart') return toExecChartRows(raw).slice(0, 8)
    if (ds.kind === 'analise')    return toAnaliseByDept(raw, ds.field).slice(0, 8)
    if (ds.kind === 'medida') {
      const gb = ds.medidaGroupBy ?? 'periodo'
      if (gb === 'centro_custo') return toMedidaByCentroCusto(raw, ds.viewField).slice(0, 8)
      if (gb === 'departamento') return toMedidaByDept(raw, ds.viewField).slice(0, 8)
      return toMedidaByPeriodo(raw, ds.viewField).slice(0, 8)
    }
    return (raw as ChartRow[]).slice(0, 8)
  })()
  const absData = chartData.map(r => ({ ...r, absValue: Math.abs(r.value) }))
  const total = absData.reduce((s, r) => s + r.absValue, 0)

  const chartH = config.h * 80 - 50

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, percent, value } = props
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 5}
          startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.97}
          stroke="#fff" strokeWidth={1.5} />
        {innerRadius > 0 && (
          <>
            <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="central"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, fill: '#1A1820', pointerEvents: 'none' }}>
              {tickFmt(value)}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="central"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fill: '#B8924A', pointerEvents: 'none', letterSpacing: '0.06em' }}>
              {`${(percent * 100).toFixed(1)}%`}
            </text>
          </>
        )}
      </g>
    )
  }

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <PieChart>
          <Pie
            data={absData}
            dataKey="absValue"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="52%"
            outerRadius="78%"
            cornerRadius={6}
            paddingAngle={1.5}
            stroke="#fff"
            strokeWidth={2}
            activeIndex={activeIndex}
            activeShape={renderActiveShape}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(undefined)}
          >
            {absData.map((_: unknown, i: number) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          {config.showLegend && <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function TableWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds = config.dataSource

  const rows = (() => {
    if (ds.kind === 'exec_chart') return toExecChartRows(raw).slice(0, 20)
    if (ds.kind === 'analise')    return toAnaliseByDept(raw, ds.field).slice(0, 20)
    if (ds.kind === 'medida') {
      const gb = ds.medidaGroupBy ?? 'periodo'
      if (gb === 'centro_custo') return toMedidaByCentroCusto(raw, ds.viewField).slice(0, 20)
      if (gb === 'departamento') return toMedidaByDept(raw, ds.viewField).slice(0, 20)
      return toMedidaByPeriodo(raw, ds.viewField).slice(0, 20)
    }
    return (raw as ChartRow[]).slice(0, 20)
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
