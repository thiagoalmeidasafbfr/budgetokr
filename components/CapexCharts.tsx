'use client'
import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface ChartRow { key: string; budget: number; razao: number; variacao: number }

export default function CapexCharts({ chartData, groupBy }: { chartData: ChartRow[]; groupBy: string }) {
  const label = groupBy === 'projeto' ? 'Projeto' : groupBy === 'departamento' ? 'Departamento' : groupBy === 'centro_custo' ? 'Projeto → CC' : 'Período'
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>CAPEX — Budget vs Realizado ({label})</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="key" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
              <YAxis tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Legend />
              <Bar dataKey="budget" name="Budget" fill="#818cf8" radius={[3,3,0,0]} />
              <Bar dataKey="razao"  name="Realizado" fill="#06b6d4" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Variação CAPEX</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 28)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={v => formatCurrency(v).replace('R$\u00a0', '')} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="variacao" name="Variação" radius={[0,3,3,0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.variacao >= 0 ? '#06b6d4' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
