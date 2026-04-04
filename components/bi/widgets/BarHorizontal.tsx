'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import { CHART_PALETTE } from '@/lib/brand'

export function BarHorizontal({ config, data }: WidgetProps) {
  const { mostrar_titulo, mostrar_eixos, mostrar_grid } = config.estilo

  let chartData: Array<{ name: string; value: number }> = []
  if (data.tipo === 'breakdown') {
    chartData = data.itens.map(i => ({
      name: i.label.length > 18 ? i.label.slice(0, 17) + '…' : i.label,
      value: i.realizado,
    }))
  } else if (data.tipo === 'topN') {
    chartData = data.itens.map(i => ({
      name: i.label.length > 18 ? i.label.slice(0, 17) + '…' : i.label,
      value: i.valor,
    }))
  }

  return (
    <div className="h-full flex flex-col gap-1">
      {mostrar_titulo && config.titulo && (
        <p className="text-[10px] font-semibold tracking-widest uppercase shrink-0"
           style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>{config.titulo}</p>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
            {mostrar_grid && <CartesianGrid strokeDasharray="3 3" stroke={BRAND.muted} opacity={0.3} horizontal={false} />}
            {mostrar_eixos && (
              <>
                <XAxis type="number" tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
                       tickFormatter={(v:number) => fmtBRL(v, true)} />
                <YAxis type="category" dataKey="name" width={120}
                       tick={{ fontSize: 10, fontFamily: FONTS.mono, fill: BRAND.ink }} />
              </>
            )}
            <Tooltip formatter={(v:number) => [fmtBRL(v), '']}
                     contentStyle={{ fontFamily: FONTS.mono, fontSize: 11 }} />
            <Bar dataKey="value" radius={[0,2,2,0]}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
