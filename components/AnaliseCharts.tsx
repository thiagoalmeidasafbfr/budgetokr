'use client'
import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface ChartRow { key: string; budget: number; razao: number; variacao: number }

export default function AnaliseCharts({ chartData }: { chartData: ChartRow[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Budget vs Razão</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="key" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Legend />
              <Bar dataKey="budget" name="Budget" fill="#818cf8" radius={[3,3,0,0]} />
              <Bar dataKey="razao"  name="Razão"  fill="#34d399" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Variação</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="variacao" name="Variação" radius={[0,3,3,0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.variacao >= 0 ? '#34d399' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
