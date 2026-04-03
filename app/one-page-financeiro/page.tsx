'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, safePct } from '@/lib/utils'
import { Trash2, ChevronUp, ChevronDown, Sparkles, Plus, Settings2, X } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts'

type TopNChart = 'bar' | 'donut' | 'pie'
type TrendChart = 'line' | 'area'
type GroupBy = 'dre' | 'conta_contabil' | 'centro_custo' | 'departamento' | 'unidade_negocio'
type Field = 'budget' | 'razao' | 'variacao'
type WidgetSpan = 1 | 2 | 3
type FontSize = 'sm' | 'md' | 'lg'
type CardHeight = 'compact' | 'normal' | 'tall'
type ViewName = 'dashboard' | 'analise' | 'dre' | 'dept' | 'unidades'

type BaseWidget = {
  id: string
  title: string
  view: ViewName
  span: WidgetSpan
  fontSize: FontSize
  height: CardHeight
}

type Widget =
  | (BaseWidget & { type: 'kpi'; metric: Field })
  | (BaseWidget & { type: 'trend'; field: Field; chart: TrendChart })
  | (BaseWidget & { type: 'topn'; field: Field; groupBy: GroupBy; topN: number; sortOrder: 'asc' | 'desc'; chart: TopNChart })

const STORAGE_KEY = 'onepage-financeiro-widgets-v2'
const COLORS = ['#1D4ED8', '#0F172A', '#0EA5A4', '#6366F1', '#0891B2', '#64748B', '#16A34A', '#EA580C']

const PRESETS: Widget[] = [
  { id: 'preset-1', type: 'topn', title: 'Top Revenues', field: 'razao', groupBy: 'dre', topN: 6, sortOrder: 'desc', chart: 'bar', span: 2, fontSize: 'md', height: 'normal', view: 'dre' },
  { id: 'preset-2', type: 'kpi', title: 'Totalizador Realizado', metric: 'razao', span: 1, fontSize: 'lg', height: 'compact', view: 'dashboard' },
  { id: 'preset-3', type: 'trend', title: 'Variação do Realizado', field: 'variacao', chart: 'line', span: 2, fontSize: 'md', height: 'normal', view: 'analise' },
]

function loadWidgets(): Widget[] {
  if (typeof window === 'undefined') return []
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? JSON.parse(s) as Widget[] : []
  } catch {
    return []
  }
}

function saveWidgets(w: Widget[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w))
}

function formatPeriod(p: string) {
  if (!p) return p
  const [y, m] = p.split('-')
  return `${m}/${y}`
}

function metricLabel(metric: Field) {
  if (metric === 'razao') return 'Realizado'
  if (metric === 'budget') return 'Budget'
  return 'Variação'
}

function viewLabel(v: ViewName) {
  return {
    dashboard: 'Dashboard',
    analise: 'Análise Macro',
    dre: 'DRE',
    dept: 'Departamento',
    unidades: 'Unidades',
  }[v]
}

function spanClass(span: WidgetSpan) {
  if (span === 3) return 'lg:col-span-3'
  if (span === 2) return 'lg:col-span-2'
  return 'lg:col-span-1'
}

function heightPx(h: CardHeight) {
  if (h === 'compact') return 170
  if (h === 'tall') return 300
  return 230
}

function titleSize(size: FontSize) {
  if (size === 'sm') return 15
  if (size === 'lg') return 20
  return 17
}

function valueSize(size: FontSize) {
  if (size === 'sm') return 28
  if (size === 'lg') return 44
  return 36
}

function defaultWidget(): Widget {
  return {
    id: `w-${Date.now()}`,
    type: 'kpi',
    title: 'Novo KPI',
    metric: 'razao',
    span: 1,
    fontSize: 'md',
    height: 'compact',
    view: 'dashboard',
  }
}

function WidgetEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: Widget
  onCancel: () => void
  onSave: (w: Widget) => void
}) {
  const [w, setW] = useState<Widget>(initial)

  const setBase = <K extends keyof BaseWidget>(k: K, v: BaseWidget[K]) => setW(prev => ({ ...prev, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold">Configurar card OnePage</h3>
          <button onClick={onCancel}><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-600">Título</label>
            <input value={w.title} onChange={(e) => setW(prev => ({ ...prev, title: e.target.value }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Tipo</label>
              <select
                value={w.type}
                onChange={(e) => {
                  const t = e.target.value as Widget['type']
                  if (t === 'kpi') setW({ ...w, type: 'kpi', metric: 'razao' })
                  if (t === 'trend') setW({ ...w, type: 'trend', field: 'variacao', chart: 'line' })
                  if (t === 'topn') setW({ ...w, type: 'topn', field: 'razao', groupBy: 'dre', topN: 6, sortOrder: 'desc', chart: 'bar' })
                }}
                className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
              >
                <option value="kpi">KPI</option>
                <option value="trend">Trend</option>
                <option value="topn">TopN</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">View origem</label>
              <select value={w.view} onChange={(e) => setBase('view', e.target.value as ViewName)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                <option value="dashboard">Dashboard</option>
                <option value="analise">Análise</option>
                <option value="dre">DRE</option>
                <option value="dept">Departamento</option>
                <option value="unidades">Unidades</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-600">Largura</label>
              <select value={w.span} onChange={(e) => setBase('span', Number(e.target.value) as WidgetSpan)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                <option value={1}>1 coluna</option>
                <option value={2}>2 colunas</option>
                <option value={3}>3 colunas</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Fonte</label>
              <select value={w.fontSize} onChange={(e) => setBase('fontSize', e.target.value as FontSize)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                <option value="sm">Pequena</option>
                <option value="md">Média</option>
                <option value="lg">Grande</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Altura</label>
              <select value={w.height} onChange={(e) => setBase('height', e.target.value as CardHeight)} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                <option value="compact">Compacto</option>
                <option value="normal">Normal</option>
                <option value="tall">Alto</option>
              </select>
            </div>
          </div>

          {w.type === 'kpi' && (
            <div>
              <label className="text-xs text-gray-600">Métrica</label>
              <select value={w.metric} onChange={(e) => setW(prev => ({ ...prev, metric: e.target.value as Field }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                <option value="razao">Realizado</option>
                <option value="budget">Budget</option>
                <option value="variacao">Variação</option>
              </select>
            </div>
          )}

          {w.type === 'trend' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Métrica</label>
                <select value={w.field} onChange={(e) => setW(prev => ({ ...prev, field: e.target.value as Field }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  <option value="razao">Realizado</option>
                  <option value="budget">Budget</option>
                  <option value="variacao">Variação</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Tipo gráfico</label>
                <select value={w.chart} onChange={(e) => setW(prev => ({ ...prev, chart: e.target.value as TrendChart }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  <option value="line">Linha</option>
                  <option value="area">Área</option>
                </select>
              </div>
            </div>
          )}

          {w.type === 'topn' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Métrica</label>
                  <select value={w.field} onChange={(e) => setW(prev => ({ ...prev, field: e.target.value as Field }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                    <option value="razao">Realizado</option>
                    <option value="budget">Budget</option>
                    <option value="variacao">Variação</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Dimensão</label>
                  <select value={w.groupBy} onChange={(e) => setW(prev => ({ ...prev, groupBy: e.target.value as GroupBy }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                    <option value="dre">DRE</option>
                    <option value="conta_contabil">Conta Contábil</option>
                    <option value="centro_custo">Centro de Custo</option>
                    <option value="departamento">Departamento</option>
                    <option value="unidade_negocio">Unidade de Negócio</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-600">TopN</label>
                  <input type="number" min={2} max={20} value={w.topN} onChange={(e) => setW(prev => ({ ...prev, topN: Number(e.target.value) || 6 }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Ordem</label>
                  <select value={w.sortOrder} onChange={(e) => setW(prev => ({ ...prev, sortOrder: e.target.value as 'asc' | 'desc' }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                    <option value="desc">Maior</option>
                    <option value="asc">Menor</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Tipo gráfico</label>
                  <select value={w.chart} onChange={(e) => setW(prev => ({ ...prev, chart: e.target.value as TopNChart }))} className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                    <option value="bar">Barras</option>
                    <option value="donut">Donut</option>
                    <option value="pie">Pizza</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={() => onSave(w)}>Salvar card</Button>
        </div>
      </div>
    </div>
  )
}

function OneWidget({ w, periodos }: { w: Widget; periodos: string[] }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    setLoading(true)
    const periodParam = periodos.length ? `&periodos=${encodeURIComponent(periodos.join(','))}` : ''

    if (w.type === 'topn') {
      fetch(`/api/exec-chart?groupBy=${w.groupBy}&field=${w.field}&topN=${w.topN}&sortOrder=${w.sortOrder}${periodParam}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setData(Array.isArray(d?.items) ? d.items : []))
        .finally(() => setLoading(false))
      return
    }

    fetch('/api/analise', { cache: 'no-store' })
      .then(r => r.json())
      .then(rows => {
        const arr = (Array.isArray(rows) ? rows : []).filter((r) => periodos.length === 0 || periodos.includes(r.periodo))
        if (w.type === 'kpi') {
          const total = arr.reduce((s, r) => s + (w.metric === 'razao' ? r.razao : w.metric === 'budget' ? r.budget : (r.razao - r.budget)), 0)
          const budget = arr.reduce((s, r) => s + r.budget, 0)
          const pct = w.metric === 'variacao' ? safePct(total, budget) : 0
          setData([{ total, pct }])
        } else {
          const byP: Record<string, { periodo: string; value: number }> = {}
          for (const r of arr) {
            if (!byP[r.periodo]) byP[r.periodo] = { periodo: r.periodo, value: 0 }
            byP[r.periodo].value += w.field === 'razao' ? r.razao : w.field === 'budget' ? r.budget : (r.razao - r.budget)
          }
          setData(Object.values(byP).sort((a, b) => a.periodo.localeCompare(b.periodo)).map(x => ({ ...x, label: formatPeriod(x.periodo) })))
        }
      })
      .finally(() => setLoading(false))
  }, [w, periodos])

  if (loading) return <div className="h-[260px] rounded-xl animate-pulse" style={{ background: '#f3f4f6' }} />

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: titleSize(w.fontSize) }}>{w.title}</CardTitle>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#64748b' }}>{viewLabel(w.view)}</p>
      </CardHeader>
      <CardContent>
        {w.type === 'kpi' && data[0] && (
          <div className="flex flex-col items-center justify-center" style={{ height: `${heightPx(w.height)}px` }}>
            <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: valueSize(w.fontSize), fontWeight: 700, color: '#0f172a' }}>{formatCurrency(data[0].total)}</p>
            {w.metric === 'variacao' && <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: data[0].total >= 0 ? '#166534' : '#b91c1c' }}>{formatPct(data[0].pct)}</p>}
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#64748b' }}>{metricLabel(w.metric)}</p>
          </div>
        )}

        {w.type === 'trend' && (
          <ResponsiveContainer width="100%" height={heightPx(w.height)}>
            {w.chart === 'line' ? (
              <LineChart data={data}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Line type="monotone" dataKey="value" stroke="#1D4ED8" strokeWidth={2.4} dot={{ r: 2.5 }} />
              </LineChart>
            ) : (
              <AreaChart data={data}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Area type="monotone" dataKey="value" stroke="#1D4ED8" fill="#1D4ED8" fillOpacity={0.15} strokeWidth={2.2} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}

        {w.type === 'topn' && w.chart === 'bar' && (
          <ResponsiveContainer width="100%" height={heightPx(w.height)}>
            <BarChart data={data.map((d) => ({ ...d, label: d.name?.length > 16 ? `${d.name.slice(0, 15)}…` : d.name }))}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {w.type === 'topn' && (w.chart === 'donut' || w.chart === 'pie') && (
          <ResponsiveContainer width="100%" height={heightPx(w.height)}>
            <PieChart>
              <Pie
                data={data.map((d: any, i: number) => ({ ...d, fill: COLORS[i % COLORS.length] }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={w.chart === 'donut' ? '52%' : 0}
                outerRadius="78%"
                cornerRadius={10}
                paddingAngle={1.5}
                labelLine={{ stroke: '#94a3b8', strokeWidth: 1, strokeOpacity: 0.7 }}
                label={({ name, percent, x, y, textAnchor }: any) => (
                  <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill="#475569" style={{ fontSize: 10, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    {`${String(name).slice(0, 12)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  </text>
                )}
                stroke="#fff"
                strokeWidth={2}
              >
                {data.map((d: any, i: number) => <Cell key={i} fill={d.fill || COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export default function OnePageFinanceiro() {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [editing, setEditing] = useState<Widget | null>(null)
  const [allPeriodos, setAllPeriodos] = useState<string[]>([])
  const [selYear, setSelYear] = useState<string | null>('2026')

  useEffect(() => setWidgets(loadWidgets()), [])

  useEffect(() => {
    fetch('/api/analise?type=distinct&col=data_lancamento', { cache: 'no-store' })
      .then(r => r.json())
      .then((dates) => {
        const periodos = [...new Set((Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean))].sort() as string[]
        setAllPeriodos(periodos)
      })
  }, [])

  const filteredPeriodos = selYear ? allPeriodos.filter(p => p.startsWith(selYear)) : allPeriodos

  const upsert = (nw: Widget) => {
    const exists = widgets.some(w => w.id === nw.id)
    const next = exists ? widgets.map(w => w.id === nw.id ? nw : w) : [...widgets, nw]
    setWidgets(next)
    saveWidgets(next)
    setEditing(null)
  }

  const addPreset = (preset: Widget) => {
    upsert({ ...preset, id: `${preset.id}-${Date.now()}` })
  }

  const remove = (id: string) => {
    const next = widgets.filter(w => w.id !== id)
    setWidgets(next)
    saveWidgets(next)
  }

  const move = (id: string, direction: -1 | 1) => {
    const i = widgets.findIndex(w => w.id === id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= widgets.length) return
    const next = [...widgets]
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
    setWidgets(next)
    saveWidgets(next)
  }

  const clearAll = () => {
    setWidgets([])
    saveWidgets([])
  }

  const hasWidgets = widgets.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9B6E20', letterSpacing: '0.14em', textTransform: 'uppercase' }}>BI Canvas</p>
          <h1 style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 28, fontWeight: 700, color: '#0f172a' }}>One Page Financeiro</h1>
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, color: '#64748b' }}>Escolha exatamente o que ver, como ver e com qual escala visual.</p>
        </div>
        <div className="flex items-center gap-2">
          <YearFilter periodos={allPeriodos} selYear={selYear} onChange={setSelYear} />
          <Button variant="outline" onClick={() => setEditing(defaultWidget())}><Plus size={14} /> Novo card</Button>
          {hasWidgets && <Button variant="outline" onClick={clearAll}><Trash2 size={14} /> Limpar</Button>}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 17 }}><Sparkles size={16} className="inline mr-2" />Blocos rápidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => addPreset(p)} className="text-left rounded-xl px-3 py-3 transition-all hover:shadow-sm"
                style={{ border: '0.5px solid #E4DFD5', background: '#fff' }}>
                <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.title}</p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9B6E20', marginTop: 4 }}>{viewLabel(p.view)}</p>
                <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12, color: '#64748b', marginTop: 6 }}>Adicionar ao canvas</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {!hasWidgets ? (
        <div className="rounded-xl p-10 text-center" style={{ border: '0.5px dashed #d6d3d1', background: '#fafaf9' }}>
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: '#64748b' }}>Seu OnePage está vazio. Crie cards personalizados ou use blocos rápidos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {widgets.map((w, idx) => (
            <div key={w.id} className={spanClass(w.span)}>
              <div className="mb-2 flex justify-end gap-1">
                <button onClick={() => move(w.id, -1)} disabled={idx === 0} className="p-1 rounded border border-gray-200 disabled:opacity-30"><ChevronUp size={12} /></button>
                <button onClick={() => move(w.id, 1)} disabled={idx === widgets.length - 1} className="p-1 rounded border border-gray-200 disabled:opacity-30"><ChevronDown size={12} /></button>
                <button onClick={() => setEditing(w)} className="p-1 rounded border border-amber-200 text-amber-700"><Settings2 size={12} /></button>
                <button onClick={() => remove(w.id)} className="p-1 rounded border border-red-200 text-red-600"><Trash2 size={12} /></button>
              </div>
              <OneWidget w={w} periodos={filteredPeriodos} />
            </div>
          ))}
        </div>
      )}

      {editing && <WidgetEditor initial={editing} onCancel={() => setEditing(null)} onSave={upsert} />}
    </div>
  )
}
