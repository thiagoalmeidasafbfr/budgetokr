'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

export function BarVertical({ config, data }: WidgetProps) {
  const { mostrar_titulo, mostrar_eixos, mostrar_grid, mostrar_legenda } = config.estilo

  let chartData: Array<Record<string, unknown>> = []
  if (data.tipo === 'breakdown') {
    chartData = data.itens.map(i => ({
      name: i.label.length > 14 ? i.label.slice(0, 13) + '…' : i.label,
      Realizado: i.realizado,
      Budget: i.budget ?? 0,
    }))
  } else if (data.tipo === 'serie') {
    chartData = data.pontos.map(p => ({
      name: p.periodo,
      Realizado: p.realizado,
      Budget: p.budget ?? 0,
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
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 32 }}>
            {mostrar_grid && <CartesianGrid strokeDasharray="3 3" stroke={BRAND.muted} opacity={0.3} />}
            {mostrar_eixos && (
              <>
                <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
                       angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
                       tickFormatter={(v:number) => fmtBRL(v, true)} width={60} />
              </>
            )}
            <Tooltip formatter={(v:number) => [fmtBRL(v), '']}
                     contentStyle={{ fontFamily: FONTS.mono, fontSize: 11 }} />
            {mostrar_legenda && <Legend wrapperStyle={{ fontSize: 10, fontFamily: FONTS.mono }} />}
            <Bar dataKey="Realizado" fill={BRAND.gold} radius={[2,2,0,0]} />
            <Bar dataKey="Budget"    fill={BRAND.neutral} opacity={0.5} radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
