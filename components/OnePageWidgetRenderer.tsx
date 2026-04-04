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
  Treemap,
  TooltipProps,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatCurrency, formatPct, formatPeriodo } from '@/lib/utils'
import type { WidgetConfig, DataSource } from '@/lib/one-page-types'

// ─── Color palettes ───────────────────────────────────────────────────────────

const PALETTES: Record<string, string[]> = {
  default: ['#1A1820','#B8924A','#6B4E18','#334155','#166534','#B91C1C','#475569','#D97706','#064e3b','#7c3aed'],
  green:   ['#064e3b','#059669','#10b981','#34d399','#6ee7b7','#a7f3d0','#065f46','#059669'],
  gold:    ['#78350f','#d97706','#f59e0b','#fbbf24','#fde68a','#92400e','#b45309','#d97706'],
  blue:    ['#1e3a5f','#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#1e40af','#1d4ed8'],
  mono:    ['#1e293b','#334155','#475569','#64748b','#94a3b8','#cbd5e1','#1e293b','#334155'],
  traffic: ['#16a34a','#65a30d','#ca8a04','#ea580c','#dc2626','#7c3aed','#0891b2','#0f172a'],
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

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function fetchWidgetData(ds: DataSource, periods: string[]): Promise<unknown[]> {
  if (ds.kind === 'summary') {
    const d = await fetch('/api/analise?type=summary', { cache: 'no-store' }).then(r => r.json())
    return [d]
  }

  if (ds.kind === 'exec_chart') {
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
      // Quando agrupando por cc ou dept, ainda agrupa por período = false para somar tudo
      groupByPeriod:       gb === 'periodo' ? 'true' : 'false',
      groupByDept:         gb === 'departamento' ? 'true' : 'false',
      groupByCentroCusto:  gb === 'centro_custo' ? 'true' : 'false',
    })
    if (periods.length)             params.set('periodos',      periods.join(','))
    if (ds.filterDepts?.length)     params.set('departamentos', ds.filterDepts.join(','))
    // filterCentros não tem suporte direto na API de medida; será filtrado client-side
    const d = await fetch(`/api/analise?${params}`, { cache: 'no-store' }).then(r => r.json())
    if (!Array.isArray(d)) return []
    // Client-side centro filter
    if (ds.filterCentros?.length) {
      return d.filter((r: Record<string,unknown>) =>
        ds.filterCentros!.includes(String(r.centro_custo ?? ''))
      )
    }
    return d
  }

  return []
}

// ─── Data transforms ──────────────────────────────────────────────────────────

type ChartRow = { name: string; value: number; budget?: number; razao?: number; varPct?: number }

function safePct(a: number, b: number) {
  if (!b) return 0
  return ((a - b) / Math.abs(b)) * 100
}

function toExecChartRows(raw: unknown[]): ChartRow[] {
  return (raw as Array<{ name?: string; value?: number; budget?: number; razao?: number }>).map(r => {
    const razao  = Number(r.razao  ?? r.value ?? 0)
    const budget = Number(r.budget ?? 0)
    return {
      name:   String(r.name ?? ''),
      value:  Number(r.value ?? razao),
      budget,
      razao,
      varPct: safePct(razao, budget),
    }
  })
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
  const acc: Record<string, { val: number; bud: number }> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.periodo ?? '')
    if (!key) continue
    if (!acc[key]) acc[key] = { val: 0, bud: 0 }
    acc[key].val += Number(r[viewField] ?? 0)
    acc[key].bud += Number(r['budget'] ?? 0)
  }
  return Object.entries(acc)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, { val, bud }]) => ({
      name: formatPeriodo(periodo),
      value: val,
      budget: bud,
      varPct: safePct(val, bud),
    }))
}

function toMedidaByCentroCusto(raw: unknown[], viewField: string): ChartRow[] {
  const acc: Record<string, { val: number; bud: number }> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.nome_centro_custo ?? r.centro_custo ?? 'N/A')
    if (!key) continue
    if (!acc[key]) acc[key] = { val: 0, bud: 0 }
    acc[key].val += Number(r[viewField] ?? 0)
    acc[key].bud += Number(r['budget'] ?? 0)
  }
  return Object.entries(acc)
    .map(([name, { val, bud }]) => ({
      name,
      value: val,
      budget: bud,
      varPct: safePct(val, bud),
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

function toMedidaByDept(raw: unknown[], viewField: string): ChartRow[] {
  const acc: Record<string, { val: number; bud: number }> = {}
  for (const r of raw as Array<Record<string, unknown>>) {
    const key = String(r.nome_departamento ?? r.departamento ?? 'N/A')
    if (!key) continue
    if (!acc[key]) acc[key] = { val: 0, bud: 0 }
    acc[key].val += Number(r[viewField] ?? 0)
    acc[key].bud += Number(r['budget'] ?? 0)
  }
  return Object.entries(acc)
    .map(([name, { val, bud }]) => ({
      name,
      value: val,
      budget: bud,
      varPct: safePct(val, bud),
    }))
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
    const razao  = rows.reduce((s, r) => s + (r.razao  ?? r.value), 0)
    const budget = rows.reduce((s, r) => s + (r.budget ?? 0), 0)
    const delta  = razao - budget
    return { value: razao, delta, deltaPct: safePct(razao, budget) }
  }

  if (ds.kind === 'analise') {
    const rows = raw as Array<Record<string, number>>
    const budget = rows.reduce((s, r) => s + (r.budget ?? 0), 0)
    const razao  = rows.reduce((s, r) => s + (r.razao  ?? 0), 0)
    const value  = ds.field === 'variacao' ? razao - budget : ds.field === 'budget' ? budget : razao
    const delta  = razao - budget
    return { value, delta, deltaPct: safePct(razao, budget) }
  }

  if (ds.kind === 'medida') {
    const rows = raw as Array<Record<string, number>>
    const razao  = rows.reduce((s, r) => s + (r['razao']  ?? 0), 0)
    const budget = rows.reduce((s, r) => s + (r['budget'] ?? 0), 0)
    const value  = rows.reduce((s, r) => s + (r[ds.viewField] ?? 0), 0)
    const delta  = razao - budget
    return { value, delta, deltaPct: safePct(razao, budget) }
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

function WidgetHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: string }) {
  return (
    <div style={{ marginBottom: 8, paddingTop: 2 }}>
      <div className="flex items-center gap-2">
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            color: '#be8c4a',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            lineHeight: 1.2,
          }}
        >
          {title}
        </p>
        {badge && (
          <span
            className="rounded px-1.5 py-0.5"
            style={{ fontSize: 8, backgroundColor: 'rgba(190,140,74,0.1)', color: '#9B6E20', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}
          >
            {badge}
          </span>
        )}
      </div>
      {subtitle && (
        <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>{subtitle}</p>
      )}
    </div>
  )
}

// Premium rich tooltip
function RichTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0f172a',
      borderRadius: 8,
      padding: '10px 14px',
      border: '0.5px solid rgba(184,146,74,0.2)',
      minWidth: 140,
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    }}>
      {label && (
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          {label}
        </p>
      )}
      {payload.map((d, i) => (
        <div key={i} className="flex items-center justify-between gap-4" style={{ marginTop: i > 0 ? 4 : 0 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}>{d.name}</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12, color: d.color ?? '#fff' }}>
            {formatCurrency(Number(d.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

function KPIWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const { value, delta, deltaPct } = getKPIValue(config, raw)
  const valueSizes = { sm: 20, md: 30, lg: 42, xl: 56 }
  const vSize = valueSizes[config.fontSize]
  const isPositive = (delta ?? 0) >= 0
  const isPct = config.dataSource.kind === 'summary' && config.dataSource.field === 'variacao_pct'

  return (
    <div
      className="flex flex-col justify-between p-5"
      style={{ height: config.h * 80, minHeight: 120 }}
    >
      <div>
        <p
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            color: '#9B6E20',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {config.title}
        </p>
        {config.subtitle && (
          <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>{config.subtitle}</p>
        )}
      </div>

      <div>
        <p
          className="font-bold tabular-nums"
          style={{
            fontSize: vSize,
            lineHeight: 1,
            color: '#0f172a',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {isPct ? `${value.toFixed(1)}%` : formatCurrency(value)}
        </p>

        {config.showDelta && delta !== undefined && deltaPct !== undefined && (
          <div className="flex items-center gap-2 mt-2">
            {isPositive
              ? <TrendingUp size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
              : <TrendingDown size={13} style={{ color: '#dc2626', flexShrink: 0 }} />
            }
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isPositive ? '#16a34a' : '#dc2626',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              {isPositive ? '+' : ''}{formatPct(deltaPct)} vs Budget
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function getChartRows(config: WidgetConfig, raw: unknown[]): ChartRow[] {
  const ds   = config.dataSource
  const topN = config.maxRows ?? 12
  if (ds.kind === 'exec_chart') return toExecChartRows(raw).slice(0, topN)
  if (ds.kind === 'analise') {
    return (ds.groupBy === 'periodo'
      ? toAnaliseByPeriodo(raw, ds.field)
      : toAnaliseByDept(raw, ds.field)
    ).slice(0, topN)
  }
  if (ds.kind === 'medida') {
    const gb = ds.medidaGroupBy ?? 'periodo'
    if (gb === 'centro_custo') return toMedidaByCentroCusto(raw, ds.viewField).slice(0, topN)
    if (gb === 'departamento') return toMedidaByDept(raw, ds.viewField).slice(0, topN)
    return toMedidaByPeriodo(raw, ds.viewField).slice(0, topN)
  }
  return (raw as ChartRow[]).slice(0, topN)
}

function showBudgetBars(ds: DataSource): boolean {
  if (ds.kind === 'medida')    return !!ds.showBudget
  if (ds.kind === 'exec_chart') return ds.field !== 'variacao'
  if (ds.kind === 'analise')    return ds.field !== 'variacao'
  return false
}

function BarWidget({ config, raw, horizontal = false }: { config: WidgetConfig; raw: unknown[]; horizontal?: boolean }) {
  const ds       = config.dataSource
  const colors   = getPalette(config.colorScheme)
  const showGrid = config.showGrid !== false
  const withBudget = showBudgetBars(ds)

  const chartData = getChartRows(config, raw)
  const absData   = chartData.map(r => ({
    ...r,
    absValue:    Math.abs(r.value),
    absBudget:   Math.abs(r.budget ?? 0),
  }))

  const chartH = config.h * 80 - 48

  const labelStyle = config.showDataLabels
    ? { formatter: (v: number) => tickFmt(v), position: horizontal ? 'right' as const : 'top' as const, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fill: '#94a3b8' }
    : false

  if (horizontal) {
    return (
      <div className="p-4" style={{ height: config.h * 80 }}>
        <WidgetHeader title={config.title} subtitle={config.subtitle} />
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart
            data={absData}
            layout="vertical"
            margin={{ top: 4, right: withBudget ? 12 : 40, left: 4, bottom: 4 }}
            barCategoryGap="20%"
          >
            {showGrid && <CartesianGrid horizontal={false} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5} />}
            <XAxis type="number" tickFormatter={tickFmt} tick={{ fontSize: 8, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 9, fill: '#374151', fontFamily: "'IBM Plex Mono', monospace" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
            />
            <Tooltip content={<RichTooltip />} cursor={{ fill: 'rgba(184,146,74,0.04)' }} />
            {config.showLegend && withBudget && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }} />}
            <Bar dataKey="absValue" name="Realizado" radius={[0, 2, 2, 0]} maxBarSize={14} label={labelStyle}>
              {absData.map((_: unknown, i: number) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Bar>
            {withBudget && (
              <Bar dataKey="absBudget" name="Budget" radius={[0, 2, 2, 0]} maxBarSize={14} fill="rgba(0,0,0,0.1)" />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={absData} margin={{ top: 14, right: 8, left: -10, bottom: 28 }} barCategoryGap="25%">
          {showGrid && <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5} />}
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
          <YAxis
            tickFormatter={tickFmt}
            tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<RichTooltip />} cursor={{ fill: 'rgba(184,146,74,0.04)' }} />
          {config.showLegend && withBudget && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }} />}
          <Bar dataKey="absValue" name="Realizado" radius={[3, 3, 0, 0]} maxBarSize={withBudget ? 16 : 28} label={labelStyle}>
            {absData.map((_: unknown, i: number) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
          {withBudget && (
            <Bar dataKey="absBudget" name="Budget" radius={[3, 3, 0, 0]} maxBarSize={16} fill="rgba(0,0,0,0.12)" />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function LineWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds         = config.dataSource
  const colors     = getPalette(config.colorScheme)
  const showGrid   = config.showGrid !== false
  const areaColor  = colors[0]
  const budgetColor = 'rgba(0,0,0,0.2)'
  const withBudget = showBudgetBars(ds)

  const chartData  = getChartRows(config, raw)
  const chartH     = config.h * 80 - 48

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <AreaChart data={chartData} margin={{ top: 14, right: 8, left: -10, bottom: 24 }}>
          {showGrid && <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.05)" strokeWidth={0.5} />}
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={tickFmt}
            tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<RichTooltip />} cursor={{ stroke: areaColor, strokeWidth: 1, strokeDasharray: '4 2' }} />
          {withBudget && config.showLegend && <Legend wrapperStyle={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }} />}
          {withBudget && (
            <Area
              type="monotone"
              dataKey="budget"
              name="Budget"
              stroke={budgetColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              fill="transparent"
              dot={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            name="Realizado"
            stroke={areaColor}
            strokeWidth={2.5}
            fill={areaColor}
            fillOpacity={0.07}
            dot={{ fill: areaColor, r: 3, strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: areaColor }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function PieDonutWidget({ config, raw, donut }: { config: WidgetConfig; raw: unknown[]; donut: boolean }) {
  const colors = getPalette(config.colorScheme)
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  const chartData = getChartRows(config, raw).slice(0, 10)
  const absData   = chartData.map(r => ({ ...r, absValue: Math.abs(r.value) }))
  const chartH    = config.h * 80 - 48

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, percent, value } = props
    return (
      <g>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 5}
          startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.97}
          stroke="#fff" strokeWidth={1.5} />
        {donut && (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="central"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12, fill: '#0f172a', pointerEvents: 'none' }}>
              {tickFmt(value)}
            </text>
            <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central"
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
            innerRadius={donut ? '46%' : '0%'}
            outerRadius="75%"
            cornerRadius={donut ? 5 : 2}
            paddingAngle={donut ? 2 : 0.5}
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
          <Tooltip content={<RichTooltip />} />
          {config.showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}
              formatter={(v: string) => v.length > 20 ? v.slice(0, 19) + '…' : v}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TreemapContent(props: any) {
  const { x, y, width, height, name, value, depth, colors } = props
  if (width < 30 || height < 18) return null
  return (
    <g>
      <rect
        x={x + 1} y={y + 1}
        width={width - 2} height={height - 2}
        style={{ fill: colors[depth % colors.length], stroke: '#fff', strokeWidth: 2 }}
        rx={4}
      />
      {width > 50 && height > 28 && (
        <>
          <text
            x={x + 8} y={y + 16}
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: Math.min(11, width / 8), fill: '#fff', fontWeight: 700, pointerEvents: 'none' }}
          >
            {name?.length > 14 ? name.slice(0, 13) + '…' : name}
          </text>
          {height > 40 && (
            <text
              x={x + 8} y={y + 30}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fill: 'rgba(255,255,255,0.75)', pointerEvents: 'none' }}
            >
              {tickFmt(value)}
            </text>
          )}
        </>
      )}
    </g>
  )
}

function TreemapWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const colors  = getPalette(config.colorScheme)
  const chartData = getChartRows(config, raw).slice(0, 20)
  const treemapData = chartData.map(r => ({ name: r.name, size: Math.abs(r.value) }))
  const chartH = config.h * 80 - 48

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <ResponsiveContainer width="100%" height={chartH}>
        <Treemap
          data={treemapData}
          dataKey="size"
          nameKey="name"
          aspectRatio={4 / 3}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={(props: any) => <TreemapContent {...props} colors={colors} />}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as { name: string; size: number }
              return (
                <div style={{ background: '#0f172a', borderRadius: 6, padding: '8px 12px', border: '0.5px solid rgba(184,146,74,0.2)' }}>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#94a3b8', marginBottom: 3 }}>{d.name}</p>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12, color: '#fff' }}>{formatCurrency(d.size)}</p>
                </div>
              )
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}

function TableWidget({ config, raw }: { config: WidgetConfig; raw: unknown[] }) {
  const ds       = config.dataSource
  const withBud  = showBudgetBars(ds)
  const rows     = getChartRows(config, raw)
  const tableH   = config.h * 80 - 52
  const maxVal   = Math.max(...rows.map(r => Math.abs(r.value)), 1)

  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th
      className={right ? 'text-right pb-2' : 'text-left pb-2'}
      style={{ color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', fontWeight: 600 }}
    >
      {children}
    </th>
  )

  return (
    <div className="p-4" style={{ height: config.h * 80 }}>
      <WidgetHeader title={config.title} subtitle={config.subtitle} />
      <div style={{ height: tableH, overflowY: 'auto' }}>
        <table className="w-full border-collapse" style={{ fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
            <tr style={{ borderBottom: '1.5px solid rgba(0,0,0,0.07)' }}>
              <TH>#</TH>
              <TH>Nome</TH>
              <TH right>Realizado</TH>
              {withBud && <TH right>Budget</TH>}
              {withBud && <TH right>Var %</TH>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: ChartRow, i: number) => {
              const vp = row.varPct ?? 0
              const barW = Math.max(2, (Math.abs(row.value) / maxVal) * 100)
              return (
                <tr
                  key={i}
                  style={{ borderBottom: '0.5px solid rgba(0,0,0,0.04)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(190,140,74,0.04)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                >
                  <td style={{ padding: '6px 6px 6px 0', color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, width: 20 }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '6px 8px 6px 0', maxWidth: 0, overflow: 'hidden', width: '99%' }}>
                    <div className="flex flex-col gap-0.5">
                      <span style={{ color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.name || '—'}
                      </span>
                      <div style={{ height: 2, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barW}%`, backgroundColor: row.value >= 0 ? '#be8c4a' : '#dc2626', borderRadius: 1 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 0 6px 8px', color: '#0f172a', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                    {formatCurrency(row.value)}
                  </td>
                  {withBud && (
                    <td style={{ textAlign: 'right', padding: '6px 0 6px 8px', color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap' }}>
                      {formatCurrency(row.budget ?? 0)}
                    </td>
                  )}
                  {withBud && (
                    <td style={{ textAlign: 'right', padding: '6px 0 6px 0', whiteSpace: 'nowrap' }}>
                      <span className="flex items-center justify-end gap-1">
                        {vp > 1 ? <TrendingUp size={9} style={{ color: '#16a34a', flexShrink: 0 }} />
                          : vp < -1 ? <TrendingDown size={9} style={{ color: '#dc2626', flexShrink: 0 }} />
                          : <Minus size={9} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                        <span style={{ fontSize: 10, color: vp > 1 ? '#16a34a' : vp < -1 ? '#dc2626' : '#64748b', fontFamily: "'IBM Plex Mono', monospace" }}>
                          {vp > 0 ? '+' : ''}{vp.toFixed(1)}%
                        </span>
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={withBud ? 5 : 3} className="py-6 text-center" style={{ color: 'rgba(0,0,0,0.3)' }}>
                  Nenhum dado disponível
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
  const sizes = { sm: 16, md: 24, lg: 34, xl: 46 }
  const ds = config.dataSource
  const text = ds.kind === 'static' ? ds.value : ''

  return (
    <div
      className="flex flex-col justify-center px-6 py-4"
      style={{ height: config.h * 80, minHeight: 60 }}
    >
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 8,
          color: '#be8c4a',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        One Page · BI
      </p>
      <h2
        style={{
          fontSize: sizes[config.fontSize],
          fontWeight: 700,
          color: '#0f172a',
          lineHeight: 1.2,
        }}
      >
        {config.title || text || 'Título'}
      </h2>
      {config.subtitle && (
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
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
  const [raw, setRaw]         = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (config.type === 'title') { setLoading(false); return }
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
    case 'kpi':     return <KPIWidget                           config={config} raw={raw} />
    case 'bar':     return <BarWidget                           config={config} raw={raw} />
    case 'bar_h':   return <BarWidget horizontal                config={config} raw={raw} />
    case 'line':    return <LineWidget                          config={config} raw={raw} />
    case 'pie':     return <PieDonutWidget donut={false}        config={config} raw={raw} />
    case 'donut':   return <PieDonutWidget donut                config={config} raw={raw} />
    case 'treemap': return <TreemapWidget                       config={config} raw={raw} />
    case 'table':   return <TableWidget                         config={config} raw={raw} />
    default:        return null
  }
}
