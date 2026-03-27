'use client'
import React, { useState, useEffect, useCallback } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, TooltipProps,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, cn } from '@/lib/utils'
import { Plus, X, Settings2, RefreshCw, PieChart as PieIcon, BarChart2, BarChart3, Donut } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecChartConfig {
  id: string
  title: string
  chartType: 'pie' | 'donut' | 'bar_h' | 'bar_v'
  field: 'razao' | 'budget' | 'variacao'
  topN: number
  departamentos: string[]
  dreGroup: string
}

interface ChartItem {
  name: string
  budget: number
  razao: number
  variacao: number
  value: number
}

const CHART_PALETTE = [
  '#334155','#475569','#64748b','#94a3b8','#cbd5e1',
  '#1e3a5f','#1d4ed8','#2563eb','#3b82f6','#60a5fa',
  '#064e3b','#059669','#10b981','#34d399','#6ee7b7',
  '#78350f','#d97706','#f59e0b','#fbbf24','#fde68a',
]

const FIELD_LABELS: Record<ExecChartConfig['field'], string> = {
  razao:    'Realizado',
  budget:   'Budget',
  variacao: 'Variação',
}

const CHART_TYPES: { id: ExecChartConfig['chartType']; label: string; icon: React.ElementType }[] = [
  { id: 'pie',   label: 'Pizza',        icon: PieIcon  },
  { id: 'donut', label: 'Rosca',        icon: Donut    },
  { id: 'bar_h', label: 'Barras (H)',   icon: BarChart2 },
  { id: 'bar_v', label: 'Barras (V)',   icon: BarChart3 },
]

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ExecTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div style={{ background: '#0f172a', borderRadius: 10, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12 }}>
      <p style={{ color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>{d.name}</p>
      <p style={{ color: '#fff', fontWeight: 700 }}>{formatCurrency(Number(d.value))}</p>
    </div>
  )
}

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number
  innerRadius: number; outerRadius: number; percent: number
}) => {
  if (percent < 0.04) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ─── Single chart card ────────────────────────────────────────────────────────
function ExecChartCard({
  config, selPeriodos, allDepts,
  onEdit, onDelete,
}: {
  config: ExecChartConfig
  selPeriodos: string[]
  allDepts: string[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [items,    setItems]    = useState<ChartItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [dreGroups, setDreGroups] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({
      topN:  String(config.topN),
      field: config.field,
    })
    if (config.departamentos.length) p.set('departamentos', config.departamentos.join(','))
    if (selPeriodos.length)          p.set('periodos',       selPeriodos.join(','))
    if (config.dreGroup)             p.set('dreGroup',       config.dreGroup)
    const res = await fetch(`/api/exec-chart?${p}`, { cache: 'no-store' })
    if (res.ok) {
      const { items: d, dreGroups: dg } = await res.json()
      setItems(d ?? [])
      setDreGroups(dg ?? [])
    }
    setLoading(false)
  }, [config, selPeriodos])

  useEffect(() => { load() }, [load])

  const tickFmt = (v: number) => {
    const a = Math.abs(v)
    if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
    return String(v)
  }

  const fieldLabel = FIELD_LABELS[config.field]
  const absItems = items.map(it => ({ ...it, absValue: Math.abs(it.value) }))

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{config.title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fieldLabel} · Top {config.topN}
            {config.dreGroup && <span className="ml-1">· {config.dreGroup}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button onClick={load} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <RefreshCw size={12} />
          </button>
          <button onClick={onEdit} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Settings2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      <CardContent className="p-4">
        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">Sem dados</div>
        ) : (

          <div className="space-y-3">
            <ResponsiveContainer width="100%" height={200}>
              {(config.chartType === 'pie' || config.chartType === 'donut') ? (
                <PieChart>
                  <Pie
                    data={absItems}
                    dataKey="absValue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={config.chartType === 'donut' ? '48%' : 0}
                    outerRadius="78%"
                    labelLine={false}
                    label={renderLabel}
                    strokeWidth={1}
                    stroke="#fff"
                  >
                    {absItems.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Pie>
                  <Tooltip content={<ExecTooltip />} />
                </PieChart>
              ) : config.chartType === 'bar_h' ? (
                <BarChart data={absItems} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tickFormatter={tickFmt} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false}
                    tickFormatter={(v: string) => v.length > 17 ? v.slice(0, 16) + '…' : v} />
                  <Tooltip content={<ExecTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="absValue" name={fieldLabel} radius={[0,3,3,0]} maxBarSize={14}>
                    {absItems.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={absItems} margin={{ top: 0, right: 8, left: -10, bottom: 24 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0}
                    tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 11) + '…' : v} />
                  <YAxis tickFormatter={tickFmt} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ExecTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="absValue" name={fieldLabel} radius={[3,3,0,0]} maxBarSize={30}>
                    {absItems.map((_, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {items.slice(0, config.topN).map((it, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                  <span className="truncate max-w-[120px]" title={it.name}>{it.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Config modal ─────────────────────────────────────────────────────────────
function ConfigModal({
  config, allDepts, onSave, onClose,
}: {
  config: ExecChartConfig | null
  allDepts: string[]
  onSave: (c: ExecChartConfig) => void
  onClose: () => void
}) {
  const [title,        setTitle]        = useState(config?.title        ?? '')
  const [chartType,    setChartType]    = useState<ExecChartConfig['chartType']>(config?.chartType ?? 'bar_h')
  const [field,        setField]        = useState<ExecChartConfig['field']>(config?.field ?? 'razao')
  const [topN,         setTopN]         = useState(config?.topN         ?? 5)
  const [departamentos, setDepartamentos] = useState<string[]>(config?.departamentos ?? [])
  const [dreGroup,     setDreGroup]     = useState(config?.dreGroup     ?? '')
  const [dreGroups,    setDreGroups]    = useState<string[]>([])

  useEffect(() => {
    fetch('/api/exec-chart?topN=1&field=razao').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.dreGroups) setDreGroups(d.dreGroups)
    })
  }, [])

  const handleSave = () => {
    if (!title.trim()) return
    onSave({
      id:            config?.id ?? Date.now().toString(),
      title:         title.trim(),
      chartType, field, topN,
      departamentos,
      dreGroup,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">{config ? 'Editar gráfico' : 'Novo gráfico executivo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4">

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
            <div className="grid grid-cols-4 gap-2">
              {CHART_TYPES.map(ct => {
                const Icon = ct.icon
                return (
                  <button key={ct.id} onClick={() => setChartType(ct.id)}
                    className={cn('flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-colors',
                      chartType === ct.id ? 'border-gray-800 bg-gray-800 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                    <Icon size={18} />
                    {ct.label}
                  </button>
                )
              })}
            </div>
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
              <input type="number" min={1} max={20} value={topN} onChange={e => setTopN(Math.min(20, Math.max(1, parseInt(e.target.value) || 5)))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
          </div>

          {/* DRE Group filter */}
          {dreGroups.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Filtrar por grupo DRE <span className="text-gray-400">(opcional)</span></label>
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Departamentos <span className="text-gray-400">(vazio = todos)</span></label>
              <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {allDepts.map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input type="checkbox" checked={departamentos.includes(d)}
                      onChange={e => setDepartamentos(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))}
                      className="w-3 h-3 accent-gray-700" />
                    <span className="text-xs text-gray-700">{d}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
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
export default function ExecCharts({ selPeriodos, allDepts }: {
  selPeriodos: string[]
  allDepts: string[]
}) {
  const STORAGE_KEY = 'exec-charts-v1'
  const [charts,    setCharts]    = useState<ExecChartConfig[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState<ExecChartConfig | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setCharts(JSON.parse(saved))
    } catch {}
  }, [])

  const persist = (next: ExecChartConfig[]) => {
    setCharts(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const handleSave = (c: ExecChartConfig) => {
    persist(editing
      ? charts.map(x => x.id === c.id ? c : x)
      : [...charts, c]
    )
    setEditing(null)
    setShowModal(false)
  }

  const handleDelete = (id: string) => persist(charts.filter(c => c.id !== id))

  const handleEdit = (c: ExecChartConfig) => { setEditing(c); setShowModal(true) }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Gráficos Executivos</h2>
          <p className="text-xs text-gray-400 mt-0.5">Top-N agrupamentos por grupo DRE · personalizado</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setShowModal(true) }}>
          <Plus size={13} /> Adicionar gráfico
        </Button>
      </div>

      {charts.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-3">
          <BarChart2 size={28} className="text-gray-300" />
          <p className="text-sm text-gray-400">Nenhum gráfico executivo configurado.</p>
          <Button size="sm" variant="outline" onClick={() => { setEditing(null); setShowModal(true) }}>
            <Plus size={13} /> Adicionar primeiro gráfico
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {charts.map(c => (
            <ExecChartCard
              key={c.id}
              config={c}
              selPeriodos={selPeriodos}
              allDepts={allDepts}
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
        />
      )}
    </div>
  )
}
