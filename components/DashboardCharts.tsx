'use client'
import React from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip, ResponsiveContainer, Legend, TooltipProps,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface PeriodData {
  raw: string; periodo: string; budget: number; razao: number
  variacaoYtd?: number; budgetYtd?: number; razaoYtd?: number
}
interface DeptData { dept: string; variacao: number }

const C = {
  budget: '#D9D4CC',
  razao:  '#1A1820',
  line:   '#B8924A',
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

function RadarTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: '#1A1820', borderRadius: 4, padding: '8px 12px', border: '0.5px solid rgba(184,146,74,0.2)' }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.7, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{d.dept}</p>
      <p style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 900, fontSize: 16, color: '#fff', letterSpacing: '-0.01em' }}>{formatCurrency(d.raw)}</p>
    </div>
  )
}

const tickFmt = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

export default function DashboardCharts({ periodChartData, deptVariance }: {
  periodChartData: PeriodData[]
  deptVariance: DeptData[]
}) {
  const positives = deptVariance
    .filter(d => d.variacao > 0)
    .sort((a, b) => b.variacao - a.variacao)
    .slice(0, 8)

  const maxVar = positives.length > 0 ? positives[0].variacao : 1
  const radarData = positives.map(d => ({
    dept: d.dept.length > 13 ? d.dept.slice(0, 12) + '…' : d.dept,
    // raiz quadrada para distribuir melhor valores muito dispersos
    value: Math.round(Math.sqrt(d.variacao / maxVar) * 100),
    raw: d.variacao,
  }))

  return (
    <div className="flex gap-4 items-stretch">

      {/* Period chart — 2/3 */}
      <div style={{ flex: 2 }}>
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
                <Bar yAxisId="bars" dataKey="budget"     name="Budget"       fill={C.budget} radius={[2,2,0,0]} maxBarSize={22} />
                <Bar yAxisId="bars" dataKey="razao"      name="Realizado"    fill={C.razao}  radius={[2,2,0,0]} maxBarSize={22} />
                <Line yAxisId="line" type="monotone" dataKey="variacaoYtd" name="Variação YTD"
                  stroke={C.line} strokeWidth={2.5}
                  dot={{ r: 3, fill: C.line, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Radar chart — 1/3 */}
      <div className="flex-1">
        <Card className="overflow-hidden h-full">
          <CardHeader className="pb-2" style={{ borderBottom: '0.5px solid #E4DFD5' }}>
            <CardTitle>Departamentos em Alta</CardTitle>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#B8924A', opacity: 0.55, marginTop: 6 }}>
              Variação positiva · Quanto maior, melhor
            </p>
          </CardHeader>
          <CardContent className="pt-2 pb-3">
            {radarData.length === 0 ? (
              <div className="h-[270px] flex items-center justify-center">
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: '#B8924A', opacity: 0.35, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  Sem variações positivas
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={290}>
                <RadarChart data={radarData} margin={{ top: 12, right: 24, bottom: 12, left: 24 }}>
                  <PolarGrid stroke="#E4DFD5" strokeWidth={0.5} />
                  <PolarAngleAxis
                    dataKey="dept"
                    tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fill: '#475569' }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Variação"
                    dataKey="value"
                    stroke="#1A1820"
                    strokeWidth={1.5}
                    fill="#B8924A"
                    fillOpacity={0.15}
                    dot={{ r: 3, fill: '#1A1820', stroke: '#fff', strokeWidth: 1.5 }}
                  />
                  <Tooltip content={<RadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
