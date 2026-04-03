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
  BarChart,
  Cell,
  LineChart,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPct, safePct } from '@/lib/utils'

interface PeriodData {
  raw: string; periodo: string; budget: number; razao: number
  variacaoMes?: number; variacaoYtd?: number
}
interface DeptData { dept: string; variacao: number; variacaoPct: number }

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
    <div style={{ background: '#1A1820', borderRadius: 6, padding: '10px 14px', minWidth: 180, border: '0.5px solid rgba(184,146,74,0.2)' }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.7, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ width: 6, height: 6, background: entry.color as string, borderRadius: 99, flexShrink: 0 }} />
            {entry.name}
          </span>
          <span style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: 14, color: '#fff' }}>
            {formatCurrency(Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

function DeptTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as DeptData
  return (
    <div style={{ background: '#1A1820', borderRadius: 6, padding: '8px 12px', border: '0.5px solid rgba(184,146,74,0.2)' }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.7, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{d.dept}</p>
      <p style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: 15, color: '#fff' }}>{formatCurrency(d.variacao)}</p>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.65)' }}>{formatPct(d.variacaoPct)}</p>
    </div>
  )
}

const tickFmt = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

const shortDept = (name: string) => name.length > 18 ? `${name.slice(0, 17)}…` : name

export default function DashboardCharts({ periodChartData, deptVariance, totalBudget, totalRealizado }: {
  periodChartData: PeriodData[]
  deptVariance: DeptData[]
  totalBudget: number
  totalRealizado: number
}) {
  const consumoPct = safePct(Math.abs(totalRealizado), Math.abs(totalBudget))
  const consumoBar = Math.max(0, Math.min(consumoPct, 140))
  const statusLabel = consumoPct <= 100 ? 'Dentro do orçamento' : 'Acima do orçamento'

  const rankedVariance = [...deptVariance]
    .sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))
    .slice(0, 8)
    .map(d => ({ ...d, dept: shortDept(d.dept), color: d.variacao >= 0 ? C.pos : C.neg }))
    .reverse()

  const maxAbs = rankedVariance.reduce((m, d) => Math.max(m, Math.abs(d.variacao)), 1)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
      <div className="xl:col-span-2">
        <Card className="overflow-hidden h-full">
          <CardHeader className="pb-2" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
            <CardTitle>Budget vs Realizado por Período</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.55, marginTop: 6 }}>
              Barras mensais + linha de desvio mensal
            </p>
          </CardHeader>
          <CardContent className="pt-4 pb-3">
            <ResponsiveContainer width="100%" height={285}>
              <ComposedChart data={periodChartData} margin={{ top: 8, right: 18, left: -8, bottom: 0 }} barGap={6}>
                <CartesianGrid vertical={false} stroke="#F0EDE8" strokeWidth={0.5} />
                <XAxis dataKey="periodo" tick={tickStyle} axisLine={false} tickLine={false} />
                <YAxis yAxisId="bars" tickFormatter={tickFmt} tick={tickStyle} axisLine={false} tickLine={false} width={46} />
                <YAxis yAxisId="line" orientation="right" tickFormatter={tickFmt} tick={{ ...tickStyle, fill: '#B8924A' }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<PeriodTooltip />} cursor={{ fill: 'rgba(184,146,74,0.05)' }} />
                <Legend iconType="square" iconSize={7} wrapperStyle={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, paddingTop: 10, color: '#94a3b8' }} />
                <ReferenceLine yAxisId="bars" y={0} stroke="#1A1820" strokeWidth={1} strokeOpacity={0.22} />
                <Bar yAxisId="bars" dataKey="budget" name="Budget" fill={C.budget} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar yAxisId="bars" dataKey="razao" name="Realizado" fill={C.razao} radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Line yAxisId="line" type="monotone" dataKey="variacaoMes" name="Desvio Mensal" stroke={C.line} strokeWidth={2.2} dot={{ r: 3, fill: C.line, stroke: '#fff', strokeWidth: 1.5 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="xl:col-span-1 grid grid-rows-2 gap-4">
        <Card className="overflow-hidden h-full">
          <CardHeader className="pb-2" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
            <CardTitle>Consumo do Orçamento</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.55, marginTop: 6 }}>
              Usa valores absolutos para despesas/receitas
            </p>
          </CardHeader>
          <CardContent className="pt-4 pb-3 space-y-4">
            <div>
              <p style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: '2.3rem', lineHeight: 1, color: '#1A1820' }}>{formatPct(consumoPct)}</p>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', color: consumoPct <= 100 ? C.pos : C.neg, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{statusLabel}</p>
            </div>

            <div className="rounded-full h-3 overflow-hidden" style={{ backgroundColor: '#EFECE6' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(consumoBar, 100)}%`,
                  backgroundColor: consumoPct <= 100 ? C.pos : C.neg,
                }}
              />
            </div>

            <div className="pt-1">
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: '#9B6E20', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Tendência do desvio acumulado
              </p>
              <ResponsiveContainer width="100%" height={68}>
                <LineChart data={periodChartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <Line type="monotone" dataKey="variacaoYtd" stroke={C.line} strokeWidth={2} dot={false} />
                  <Tooltip content={<PeriodTooltip />} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden h-full">
          <CardHeader className="pb-2" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
            <CardTitle>Maiores Desvios por Departamento</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.55, marginTop: 6 }}>
              Eixo central: 0 · verde favorável · vermelho crítico
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
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={rankedVariance} layout="vertical" margin={{ top: 4, right: 14, left: 2, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="#F5F2EC" strokeWidth={0.5} />
                  <XAxis type="number" domain={[-maxAbs, maxAbs]} tick={tickStyle} tickFormatter={tickFmt} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="dept" width={90} tick={{ ...tickStyle, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DeptTooltip />} cursor={{ fill: 'rgba(184,146,74,0.05)' }} />
                  <ReferenceLine x={0} stroke="#1A1820" strokeOpacity={0.25} />
                  <Bar dataKey="variacao" radius={[3, 3, 3, 3]}>
                    {rankedVariance.map((entry, idx) => <Cell key={`${entry.dept}-${idx}`} fill={entry.color} />)}
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
