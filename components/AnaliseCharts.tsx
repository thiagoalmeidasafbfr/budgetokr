'use client'
import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, TooltipProps } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface ChartRow { key: string; budget: number; razao: number; variacao: number }

function DarkTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: '#fff', fontWeight: 700 }}>
          {p.name}: {formatCurrency(Number(p.value))}
        </p>
      ))}
    </div>
  )
}

function VariacaoTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const val = Number(payload[0].value)
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: val >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>{formatCurrency(val)}</p>
    </div>
  )
}

export default function AnaliseCharts({ chartData }: { chartData: ChartRow[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Budget vs Razão</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 30 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="key" angle={-30} textAnchor="end" tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} interval={0} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="budget" name="Budget" fill="#cbd5e1" radius={[3,3,0,0]} />
              <Bar dataKey="razao"  name="Razão"  fill="#334155" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            {[{ color: '#cbd5e1', label: 'Budget' }, { color: '#334155', label: 'Realizado' }].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: l.color }} />
                <span className="font-mono text-[10px] text-gray-500">{l.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Variação</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 10, fill: '#475569', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} />
              <Tooltip content={<VariacaoTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="variacao" name="Variação" radius={[0,3,3,0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.variacao >= 0 ? '#059669' : '#dc2626'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
