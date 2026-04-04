'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

export function LineArea({ config, data }: WidgetProps) {
  const { mostrar_titulo, mostrar_eixos, mostrar_grid, mostrar_legenda } = config.estilo
  if (data.tipo !== 'serie') return null

  const chartData = data.pontos.map(p => ({
    name: p.periodo,
    Realizado: p.realizado,
    Budget: p.budget ?? undefined,
  }))

  return (
    <div className="h-full flex flex-col gap-1">
      {mostrar_titulo && config.titulo && (
        <p className="text-[10px] font-semibold tracking-widest uppercase shrink-0"
           style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>{config.titulo}</p>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="gradRealizado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={BRAND.gold} stopOpacity={0.3} />
                <stop offset="95%" stopColor={BRAND.gold} stopOpacity={0}   />
              </linearGradient>
            </defs>
            {mostrar_grid && <CartesianGrid strokeDasharray="3 3" stroke={BRAND.muted} opacity={0.3} vertical={false} />}
            {mostrar_eixos && (
              <>
                <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }} />
                <YAxis tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
                       tickFormatter={(v:number) => fmtBRL(v, true)} width={64} />
              </>
            )}
            <Tooltip formatter={(v:number) => [fmtBRL(v), '']}
                     contentStyle={{ fontFamily: FONTS.mono, fontSize: 11 }} />
            {mostrar_legenda && <Legend wrapperStyle={{ fontSize: 10, fontFamily: FONTS.mono }} />}
            <Area type="monotone" dataKey="Realizado" stroke={BRAND.gold} strokeWidth={2}
                  fill="url(#gradRealizado)" dot={false} />
            <Area type="monotone" dataKey="Budget" stroke={BRAND.muted} strokeWidth={1.5}
                  strokeDasharray="4 4" fill="none" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
