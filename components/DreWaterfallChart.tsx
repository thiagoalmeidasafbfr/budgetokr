'use client'
import React from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import type { TreeNode, DRELinha } from '@/lib/dre-utils'

interface WaterfallEntry {
  name: string
  shortName: string
  offset: number
  bar: number
  isPositive: boolean
  isSubtotal: boolean
  rawValue: number
}

function buildWaterfallData(tree: TreeNode[], dreLinhas: DRELinha[], tipo: 'budget' | 'razao'): WaterfallEntry[] {
  const result: WaterfallEntry[] = []
  let running = 0
  for (const linha of dreLinhas) {
    const node = tree.find(n => n.name === linha.nome)
    if (!node) continue
    const value = tipo === 'budget' ? node.budget : node.razao
    if (linha.tipo === 'grupo') {
      const isPositive = value >= 0
      result.push({
        name: linha.nome,
        shortName: linha.nome.length > 18 ? linha.nome.substring(0, 16) + '…' : linha.nome,
        offset: isPositive ? running : running + value,
        bar: Math.abs(value),
        isPositive, isSubtotal: false, rawValue: value,
      })
      running += value
    } else {
      const isPositive = value >= 0
      result.push({
        name: linha.nome,
        shortName: linha.nome.length > 18 ? linha.nome.substring(0, 16) + '…' : linha.nome,
        offset: isPositive ? 0 : value,
        bar: Math.abs(value),
        isPositive, isSubtotal: true, rawValue: value,
      })
    }
  }
  return result
}

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WaterfallEntry }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800 mb-1">{d.name}</p>
      <p className={d.isPositive ? 'text-emerald-600' : 'text-red-500'}>{formatCurrency(d.rawValue)}</p>
    </div>
  )
}

export default function WaterfallChart({ tree, dreLinhas }: { tree: TreeNode[]; dreLinhas: DRELinha[] }) {
  const budgetData = buildWaterfallData(tree, dreLinhas, 'budget')
  const razaoData  = buildWaterfallData(tree, dreLinhas, 'razao')

  const renderChart = (data: WaterfallEntry[], title: string, color: string) => (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">{title}</p>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 10, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="shortName" tick={{ fontSize: 10, fill: '#6b7280' }} angle={-40} textAnchor="end" interval={0} />
          <YAxis
            tickFormatter={(v: number) => {
              if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`
              if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
              return String(v)
            }}
            tick={{ fontSize: 10, fill: '#6b7280' }} width={56}
          />
          <Tooltip content={<WaterfallTooltip />} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          <Bar dataKey="offset" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" stackId="wf" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.isSubtotal ? color : entry.isPositive ? '#22c55e' : '#ef4444'}
                opacity={entry.isSubtotal ? 1 : 0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex gap-6">
          {renderChart(budgetData, 'Orçado (Budget)', '#6366f1')}
          {renderChart(razaoData, 'Realizado', '#0ea5e9')}
        </div>
        <div className="flex items-center gap-4 mt-3 justify-center flex-wrap">
          {[
            { color: '#22c55e', label: 'Positivo (receita / ganho)' },
            { color: '#ef4444', label: 'Negativo (custo / dedução)' },
            { color: '#6366f1', label: 'Subtotal Budget' },
            { color: '#0ea5e9', label: 'Subtotal Realizado' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: l.color }} />
              <span className="text-xs text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
