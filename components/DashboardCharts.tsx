'use client'
import React from 'react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface PeriodData {
  raw: string; periodo: string; budget: number; razao: number
  variacaoYtd?: number; budgetYtd?: number; razaoYtd?: number
}
interface DeptData { dept: string; variacao: number }

export default function DashboardCharts({ periodChartData, deptVariance }: {
  periodChartData: PeriodData[]
  deptVariance: DeptData[]
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Budget vs Razão por Período</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={periodChartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={v => formatCurrency(v).replace('R$\u00a0','')} tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => formatCurrency(v).replace('R$\u00a0','')} tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v, name) => [formatCurrency(Number(v)), name]}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend iconType="circle" iconSize={8} />
              <Bar yAxisId="left" dataKey="budget" name="Budget" fill="#818cf8" radius={[3,3,0,0]} />
              <Bar yAxisId="left" dataKey="razao"  name="Razão"  fill="#34d399" radius={[3,3,0,0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="variacaoYtd"
                name="Variação YTD"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Variação por Departamento (Top 10)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={deptVariance} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={v => formatCurrency(v).replace('R$\u00a0','')} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="dept" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="variacao" name="Variação" radius={[0,3,3,0]}>
                {deptVariance.map((e, i) => <Cell key={i} fill={e.variacao >= 0 ? '#34d399' : '#f87171'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
