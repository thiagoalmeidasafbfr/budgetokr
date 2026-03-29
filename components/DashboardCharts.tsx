'use client'
import React from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell, TooltipProps,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface PeriodData {
  raw: string; periodo: string; budget: number; razao: number
  variacaoYtd?: number; budgetYtd?: number; razaoYtd?: number
}
interface DeptData { dept: string; variacao: number }

const C = {
  budget: '#cbd5e1',
  razao:  '#334155',
  line:   '#d97706',
  pos:    '#059669',
  neg:    '#dc2626',
  grid:   '#f1f5f9',
}

function PeriodTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0f172a', borderRadius:12, padding:'10px 14px', minWidth:190, border:'1px solid rgba(255,255,255,0.1)', fontSize:12 }}>
      <p style={{ color:'#94a3b8', fontWeight:600, marginBottom:8 }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:16, padding:'2px 0' }}>
          <span style={{ display:'flex', alignItems:'center', gap:6, color:'#94a3b8' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:entry.color as string, flexShrink:0 }} />
            {entry.name}
          </span>
          <span style={{ fontWeight:600, color:'#fff', fontVariantNumeric:'tabular-nums' }}>{formatCurrency(Number(entry.value))}</span>
        </div>
      ))}
    </div>
  )
}

function DeptTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const val = Number(payload[0]?.payload?.variacao ?? payload[0]?.value ?? 0)
  return (
    <div style={{ background:'#0f172a', borderRadius:12, padding:'10px 14px', border:'1px solid rgba(255,255,255,0.1)', fontSize:12 }}>
      <p style={{ color:'#94a3b8', fontWeight:600, marginBottom:6, maxWidth:220 }}>{label}</p>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ width:8, height:8, borderRadius:'50%', background: val >= 0 ? C.pos : C.neg, flexShrink:0 }} />
        <span style={{ fontWeight:700, color: val >= 0 ? '#34d399' : '#f87171', fontVariantNumeric:'tabular-nums' }}>
          {formatCurrency(val)}
        </span>
      </div>
    </div>
  )
}

const tickFmt = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

const TOP_N = 5

function DeptMiniChart({
  data, color, xDomain,
}: {
  data: DeptData[]
  color: string
  xDomain?: [number | string, number | string]
}) {
  if (data.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center text-xs text-gray-400">
        Nenhum departamento nesta categoria
      </div>
    )
  }
  const h = Math.max(data.length * 40 + 16, 100)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis
          type="number"
          domain={xDomain ?? ['auto', 'auto']}
          tickFormatter={tickFmt}
          tick={{ fontSize: 9, fill: '#94a3b8' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          type="category" dataKey="dept" width={124}
          tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
        />
        <Tooltip content={<DeptTooltip />} cursor={{ fill: '#f8fafc' }} />
        <Bar
          dataKey="variacao" name="Variação"
          radius={color === C.pos ? [0, 3, 3, 0] : [3, 0, 0, 3]}
          maxBarSize={18}
          label={{ formatter: (v: number) => tickFmt(v), fontSize: 9, fill: '#64748b', position: 'right' }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={color} opacity={Math.max(0.55, 0.92 - i * 0.08)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function DashboardCharts({ periodChartData, deptVariance }: {
  periodChartData: PeriodData[]
  deptVariance: DeptData[]
}) {
  const positives = deptVariance
    .filter(d => d.variacao > 0)
    .sort((a, b) => b.variacao - a.variacao)
    .slice(0, TOP_N)

  const negatives = deptVariance
    .filter(d => d.variacao < 0)
    .sort((a, b) => a.variacao - b.variacao)
    .slice(0, TOP_N)

  return (
    <div className="space-y-4">
      {/* Budget vs Realizado — full width */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-1 border-b border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-700">Budget vs Realizado por Período</CardTitle>
          <p className="text-xs text-gray-400 mt-0.5">Linha: variação acumulada YTD</p>
        </CardHeader>
        <CardContent className="pt-4 pb-2">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={periodChartData} margin={{ top: 8, right: 12, left: -4, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="bars" tickFormatter={tickFmt} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <YAxis yAxisId="line" orientation="right" tickFormatter={tickFmt} tick={{ fontSize: 10, fill: '#d97706' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<PeriodTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 10, color: '#64748b' }} />
              <Bar yAxisId="bars" dataKey="budget" name="Budget"    fill={C.budget} radius={[3,3,0,0]} maxBarSize={26} />
              <Bar yAxisId="bars" dataKey="razao"  name="Realizado" fill={C.razao}  radius={[3,3,0,0]} maxBarSize={26} />
              <Line yAxisId="line" type="monotone" dataKey="variacaoYtd" name="Variação YTD"
                stroke={C.line} strokeWidth={2}
                dot={{ r: 3, fill: C.line, stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Dept variance — two charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <CardHeader className="pb-1 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
              Top Variação Positiva
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Acima do budget · Top {TOP_N}
              {positives.length === 0 && ' · nenhum'}
            </p>
          </CardHeader>
          <CardContent className="pt-3 pb-2">
            <DeptMiniChart data={positives} color={C.pos} xDomain={[0, 'auto']} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-1 border-b border-gray-100">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block flex-shrink-0" />
              Top Variação Negativa
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Abaixo do budget · Top {TOP_N}
              {negatives.length === 0 && ' · nenhum'}
            </p>
          </CardHeader>
          <CardContent className="pt-3 pb-2">
            <DeptMiniChart data={negatives} color={C.neg} xDomain={['auto', 0]} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
