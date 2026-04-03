'use client'
import React from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Legend,
  TooltipProps,
  RadialBarChart,
  RadialBar,
  BarChart,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPct, safePct } from '@/lib/utils'

interface PeriodData {
  raw: string; periodo: string; budget: number; razao: number
  variacaoYtd?: number; budgetYtd?: number; razaoYtd?: number
}
interface DeptData { dept: string; variacao: number }

const C = {
  budget: '#D9D4CC',
  razao: '#1A1820',
  line: '#B8924A',
  pos: '#166534',
  neg: '#B91C1C',
}

const tickStyle = { fontSize: 9, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }

function PeriodTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1A1820', borderRadius: 4, padding: '10px 14px', minWidth: 180, border: '0.5px solid rgba(184,146,74,0.2)' }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.7, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
            <span style={{ width: 6, height: 6, background: entry.color as string, flexShrink: 0 }} />
            {entry.name}
          </span>
          <span style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: 14, color: '#fff', letterSpacing: '-0.01em' }}>
            {formatCurrency(Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

function DeptTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as { dept: string; variacao: number }
  return (
    <div style={{ background: '#1A1820', borderRadius: 4, padding: '8px 12px', border: '0.5px solid rgba(184,146,74,0.2)' }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.7, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{d.dept}</p>
      <p style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: 16, color: '#fff', letterSpacing: '-0.01em' }}>{formatCurrency(d.variacao)}</p>
    </div>
  )
}

const tickFmt = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

const shortDept = (name: string) => name.length > 20 ? `${name.slice(0, 19)}…` : name

export default function DashboardCharts({ periodChartData, deptVariance, totalBudget, totalRealizado }: {
  periodChartData: PeriodData[]
  deptVariance: DeptData[]
  totalBudget: number
  totalRealizado: number
}) {
  const execPct = safePct(totalRealizado, totalBudget)
  const gaugeValue = Math.max(0, Math.min(execPct, 180))

  const rankedVariance = [...deptVariance]
    .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))
    .slice(0, 8)
    .map((d) => ({
      ...d,
      dept: shortDept(d.dept),
      color: d.variacao >= 0 ? C.pos : C.neg,
    }))
    .reverse()

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
      <div className="xl:col-span-2">
        <Card className="overflow-hidden h-full">
          <CardHeader className="pb-2" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
            <CardTitle>Variação YTD por Período</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.55, marginTop: 6 }}>
              Budget vs Realizado · Linha: acumulado YTD
            </p>
          </CardHeader>
          <CardContent className="pt-4 pb-3">
            <ResponsiveContainer width="100%" height={270}>
              <ComposedChart data={periodChartData} margin={{ top: 6, right: 14, left: -8, bottom: 0 }} barGap={3}>
                <CartesianGrid vertical={false} stroke="#F0EDE8" strokeWidth={0.5} />
                <XAxis dataKey="periodo" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis yAxisId="bars" tickFormatter={tickFmt} tick={tickStyle} axisLine={false} tickLine={false} width={40} />
                <YAxis yAxisId="line" orientation="right" tickFormatter={tickFmt}
                  tick={{ ...tickStyle, fill: '#B8924A' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<PeriodTooltip />} cursor={{ fill: 'rgba(184,146,74,0.04)' }} />
                <Legend
                  iconType="square" iconSize={7}
                  wrapperStyle={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, paddingTop: 10, color: '#94a3b8' }}
                />
                <ReferenceLine yAxisId="bars" y={0} stroke="#1A1820" strokeWidth={1.5} strokeOpacity={0.25} />
                <Bar yAxisId="bars" dataKey="budget" name="Budget" fill={C.budget} radius={[2, 2, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="bars" dataKey="razao" name="Realizado" fill={C.razao} radius={[2, 2, 0, 0]} maxBarSize={22} />
                <Line yAxisId="line" type="monotone" dataKey="variacaoYtd" name="Variação YTD"
                  stroke={C.line} strokeWidth={2.5}
                  dot={{ r: 3, fill: C.line, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="xl:col-span-1 grid grid-rows-2 gap-4">
        <Card className="overflow-hidden h-full">
          <CardHeader className="pb-2" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
            <CardTitle>Termômetro de Execução</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.55, marginTop: 6 }}>
              Realizado / Budget no recorte atual
            </p>
          </CardHeader>
          <CardContent className="pt-3 pb-2">
            <div className="h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={[{ name: 'Execução', value: gaugeValue }]}
                  startAngle={210}
                  endAngle={-30}
                  barSize={16}
                >
                  <RadialBar background dataKey="value" cornerRadius={8} fill={execPct <= 100 ? C.pos : C.line} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="-mt-10 text-center">
              <p style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: '2.1rem', lineHeight: 1, color: '#1A1820' }}>
                {formatPct(execPct)}
              </p>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: '#9B6E20', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                margem vs budget: {formatPct(safePct(totalRealizado - totalBudget, totalBudget))}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden h-full">
          <CardHeader className="pb-2" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
            <CardTitle>Top Impacto por Departamento</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.55, marginTop: 6 }}>
              Ganhos e perdas mais relevantes
            </p>
          </CardHeader>
          <CardContent className="pt-3 pb-2">
            {rankedVariance.length === 0 ? (
              <div className="h-[190px] flex items-center justify-center">
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.35, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  Sem variações para exibir
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={rankedVariance} layout="vertical" margin={{ top: 4, right: 10, left: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="#F5F2EC" strokeWidth={0.5} />
                  <XAxis type="number" tick={tickStyle} tickFormatter={tickFmt} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="dept" width={82} tick={{ ...tickStyle, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DeptTooltip />} cursor={{ fill: 'rgba(184,146,74,0.04)' }} />
                  <ReferenceLine x={0} stroke="#1A1820" strokeOpacity={0.2} />
                  <Bar dataKey="variacao" radius={[3, 3, 3, 3]}>
                    {rankedVariance.map((entry, idx) => (
                      <Cell key={`${entry.dept}-${idx}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
