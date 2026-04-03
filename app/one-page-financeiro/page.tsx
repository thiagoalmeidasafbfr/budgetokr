'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, safePct } from '@/lib/utils'
import { Trash2, ChevronUp, ChevronDown, Sparkles } from 'lucide-react'
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
} from 'recharts'

type TopNChart = 'bar' | 'donut' | 'pie'
type GroupBy = 'dre' | 'conta_contabil' | 'centro_custo' | 'departamento' | 'unidade_negocio'
type Field = 'budget' | 'razao' | 'variacao'

type Widget =
  | { id: string; type: 'kpi'; title: string; metric: Field; span: 1 | 2 | 3; origin: string }
  | { id: string; type: 'trend'; title: string; field: Field; span: 1 | 2 | 3; origin: string }
  | { id: string; type: 'topn'; title: string; field: Field; groupBy: GroupBy; topN: number; sortOrder: 'asc' | 'desc'; chart: TopNChart; span: 1 | 2 | 3; origin: string }

const STORAGE_KEY = 'onepage-financeiro-widgets-v1'
const COLORS = ['#1D4ED8', '#0F172A', '#0EA5A4', '#6366F1', '#0891B2', '#64748B', '#16A34A', '#EA580C']

const PRESETS: Widget[] = [
  { id: 'preset-1', type: 'topn', title: 'Top Revenues', field: 'razao', groupBy: 'dre', topN: 6, sortOrder: 'desc', chart: 'bar', span: 2, origin: 'DRE / Análise Macro' },
  { id: 'preset-2', type: 'kpi', title: 'Totalizador Realizado', metric: 'razao', span: 1, origin: 'Dashboard' },
  { id: 'preset-3', type: 'trend', title: 'Linha de Variação do Realizado', field: 'variacao', span: 2, origin: 'Dashboard / Departamento' },
  { id: 'preset-4', type: 'topn', title: 'Lucro Bruto Gerencial por Loja', field: 'variacao', groupBy: 'unidade_negocio', topN: 8, sortOrder: 'desc', chart: 'donut', span: 1, origin: 'Unidades de Negócio' },
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

function spanClass(span: 1 | 2 | 3) {
  if (span === 3) return 'lg:col-span-3'
  if (span === 2) return 'lg:col-span-2'
  return 'lg:col-span-1'
}

function OneWidget({ w }: { w: Widget }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    setLoading(true)
    if (w.type === 'topn') {
      fetch(`/api/exec-chart?groupBy=${w.groupBy}&field=${w.field}&topN=${w.topN}&sortOrder=${w.sortOrder}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setData(Array.isArray(d?.items) ? d.items : []))
        .finally(() => setLoading(false))
      return
    }

    fetch('/api/analise', { cache: 'no-store' })
      .then(r => r.json())
      .then(rows => {
        const arr = Array.isArray(rows) ? rows : []
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
  }, [w])

  if (loading) return <div className="h-[260px] rounded-xl animate-pulse" style={{ background: '#f3f4f6' }} />

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 17 }}>{w.title}</CardTitle>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#64748b' }}>{w.origin}</p>
      </CardHeader>
      <CardContent>
        {w.type === 'kpi' && data[0] && (
          <div className="h-[190px] flex flex-col items-center justify-center">
            <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 38, fontWeight: 700, color: '#0f172a' }}>{formatCurrency(data[0].total)}</p>
            {w.metric === 'variacao' && <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: data[0].total >= 0 ? '#166534' : '#b91c1c' }}>{formatPct(data[0].pct)}</p>}
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#64748b' }}>{metricLabel(w.metric)}</p>
          </div>
        )}

        {w.type === 'trend' && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="value" stroke="#1D4ED8" strokeWidth={2.4} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {w.type === 'topn' && w.chart === 'bar' && (
          <ResponsiveContainer width="100%" height={220}>
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
          <ResponsiveContainer width="100%" height={220}>
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

  useEffect(() => setWidgets(loadWidgets()), [])

  const addPreset = (preset: Widget) => {
    const next = [...widgets, { ...preset, id: `${preset.id}-${Date.now()}` }]
    setWidgets(next)
    saveWidgets(next)
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
  const widgetsWithUI = useMemo(() => widgets.map((w) => ({ ...w })), [widgets])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9B6E20', letterSpacing: '0.14em', textTransform: 'uppercase' }}>BI Canvas</p>
          <h1 style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 28, fontWeight: 700, color: '#0f172a' }}>One Page Financeiro</h1>
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, color: '#64748b' }}>Monte um infográfico financeiro com blocos vindos das outras visões do sistema.</p>
        </div>
        {hasWidgets && (
          <Button variant="outline" onClick={clearAll}><Trash2 size={14} /> Limpar canvas</Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 17 }}><Sparkles size={16} className="inline mr-2" />Biblioteca de blocos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => addPreset(p)} className="text-left rounded-xl px-3 py-3 transition-all hover:shadow-sm"
                style={{ border: '0.5px solid #E4DFD5', background: '#fff' }}>
                <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.title}</p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#9B6E20', marginTop: 4 }}>{p.origin}</p>
                <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12, color: '#64748b', marginTop: 6 }}>Adicionar ao canvas</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {!hasWidgets ? (
        <div className="rounded-xl p-10 text-center" style={{ border: '0.5px dashed #d6d3d1', background: '#fafaf9' }}>
          <p style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: '#64748b' }}>Seu OnePage está vazio. Comece adicionando blocos da biblioteca acima.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {widgetsWithUI.map((w, idx) => (
            <div key={w.id} className={spanClass(w.span)}>
              <div className="mb-2 flex justify-end gap-1">
                <button onClick={() => move(w.id, -1)} disabled={idx === 0} className="p-1 rounded border border-gray-200 disabled:opacity-30"><ChevronUp size={12} /></button>
                <button onClick={() => move(w.id, 1)} disabled={idx === widgets.length - 1} className="p-1 rounded border border-gray-200 disabled:opacity-30"><ChevronDown size={12} /></button>
                <button onClick={() => remove(w.id)} className="p-1 rounded border border-red-200 text-red-600"><Trash2 size={12} /></button>
              </div>
              <OneWidget w={w} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
