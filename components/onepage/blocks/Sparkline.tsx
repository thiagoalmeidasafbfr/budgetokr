'use client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts'
import { BRAND, FONTS, fmtBRL } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult, SerieTemporal } from '@/lib/analysis/engine'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

function shortMonth(period: string): string {
  const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const m = parseInt(period.split('-')[1] ?? '1', 10)
  return MESES[(m - 1) % 12]
}

export function Sparkline({ config, data, onEdit }: BlockProps) {
  const titulo = config.titulo ?? 'Evolução Temporal'
  const serie: SerieTemporal[] = data.serie_temporal ?? []

  const chartData = serie.map(s => ({
    periodo: shortMonth(s.periodo),
    realizado: s.realizado,
    budget: s.budget,
  }))

  const CustomTooltip = ({ active, payload, label }: Record<string, unknown>) => {
    if (!active || !(payload as unknown[])?.[0]) return null
    return (
      <div className="bg-white border border-[#E4DFD5] rounded-lg p-2 text-xs shadow-sm">
        <p className="font-semibold mb-1" style={{ fontFamily: FONTS.mono }}>{label as string}</p>
        {(payload as Array<Record<string, unknown>>).map((entry, i) => (
          <p key={i} style={{ color: entry.color as string, fontFamily: FONTS.mono }}>
            {entry.name as string}: {fmtBRL(entry.value as number, true)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="onepage-block bg-white rounded-xl border border-[#E4DFD5] p-4 flex flex-col gap-2">
      <div
        className="text-[11px] font-semibold tracking-wide uppercase"
        style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
      >
        {titulo}
      </div>
      {chartData.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sem dados temporais</p>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRealizado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BRAND.gold} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={BRAND.gold} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={BRAND.border} vertical={false} />
              <XAxis
                dataKey="periodo"
                tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
              />
              <YAxis
                tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
                tickFormatter={v => fmtBRL(v, true)}
                width={64}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 10, fontFamily: FONTS.mono }}
              />
              <Area
                type="monotone"
                dataKey="realizado"
                name="Realizado"
                stroke={BRAND.gold}
                strokeWidth={2}
                fill="url(#gradRealizado)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="budget"
                name="Budget"
                stroke={BRAND.muted}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {onEdit && (
        <button onClick={() => onEdit(config)} className="text-xs text-gray-400 self-end">⚙</button>
      )}
    </div>
  )
}
