'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
  Label,
  ReferenceLine,
  TooltipProps,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface ExecApiItem {
  name: string
  budget: number
  razao: number
  variacao: number
  value: number
}

interface ExecPayload {
  items: ExecApiItem[]
}

const COLORS = ['#1D4ED8', '#0F172A', '#0EA5A4', '#6366F1', '#0891B2', '#64748B', '#16A34A', '#EA580C']

function moneyShort(v: number) {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return `${v.toFixed(0)}`
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '9px 12px', minWidth: 180 }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>{p.name}</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{formatCurrency(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

export default function ExecCharts({
  selPeriodos,
  deptName = '__dashboard__',
}: {
  selPeriodos: string[]
  allDepts: string[]
  deptName?: string
  canEdit?: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [drivers, setDrivers] = useState<ExecApiItem[]>([])
  const [composition, setComposition] = useState<ExecApiItem[]>([])
  const [distribution, setDistribution] = useState<ExecApiItem[]>([])

  useEffect(() => {
    const p = selPeriodos.length ? `&periodos=${encodeURIComponent(selPeriodos.join(','))}` : ''
    const deptParam = deptName !== '__dashboard__' ? `&departamentos=${encodeURIComponent(deptName)}` : ''

    setLoading(true)
    Promise.all([
      fetch(`/api/exec-chart?groupBy=dre&field=variacao&topN=8&sortOrder=asc${p}${deptParam}`, { cache: 'no-store' }).then(r => r.json() as Promise<ExecPayload>),
      fetch(`/api/exec-chart?groupBy=conta_contabil&field=razao&topN=10&sortOrder=desc${p}${deptParam}`, { cache: 'no-store' }).then(r => r.json() as Promise<ExecPayload>),
      fetch(`/api/exec-chart?groupBy=${deptName === '__dashboard__' ? 'dre' : 'centro_custo'}&field=budget&topN=6&sortOrder=desc${p}${deptParam}`, { cache: 'no-store' }).then(r => r.json() as Promise<ExecPayload>),
    ]).then(([a, b, c]) => {
      setDrivers(a?.items ?? [])
      setComposition(b?.items ?? [])
      setDistribution(c?.items ?? [])
    }).finally(() => setLoading(false))
  }, [selPeriodos, deptName])

  const pieData = useMemo(() => distribution.map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length], share: 0 })), [distribution])
  const pieTotal = pieData.reduce((s, d) => s + Math.abs(d.value), 0)
  const pieDataWithShare = pieData.map((d) => ({ ...d, share: pieTotal > 0 ? (Math.abs(d.value) / pieTotal) * 100 : 0 }))

  if (loading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-[320px] rounded-xl animate-pulse" style={{ background: '#f3f4f6' }} />)}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Gráficos Executivos</h2>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 16 }}>Drivers de Desvio (DRE)</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#64748b' }}>Quem mais impacta positiva/negativamente</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={drivers.map(d => ({ ...d, label: d.name.length > 20 ? `${d.name.slice(0, 19)}…` : d.name }))} layout="vertical" margin={{ top: 0, right: 10, left: 2, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" tickFormatter={moneyShort} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={95} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                <ReferenceLine x={0} stroke="#0f172a" strokeOpacity={0.2} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[3, 3, 3, 3]}>
                  {drivers.map((d, i) => <Cell key={i} fill={d.value >= 0 ? '#059669' : '#dc2626'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 16 }}>Composição do Realizado</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#64748b' }}>Top contas com maior participação</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={composition.map((d) => ({ ...d, label: d.name.length > 16 ? `${d.name.slice(0, 15)}…` : d.name }))} margin={{ top: 8, right: 10, left: -8, bottom: 24 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} angle={-25} textAnchor="end" interval={0} />
                <YAxis tickFormatter={moneyShort} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {composition.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 16 }}>Distribuição de Budget</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#64748b' }}>Fatia com callout, linhas e cantos arredondados</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieDataWithShare}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="52%"
                  outerRadius="78%"
                  cornerRadius={10}
                  paddingAngle={1.5}
                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1, strokeOpacity: 0.7 }}
                  label={({ name, percent, x, y, textAnchor }: { name: string; percent?: number; x?: number; y?: number; textAnchor?: string }) => (
                    <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill="#475569" style={{ fontSize: 10, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                      {`${String(name).slice(0, 12)} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    </text>
                  )}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {pieDataWithShare.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  <Label
                    position="center"
                    content={({ viewBox }: { viewBox?: { cx: number; cy: number } }) => {
                      if (!viewBox) return null
                      const { cx, cy } = viewBox
                      return (
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                          <tspan x={cx} dy="-0.2em" style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 11, fill: '#64748b' }}>Total</tspan>
                          <tspan x={cx} dy="1.2em" style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 700, fill: '#0f172a' }}>{moneyShort(pieTotal)}</tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
