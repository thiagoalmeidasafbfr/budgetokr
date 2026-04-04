'use client'
import { BRAND, FONTS, fmtValue } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { CHART_PALETTE } from '@/lib/brand'

export function DonutChart({ config, data }: WidgetProps) {
  if (data.tipo !== 'breakdown') return null
  const { mostrar_titulo, mostrar_legenda } = config.estilo
  const fmt = (v: number) => fmtValue(v, config.estilo)

  const chartData = data.itens
    .filter(i => Math.abs(i.realizado) > 0)
    .slice(0, 8)
    .map(i => ({ name: i.label, value: Math.abs(i.realizado) }))

  return (
    <div className="h-full flex flex-col gap-1">
      {mostrar_titulo && config.titulo && (
        <p className="text-[10px] font-semibold tracking-widest uppercase shrink-0"
           style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>{config.titulo}</p>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name"
                 cx="50%" cy="50%" innerRadius="40%" outerRadius="65%" paddingAngle={2}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v:number) => [fmt(v), 'Valor']}
                     contentStyle={{ fontFamily: FONTS.mono, fontSize: 11 }} />
            {mostrar_legenda && (
              <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: 10, fontFamily: FONTS.mono }} />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
