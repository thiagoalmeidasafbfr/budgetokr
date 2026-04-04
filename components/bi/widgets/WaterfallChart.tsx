'use client'
import { BRAND, FONTS, fmtValue } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from 'recharts'

export function WaterfallChart({ config, data }: WidgetProps) {
  if (data.tipo !== 'dre') return null

  const entries = data.linhas.map(l => {
    const isSubtotal = l.estrutura.tipo === 'subtotal'
    return {
      name:      l.estrutura.nome,
      value:     Math.abs(l.realizado),
      rawValue:  l.realizado,
      isTotal:   isSubtotal,
      positive:  l.realizado >= 0,
      negrito:   l.estrutura.negrito,
    }
  })

  const fmt = (v: number) => fmtValue(v, config.estilo)
  const fmtTick = fmt

  return (
    <div className="h-full flex flex-col gap-1">
      {config.estilo.mostrar_titulo && config.titulo && (
        <p className="text-[10px] font-semibold tracking-widest uppercase shrink-0"
           style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>{config.titulo}</p>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={entries} margin={{ top: 16, right: 8, left: 0, bottom: 40 }}>
            <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
                   angle={-40} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
                   tickFormatter={fmtTick} width={64} />
            <ReferenceLine y={0} stroke={BRAND.neutral} />
            <Tooltip formatter={(v: number, _: string, p: Record<string,unknown>) =>
              [fmt((p.payload as { rawValue: number }).rawValue), 'Valor']}
              contentStyle={{ fontFamily: FONTS.mono, fontSize: 11 }} />
            <Bar dataKey="value" radius={[2,2,0,0]}
                 label={{ position:'top', formatter: fmt, fontSize:9, fontFamily: FONTS.mono }}>
              {entries.map((e, i) => (
                <Cell key={i}
                  fill={e.isTotal ? BRAND.ink : e.positive ? BRAND.gold : BRAND.danger} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
