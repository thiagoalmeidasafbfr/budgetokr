'use client'
import { useState, useEffect } from 'react'
import { BarChart3, TrendingDown, TrendingUp, Minus, Upload, Target, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, cn } from '@/lib/utils'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, Cell
} from 'recharts'

interface Summary {
  departments: number
  periods: number
  total_budget: number
  total_actual: number
  total_variance: number
  total_rows: number
}

interface ComparisonRow {
  department: string
  period: string
  budget: number
  actual: number
  variance: number
  variance_pct: number
}

export default function Dashboard() {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [chartData, setChartData] = useState<ComparisonRow[]>([])
  const [metrics, setMetrics] = useState<Array<{ id: number; name: string; color: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/datasets')
      .then(r => r.json())
      .then(data => {
        setActiveId(data.activeId)
        if (data.activeId) loadDashboard(data.activeId)
        else setLoading(false)
      })
    fetch('/api/metrics').then(r => r.json()).then(setMetrics)
  }, [])

  const loadDashboard = async (id: number) => {
    setLoading(true)
    const [sum, comp] = await Promise.all([
      fetch(`/api/comparison?datasetId=${id}&type=summary`).then(r => r.json()),
      fetch(`/api/comparison?datasetId=${id}`).then(r => r.json()),
    ])
    setSummary(sum)
    setChartData(comp)
    setLoading(false)
  }

  if (!activeId && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
          <AlertCircle size={32} className="text-indigo-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Nenhum dataset carregado</h2>
          <p className="text-gray-500 text-sm mb-4">Importe sua planilha Excel para começar</p>
          <Link href="/upload">
            <Button><Upload size={16} /> Importar Dados</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Carregando dados...</p>
        </div>
      </div>
    )
  }

  // Aggregate by department
  const byDept = chartData.reduce<Record<string, { budget: number; actual: number; variance: number }>>((acc, row) => {
    if (!acc[row.department]) acc[row.department] = { budget: 0, actual: 0, variance: 0 }
    acc[row.department].budget += row.budget
    acc[row.department].actual += row.actual
    acc[row.department].variance += row.variance
    return acc
  }, {})

  const deptChartData = Object.entries(byDept)
    .map(([department, vals]) => ({ department, ...vals }))
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 10)

  // Aggregate by period
  const byPeriod = chartData.reduce<Record<string, { budget: number; actual: number }>>((acc, row) => {
    if (!acc[row.period]) acc[row.period] = { budget: 0, actual: 0 }
    acc[row.period].budget += row.budget
    acc[row.period].actual += row.actual
    return acc
  }, {})
  const periodChartData = Object.entries(byPeriod)
    .map(([period, vals]) => ({ period, ...vals }))
    .sort((a, b) => a.period.localeCompare(b.period))

  const variance = summary?.total_variance ?? 0
  const variancePct = summary?.total_budget ? (variance / Math.abs(summary.total_budget)) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Visão geral consolidada do orçamento</p>
        </div>
        <div className="flex gap-2">
          <Link href="/metrics">
            <Button variant="outline" size="sm"><Target size={14} /> Métricas ({metrics.length})</Button>
          </Link>
          <Link href="/comparison">
            <Button size="sm"><BarChart3 size={14} /> Ver Comparação</Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Budget Total"
          value={formatCurrency(summary?.total_budget ?? 0)}
          sub={`${(summary?.departments ?? 0)} departamentos`}
          icon={<BarChart3 size={18} className="text-indigo-500" />}
          color="indigo"
        />
        <SummaryCard
          title="Realizado Total"
          value={formatCurrency(summary?.total_actual ?? 0)}
          sub={`${(summary?.periods ?? 0)} períodos`}
          icon={<TrendingUp size={18} className="text-emerald-500" />}
          color="emerald"
        />
        <SummaryCard
          title="Variação"
          value={formatCurrency(variance)}
          sub={formatPct(variancePct)}
          icon={variance >= 0
            ? <TrendingUp size={18} className="text-emerald-500" />
            : <TrendingDown size={18} className="text-red-500" />}
          color={variance >= 0 ? 'emerald' : 'red'}
          highlight
        />
        <SummaryCard
          title="Linhas Importadas"
          value={(summary?.total_rows ?? 0).toLocaleString('pt-BR')}
          sub="registros processados"
          icon={<Minus size={18} className="text-gray-400" />}
          color="gray"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Budget vs Realizado por Período</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={periodChartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => formatCurrency(v).replace('R$', '')} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend iconType="circle" iconSize={8} />
                <Bar dataKey="budget" name="Budget" fill="#818cf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" name="Realizado" fill="#34d399" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variação por Departamento (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={deptChartData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={v => formatCurrency(v).replace('R$', '')} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="department" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="variance" name="Variação" radius={[0, 3, 3, 0]}>
                  {deptChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.variance >= 0 ? '#34d399' : '#f87171'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Department Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo por Departamento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Departamento</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Budget</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Realizado</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byDept).map(([dept, vals], i) => {
                  const pct = vals.budget ? (vals.variance / Math.abs(vals.budget)) * 100 : 0
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{dept || '—'}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(vals.budget)}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(vals.actual)}</td>
                      <td className={cn('px-5 py-3 text-right font-medium', vals.variance >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {formatCurrency(vals.variance)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge variant={pct >= 0 ? 'success' : 'destructive'}>
                          {formatPct(pct)}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({
  title, value, sub, icon, color, highlight,
}: {
  title: string; value: string; sub: string; icon: React.ReactNode; color: string; highlight?: boolean
}) {
  return (
    <Card className={cn(highlight && 'ring-1 ring-indigo-100')}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            color === 'indigo' && 'bg-indigo-50',
            color === 'emerald' && 'bg-emerald-50',
            color === 'red' && 'bg-red-50',
            color === 'gray' && 'bg-gray-100',
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
