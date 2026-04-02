'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  PieChart, Pie, Cell, Sector, BarChart, Bar,
  AreaChart, Area,
  Treemap,
  ReferenceLine,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, TooltipProps,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { Plus, X, Settings2, RefreshCw, PieChart as PieIcon, BarChart2, BarChart3, Donut, TrendingUp, LayoutGrid, Download } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecChartConfig {
  id: string
  title: string
  chartType: 'pie' | 'donut' | 'bar_h' | 'bar_v' | 'area' | 'treemap'
  field: 'razao' | 'budget' | 'variacao'
  topN: number
  sortOrder: 'desc' | 'asc'
  departamentos: string[]
  dreGroup: string
  palette: string
  valueFormat: 'currency' | 'percent'
  labelPosition: 'inside' | 'outside' | 'none'
  groupBy: 'agrupamento_arvore' | 'dre' | 'conta_contabil' | 'centro_custo' | 'contrapartida' | 'departamento' | 'unidade_negocio'
  referenceLine?: { value: number; label: string }
}

interface ChartItem {
  name: string
  budget: number
  razao: number
  variacao: number
  value: number
}

// ─── Palettes ─────────────────────────────────────────────────────────────────

const PALETTES: Record<string, { label: string; colors: string[] }> = {
  glorioso: {
    label: 'Glorioso',
    colors: ['#1A1820','#B8924A','#6B4E18','#334155','#166534','#B91C1C','#475569','#D97706','#064e3b','#7c3aed'],
  },
  mixed: {
    label: 'Variado',
    colors: ['#334155','#1d4ed8','#059669','#d97706','#e11d48','#7c3aed','#0891b2','#065f46','#92400e','#9f1239'],
  },
  slate: {
    label: 'Cinza',
    colors: ['#1e293b','#334155','#475569','#64748b','#94a3b8','#cbd5e1','#1e293b','#334155','#475569','#64748b'],
  },
  blue: {
    label: 'Azul',
    colors: ['#1e3a5f','#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#1e40af','#1d4ed8','#2563eb','#3b82f6'],
  },
  emerald: {
    label: 'Verde',
    colors: ['#064e3b','#059669','#10b981','#34d399','#6ee7b7','#a7f3d0','#065f46','#059669','#10b981','#34d399'],
  },
  amber: {
    label: 'Âmbar',
    colors: ['#78350f','#d97706','#f59e0b','#fbbf24','#fde68a','#92400e','#b45309','#d97706','#f59e0b','#fbbf24'],
  },
  rose: {
    label: 'Vermelho',
    colors: ['#881337','#e11d48','#f43f5e','#fb7185','#fda4af','#9f1239','#be123c','#e11d48','#f43f5e','#fb7185'],
  },
}

const DEFAULT_PALETTE = 'glorioso'

function getPalette(key: string): string[] {
  return (PALETTES[key] ?? PALETTES[DEFAULT_PALETTE]).colors
}

const FIELD_LABELS: Record<ExecChartConfig['field'], string> = {
  razao:    'Realizado',
  budget:   'Budget',
  variacao: 'Variação',
}

const CHART_TYPES: { id: ExecChartConfig['chartType']; label: string; icon: React.ElementType }[] = [
  { id: 'pie',     label: 'Pizza',      icon: PieIcon    },
  { id: 'donut',   label: 'Rosca',      icon: Donut      },
  { id: 'bar_h',   label: 'Barras (H)', icon: BarChart2  },
  { id: 'bar_v',   label: 'Barras (V)', icon: BarChart3  },
  { id: 'area',    label: 'Área',       icon: TrendingUp },
  { id: 'treemap', label: 'Mapa',       icon: LayoutGrid },
]

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ExecTooltip({
  active, payload,
  valueFormat, total,
}: TooltipProps<number, string> & { valueFormat: 'currency' | 'percent'; total: number }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const val = Number(d.value)
  const display = valueFormat === 'percent'
    ? `${total > 0 ? ((val / total) * 100).toFixed(1) : 0}%`
    : formatCurrency(val)
  return (
    <div style={{ background: '#1A1820', borderRadius: 6, padding: '10px 14px', border: '0.5px solid rgba(184,146,74,0.25)', minWidth: 160 }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.7, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{d.name}</p>
      <p style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: 18, color: '#fff', letterSpacing: '-0.01em' }}>{display}</p>
    </div>
  )
}

// ─── Single chart card ────────────────────────────────────────────────────────

function ExecChartCard({
  config, selPeriodos, allDepts, canEdit, contextDept,
  onEdit, onDelete,
}: {
  config: ExecChartConfig
  selPeriodos: string[]
  allDepts: string[]
  canEdit: boolean
  contextDept: string
  onEdit: () => void
  onDelete: () => void
}) {
  const [items,       setItems]       = useState<ChartItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)
  const chartRef = useRef<HTMLDivElement>(null)

  const exportPng = useCallback(() => {
    const container = chartRef.current
    if (!container) return
    const svg = container.querySelector('svg')
    if (!svg) return

    const { width, height } = svg.getBoundingClientRect()
    const clone = svg.cloneNode(true) as SVGElement
    // Inline background so PNG isn't transparent
    clone.setAttribute('style', 'background:#fff')
    clone.setAttribute('width', String(Math.ceil(width)))
    clone.setAttribute('height', String(Math.ceil(height)))

    const xml = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const img  = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale  = 2 // retina
      canvas.width  = Math.ceil(width)  * scale
      canvas.height = Math.ceil(height) * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      const link = document.createElement('a')
      link.download = `${config.title.replace(/\s+/g, '_')}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
    img.src = url
  }, [config.title])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ topN: String(config.topN), field: config.field, sortOrder: config.sortOrder ?? 'desc' })
      // Always scope to the dept context — if config has explicit depts, use those;
      // otherwise fall back to the page's dept (so master sees per-dept data too)
      const depts = config.departamentos.length
        ? config.departamentos
        : contextDept !== '__dashboard__' ? [contextDept] : []
      if (depts.length)       p.set('departamentos', depts.join(','))
      if (selPeriodos.length) p.set('periodos',      selPeriodos.join(','))
      if (config.dreGroup)    p.set('dreGroup',      config.dreGroup)
      if (config.groupBy && config.groupBy !== 'agrupamento_arvore')
        p.set('groupBy', config.groupBy)
      const res = await fetch(`/api/exec-chart?${p}`, { cache: 'no-store' })
      if (res.ok) {
        const { items: d } = await res.json()
        setItems(d ?? [])
      }
    } catch {
      // network error — leave items as-is
    } finally {
      setLoading(false)
    }
  }, [config, selPeriodos, contextDept])

  useEffect(() => { load() }, [load])

  const palette    = getPalette(config.palette ?? DEFAULT_PALETTE)
  const fieldLabel = FIELD_LABELS[config.field]
  const vf         = config.valueFormat   ?? 'currency'
  const lp         = config.labelPosition ?? 'inside'

  const absItems = items.map(it => ({ ...it, absValue: Math.abs(it.value) }))
  const total    = absItems.reduce((s, it) => s + it.absValue, 0)

  const tickFmt = (v: number) => {
    if (vf === 'percent') return `${total > 0 ? ((v / total) * 100).toFixed(0) : 0}%`
    const a = Math.abs(v)
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
    return String(v)
  }

  const tooltip = <ExecTooltip valueFormat={vf} total={total} />

  const refLine = config.referenceLine?.value != null ? (
    <ReferenceLine
      y={config.referenceLine.value}
      stroke="#f59e0b"
      strokeWidth={1.5}
      strokeDasharray="5 3"
      label={{ value: config.referenceLine.label || '', position: 'insideTopRight', fontSize: 9, fill: '#f59e0b', fontWeight: 600 }}
    />
  ) : null

  // Horizontal bar uses x= for the reference axis
  const refLineH = config.referenceLine?.value != null ? (
    <ReferenceLine
      x={config.referenceLine.value}
      stroke="#f59e0b"
      strokeWidth={1.5}
      strokeDasharray="5 3"
      label={{ value: config.referenceLine.label || '', position: 'insideTopRight', fontSize: 9, fill: '#f59e0b', fontWeight: 600 }}
    />
  ) : null

  // Inside labels only — clean, no connector lines
  // Threshold: 8% for inside (enough room to read), 5% for outside (text only, no lines)
  const renderPieLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent, value,
  }: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; value: number }) => {
    if (lp === 'none') return null
    const RADIAN = Math.PI / 180
    const label  = vf === 'percent' ? `${(percent * 100).toFixed(0)}%` : tickFmt(value)

    if (lp !== 'outside') {
      // Inside: only show when slice is big enough to fit the text
      if (percent < 0.08) return null
      const r = innerRadius + (outerRadius - innerRadius) * 0.55
      const x = cx + r * Math.cos(-midAngle * RADIAN)
      const y = cy + r * Math.sin(-midAngle * RADIAN)
      return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
          fontSize={11} fontWeight={700} style={{ pointerEvents: 'none' }}>
          {label}
        </text>
      )
    }

    // Outside: text-only label at fixed distance, no connector lines
    if (percent < 0.05) return null
    const r      = outerRadius + 16
    const x      = cx + r * Math.cos(-midAngle * RADIAN)
    const y      = cy + r * Math.sin(-midAngle * RADIAN)
    const anchor = x > cx ? 'start' : 'end'
    return (
      <text x={x} y={y} fill="#475569" textAnchor={anchor} dominantBaseline="central"
        fontSize={9} fontWeight={600} style={{ pointerEvents: 'none' }}>
        {label}
      </text>
    )
  }

  const barLabel = lp !== 'none'
    ? { formatter: (v: number) => tickFmt(v), fontSize: 9, fill: '#64748b' }
    : false


  // Area chart uses the first palette color
  const areaColor = palette[0]

  // ── Active shape (hover effect on pie/donut) ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, percent, value } = props
    return (
      <g>
        <Sector
          cx={cx} cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 5}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          opacity={0.97}
          stroke="#fff"
          strokeWidth={1.5}
        />
        {innerRadius > 0 && (
          <>
            <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="central"
              style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: 15, fill: '#1A1820', pointerEvents: 'none', letterSpacing: '-0.01em' }}>
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
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
        <div className="min-w-0">
          <p className="truncate leading-none" style={{
            fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900,
            fontSize: '13px', letterSpacing: '-0.01em', textTransform: 'uppercase', color: '#1A1820',
          }}>{config.title}</p>
          <p className="mt-1.5" style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px',
            letterSpacing: '0.1em', color: '#B8924A', opacity: 0.6, textTransform: 'uppercase',
          }}>
            {fieldLabel} · Top {config.topN}
            {config.groupBy && config.groupBy !== 'agrupamento_arvore' && ` · ${{
              dre:             'DRE',
              conta_contabil:  'Conta',
              centro_custo:    'C. Custo',
              contrapartida:   'Contrapartida',
              departamento:    'Dept.',
              unidade_negocio: 'Unidade',
            }[config.groupBy]}`}
            {config.dreGroup && ` · ${config.dreGroup}`}
          </p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-3">
          <button onClick={load}
            className="p-1.5 rounded transition-colors"
            style={{ color: '#B8924A', opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
            title="Atualizar">
            <RefreshCw size={11} />
          </button>
          {!loading && items.length > 0 && (
            <button onClick={exportPng}
              className="p-1.5 rounded transition-colors"
              style={{ color: '#B8924A', opacity: 0.4 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
              title="Exportar PNG">
              <Download size={11} />
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={onEdit}
                className="p-1.5 rounded transition-colors"
                style={{ color: '#B8924A', opacity: 0.4 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
                <Settings2 size={11} />
              </button>
              <button onClick={onDelete}
                className="p-1.5 rounded transition-colors"
                style={{ color: '#B8924A', opacity: 0.4 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.4')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}>
                <X size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      <CardContent className="p-4">
        {loading ? (
          <div className="h-[220px] flex flex-col justify-end gap-2 pb-3 px-2">
            {[55, 75, 40, 90, 65].map((h, i) => (
              <div key={i} className="rounded-sm animate-pulse w-full"
                style={{ height: `${h * 1.6}px`, maxHeight: 36, background: `rgba(184,146,74,${0.04 + i * 0.025})` }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="h-[220px] flex flex-col items-center justify-center gap-3">
            <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#FBF7EE', border: '0.5px solid #E4DFD5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart2 size={18} style={{ color: '#B8924A', opacity: 0.4 }} />
            </div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: '#B8924A', opacity: 0.35, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Sem dados</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div ref={chartRef}>
            <ResponsiveContainer width="100%" height={200}>
              {(config.chartType === 'pie' || config.chartType === 'donut') ? (
                <PieChart>
                  <Pie
                    data={absItems}
                    dataKey="absValue"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={config.chartType === 'donut' ? '46%' : 0}
                    outerRadius={lp === 'outside' ? '60%' : '78%'}
                    labelLine={false}
                    label={lp !== 'none' ? renderPieLabel : false}
                    strokeWidth={2}
                    stroke="#fff"
                    activeIndex={activeIndex}
                    activeShape={renderActiveShape}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(undefined)}
                  >
                    {absItems.map((_, i) => (
                      <Cell key={i} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={tooltip} />
                </PieChart>
              ) : config.chartType === 'bar_h' ? (
                <BarChart data={absItems} layout="vertical" margin={{ top: 0, right: 52, left: 0, bottom: 0 }}>
                  <defs>
                    {absItems.map((_, i) => (
                      <linearGradient key={i} id={`hg-${config.id}-${i}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={palette[i % palette.length]} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={palette[i % palette.length]} stopOpacity={1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis type="number" tickFormatter={tickFmt} tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9, fill: '#475569', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: string) => v.length > 17 ? v.slice(0, 16) + '…' : v} />
                  <Tooltip content={tooltip} cursor={{ fill: 'rgba(184,146,74,0.04)' }} />
                  <Bar dataKey="absValue" name={fieldLabel} radius={[0,5,5,0]} maxBarSize={16}
                    label={barLabel ? { ...barLabel, position: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fill: '#94a3b8' } : false}>
                    {absItems.map((_, i) => (
                      <Cell key={i} fill={`url(#hg-${config.id}-${i})`} />
                    ))}
                  </Bar>
                  {refLineH}
                </BarChart>
              ) : config.chartType === 'area' ? (
                <AreaChart data={absItems} margin={{ top: 14, right: 8, left: -10, bottom: 24 }}>
                  <defs>
                    <linearGradient id={`ag-${config.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={areaColor} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0}
                    tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 11) + '…' : v} />
                  <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
                  <Tooltip content={tooltip} cursor={{ stroke: areaColor, strokeWidth: 1, strokeDasharray: '4 2' }} />
                  <Area
                    type="monotone"
                    dataKey="absValue"
                    name={fieldLabel}
                    stroke={areaColor}
                    strokeWidth={2}
                    fill={`url(#ag-${config.id})`}
                    dot={{ fill: areaColor, r: 3.5, strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: areaColor }}
                    label={barLabel ? { ...barLabel, position: 'top', fontFamily: "'IBM Plex Mono', monospace" } : false}
                  />
                  {refLine}
                </AreaChart>
              ) : config.chartType === 'treemap' ? (
                <Treemap
                  data={absItems.map((it, i) => ({ ...it, fill: palette[i % palette.length] }))}
                  dataKey="absValue"
                  nameKey="name"
                  aspectRatio={4 / 3}
                  stroke="#fff"
                  strokeWidth={2}
                  content={({ x, y, width, height, name, fill: cellFill, absValue }: {
                    x?: number; y?: number; width?: number; height?: number
                    name?: string; fill?: string; absValue?: number
                  }) => {
                    const px = x ?? 0; const py = y ?? 0
                    const pw = width ?? 0; const ph = height ?? 0
                    if (pw < 4 || ph < 4) return <g />
                    const label = vf === 'percent'
                      ? `${total > 0 ? (((absValue ?? 0) / total) * 100).toFixed(1) : 0}%`
                      : tickFmt(absValue ?? 0)
                    const showLabel = pw > 36 && ph > 20
                    const showName  = pw > 52 && ph > 36
                    const charsPerPx = 5.5
                    const maxChars = Math.floor(pw / charsPerPx)
                    const truncated = (name ?? '').length > maxChars ? (name ?? '').slice(0, maxChars - 1) + '…' : (name ?? '')
                    // Semi-transparent bg for text contrast
                    const textH = (showName && showLabel) ? 28 : 16
                    const textY = py + ph / 2 - textH / 2
                    return (
                      <g>
                        <rect x={px} y={py} width={pw} height={ph} fill={cellFill} rx={3} ry={3} />
                        {showName && (
                          <text x={px + pw / 2} y={textY + 10} textAnchor="middle"
                            fill="rgba(255,255,255,0.9)" fontSize={9} fontWeight="normal" style={{ pointerEvents: 'none', fontFamily: 'inherit' }}>
                            {truncated}
                          </text>
                        )}
                        {showLabel && (
                          <text x={px + pw / 2} y={showName ? textY + 24 : textY + 10} textAnchor="middle"
                            fill="rgba(255,255,255,0.75)" fontSize={9} fontWeight="normal" style={{ pointerEvents: 'none', fontFamily: 'inherit' }}>
                            {label}
                          </text>
                        )}
                      </g>
                    )
                  }}
                >
                  <Tooltip content={tooltip} />
                </Treemap>
              ) : (
                <BarChart data={absItems} margin={{ top: 14, right: 8, left: -10, bottom: 24 }}>
                  <defs>
                    {absItems.map((_, i) => (
                      <linearGradient key={i} id={`vg-${config.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={palette[i % palette.length]} stopOpacity={1} />
                        <stop offset="100%" stopColor={palette[i % palette.length]} stopOpacity={0.65} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0}
                    tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 11) + '…' : v} />
                  <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
                  <Tooltip content={tooltip} cursor={{ fill: 'rgba(184,146,74,0.04)' }} />
                  <Bar dataKey="absValue" name={fieldLabel} radius={[4,4,0,0]} maxBarSize={28}
                    label={barLabel ? { ...barLabel, position: 'top', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fill: '#94a3b8' } : false}>
                    {absItems.map((_, i) => (
                      <Cell key={i} fill={`url(#vg-${config.id}-${i})`} />
                    ))}
                  </Bar>
                  {refLine}
                </BarChart>
              )}
            </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1" style={{ borderTop: '0.5px solid #F0EDE8' }}>
              {items.map((it, i) => {
                const pct = total > 0 ? ((Math.abs(it.value) / total) * 100).toFixed(0) : '0'
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="flex-shrink-0 rounded-sm" style={{ width: 3, height: 14, background: palette[i % palette.length] }} />
                    <span className="truncate max-w-[90px]" title={it.name}
                      style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#475569' }}>{it.name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.6 }}>
                      {pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Config modal ─────────────────────────────────────────────────────────────

function ConfigModal({
  config, allDepts, onSave, onClose, isMasterContext,
}: {
  config: ExecChartConfig | null
  allDepts: string[]
  onSave: (c: ExecChartConfig) => void
  onClose: () => void
  isMasterContext: boolean
}) {
  const [title,         setTitle]         = useState(config?.title         ?? '')
  const [chartType,     setChartType]     = useState<ExecChartConfig['chartType']>(config?.chartType     ?? 'bar_h')
  const [field,         setField]         = useState<ExecChartConfig['field']>(config?.field             ?? 'razao')
  const [topN,          setTopN]          = useState(config?.topN          ?? 5)
  const [sortOrder,     setSortOrder]     = useState<ExecChartConfig['sortOrder']>(config?.sortOrder     ?? 'desc')
  const [departamentos, setDepartamentos] = useState<string[]>(config?.departamentos                     ?? [])
  const [dreGroup,      setDreGroup]      = useState(config?.dreGroup      ?? '')
  const [palette,       setPalette]       = useState(config?.palette       ?? DEFAULT_PALETTE)
  const [valueFormat,   setValueFormat]   = useState<ExecChartConfig['valueFormat']>(config?.valueFormat   ?? 'currency')
  const [labelPosition, setLabelPosition] = useState<ExecChartConfig['labelPosition']>(config?.labelPosition ?? 'inside')
  const [groupBy,       setGroupBy]       = useState<ExecChartConfig['groupBy']>(config?.groupBy    ?? 'agrupamento_arvore')
  const [dreGroups,     setDreGroups]     = useState<string[]>([])
  const [refLineValue,  setRefLineValue]  = useState<string>(config?.referenceLine?.value != null ? String(config.referenceLine.value) : '')
  const [refLineLabel,  setRefLineLabel]  = useState(config?.referenceLine?.label ?? '')

  useEffect(() => {
    fetch('/api/exec-chart?topN=1&field=razao')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.dreGroups) setDreGroups(d.dreGroups) })
  }, [])

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      id:   config?.id ?? Date.now().toString(),
      title: title.trim(),
      chartType, field, topN, sortOrder,
      departamentos, dreGroup,
      palette, valueFormat, labelPosition, groupBy,
      referenceLine: refLineValue.trim() !== '' && !isNaN(Number(refLineValue))
        ? { value: Number(refLineValue), label: refLineLabel.trim() }
        : undefined,
    })
  }

  const isPieOrDonut = chartType === 'pie' || chartType === 'donut'

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-bold text-gray-900">{config ? 'Editar gráfico' : 'Novo gráfico executivo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              placeholder="Ex: Top Receitas Marketing" />
          </div>

          {/* Chart type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Tipo de gráfico</label>
            <div className="grid grid-cols-3 gap-2">
              {CHART_TYPES.map(ct => {
                const Icon = ct.icon
                return (
                  <button key={ct.id} onClick={() => setChartType(ct.id)}
                    className={cn('flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-colors',
                      chartType === ct.id
                        ? 'border-gray-800 bg-gray-800 text-white'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                    <Icon size={18} />
                    {ct.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* GroupBy */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dimensão de análise</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as ExecChartConfig['groupBy'])}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
              <option value="agrupamento_arvore">Agrupamento DRE</option>
              <option value="dre">Categoria DRE</option>
              <option value="conta_contabil">Conta Contábil</option>
              <option value="centro_custo">Centro de Custo</option>
              <option value="contrapartida">Contrapartida</option>
              <option value="unidade_negocio">Unidade de Negócio</option>
              {isMasterContext && (
                <option value="departamento">Departamento</option>
              )}
            </select>
          </div>

          {/* Field + TopN */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Métrica</label>
              <select value={field} onChange={e => setField(e.target.value as ExecChartConfig['field'])}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                <option value="razao">Realizado</option>
                <option value="budget">Budget</option>
                <option value="variacao">Variação</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Top N itens</label>
              <input type="number" min={1} max={20} value={topN}
                onChange={e => setTopN(Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
          </div>

          {/* Sort order */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ordenação</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {([
                ['desc', '↓ Maior primeiro', 'Receitas, maiores valores positivos'],
                ['asc',  '↑ Menor primeiro', 'Despesas, maiores valores negativos'],
              ] as const).map(([v, lbl, hint]) => (
                <button key={v} onClick={() => setSortOrder(v)}
                  title={hint}
                  className={cn('flex-1 py-2 font-medium transition-colors',
                    sortOrder === v ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Value format + Label position */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Exibir valores</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {(['currency', 'percent'] as const).map(v => (
                  <button key={v} onClick={() => setValueFormat(v)}
                    className={cn('flex-1 py-2 font-medium transition-colors',
                      valueFormat === v ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                    {v === 'currency' ? 'R$' : '%'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rótulos</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {([
                  ['inside',  'Dentro'],
                  ['outside', isPieOrDonut ? 'Fora' : 'Topo'],
                  ['none',    'Off'],
                ] as const).map(([v, lbl]) => (
                  <button key={v} onClick={() => setLabelPosition(v)}
                    className={cn('flex-1 py-2 font-medium transition-colors',
                      labelPosition === v ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Palette */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Paleta de cores</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PALETTES).map(([key, pal]) => (
                <button key={key} onClick={() => setPalette(key)}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors',
                    palette === key
                      ? 'border-gray-800 bg-gray-50 font-semibold text-gray-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}>
                  <div className="flex gap-0.5 flex-shrink-0">
                    {pal.colors.slice(0, 4).map((c, i) => (
                      <span key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
                    ))}
                  </div>
                  <span className="truncate">{pal.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reference Line — only for bar/area charts */}
          {(chartType === 'bar_h' || chartType === 'bar_v' || chartType === 'area') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Linha de referência <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={refLineValue}
                  onChange={e => setRefLineValue(e.target.value)}
                  placeholder="Valor (ex: 500000)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <input
                  value={refLineLabel}
                  onChange={e => setRefLineLabel(e.target.value)}
                  placeholder="Rótulo (ex: Meta)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              {refLineValue.trim() !== '' && (
                <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                  <span>━━</span> Linha âmbar tracejada será exibida no gráfico
                </p>
              )}
            </div>
          )}

          {/* DRE Group filter */}
          {dreGroups.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Filtrar por grupo DRE <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <select value={dreGroup} onChange={e => setDreGroup(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                <option value="">Todos os grupos</option>
                {dreGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}

          {/* Departments */}
          {allDepts.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Departamentos <span className="text-gray-400 font-normal">(vazio = todos)</span>
              </label>
              <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {allDepts.map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input type="checkbox" checked={departamentos.includes(d)}
                      onChange={e => setDepartamentos(prev =>
                        e.target.checked ? [...prev, d] : prev.filter(x => x !== d)
                      )}
                      className="w-3 h-3 accent-gray-700" />
                    <span className="text-xs text-gray-700">{d}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim()}>
            {config ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main section ─────────────────────────────────────────────────────────────

export default function ExecCharts({
  selPeriodos,
  allDepts,
  deptName   = '__dashboard__',
  canEdit    = true,
}: {
  selPeriodos: string[]
  allDepts: string[]
  deptName?: string
  canEdit?: boolean
}) {
  const [charts,      setCharts]      = useState<ExecChartConfig[]>([])
  const [cfgLoading,  setCfgLoading]  = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [editing,     setEditing]     = useState<ExecChartConfig | null>(null)
  const [saveError,   setSaveError]   = useState<string | null>(null)

  // Load configs from server
  useEffect(() => {
    setCfgLoading(true)
    fetch(`/api/exec-chart-config?dept_name=${encodeURIComponent(deptName)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { configs: [] })
      .then(({ configs }) => setCharts(Array.isArray(configs) ? configs : []))
      .catch(() => setCharts([]))
      .finally(() => setCfgLoading(false))
  }, [deptName])

  const persist = async (next: ExecChartConfig[]) => {
    const prev = charts
    setCharts(next)
    setSaveError(null)
    try {
      const res = await fetch('/api/exec-chart-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept_name: deptName, configs: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`
        console.error('[ExecCharts] persist failed:', msg)
        setSaveError(`Erro ao salvar: ${msg}`)
        setCharts(prev) // revert optimistic update
      }
    } catch (e) {
      console.error('[ExecCharts] persist network error:', e)
      setSaveError('Erro de conexão ao salvar configuração.')
      setCharts(prev)
    }
  }

  const handleSave = (c: ExecChartConfig) => {
    persist(editing ? charts.map(x => x.id === c.id ? c : x) : [...charts, c])
    setEditing(null)
    setShowModal(false)
  }

  const handleDelete = (id: string) => persist(charts.filter(c => c.id !== id))
  const handleEdit   = (c: ExecChartConfig) => { setEditing(c); setShowModal(true) }

  if (cfgLoading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      Carregando gráficos…
    </div>
  )

  // If read-only and nothing configured, render nothing
  if (!canEdit && charts.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Gráficos Executivos</h2>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus size={13} /> Adicionar gráfico
          </Button>
        )}
      </div>

      {saveError && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 font-bold">×</button>
        </div>
      )}

      {charts.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-3">
          <BarChart2 size={28} className="text-gray-300" />
          <p className="text-sm text-gray-400">Nenhum gráfico executivo configurado.</p>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(null); setShowModal(true) }}>
              <Plus size={13} /> Adicionar primeiro gráfico
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {charts.map(c => (
            <ExecChartCard
              key={c.id}
              config={c}
              selPeriodos={selPeriodos}
              allDepts={allDepts}
              canEdit={canEdit}
              contextDept={deptName}
              onEdit={() => handleEdit(c)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <ConfigModal
          config={editing}
          allDepts={allDepts}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null) }}
          isMasterContext={deptName === '__dashboard__'}
        />
      )}
    </div>
  )
}
