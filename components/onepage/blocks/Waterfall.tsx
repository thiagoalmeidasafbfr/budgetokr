'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from 'recharts'
import { BRAND, FONTS, fmtBRL } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult } from '@/lib/analysis/engine'
import { METRICA_LABELS } from '@/lib/analysis/templates'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

interface WaterfallEntry {
  name: string
  value: number
  base: number
  positive: boolean
  isTotal: boolean
}

const DEFAULT_LINHAS = ['receita_bruta','deducoes','receita_liquida','cmv','lucro_bruto','despesas_operacionais','ebit']

export function Waterfall({ config, data, onEdit }: BlockProps) {
  const linhas = (config.options?.linhas as string[]) ?? DEFAULT_LINHAS
  const titulo = config.titulo ?? 'DRE Simplificada'

  // Build waterfall data
  const entries: WaterfallEntry[] = []
  let cumulative = 0

  for (const key of linhas) {
    const raw = data[key as keyof AnalysisResult]
    const value = typeof raw === 'number' ? raw : 0
    const label = METRICA_LABELS[key] ?? key

    // Totals / subtotals stand on zero
    const isSub = key.includes('liquida') || key.includes('bruto') || key === 'ebit' || key === 'resultado_liquido'

    if (isSub) {
      entries.push({ name: label, value: Math.abs(value), base: 0, positive: value >= 0, isTotal: true })
      cumulative = value
    } else {
      const abs = Math.abs(value)
      const positive = value >= 0
      const base = positive ? cumulative : cumulative - abs
      entries.push({ name: label, value: abs, base, positive, isTotal: false })
      cumulative += positive ? abs : -abs
    }
  }

  const CustomLabel = ({ x, y, width, value, entry }: Record<string, unknown>) => {
    const e = entry as WaterfallEntry
    const formatted = fmtBRL(e.positive ? (value as number) : -(value as number), true)
    return (
      <text
        x={(x as number) + (width as number) / 2}
        y={(y as number) - 4}
        textAnchor="middle"
        fontSize={10}
        fontFamily={FONTS.mono}
        fill={BRAND.ink}
      >
        {formatted}
      </text>
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
      <div className="flex-1" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={entries} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fontFamily: FONTS.mono, fill: BRAND.muted }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: FONTS.mono, fill: BRAND.muted }}
              tickFormatter={v => fmtBRL(v, true)}
              width={70}
            />
            <Tooltip
              formatter={(v: number, _: string, props: Record<string,unknown>) => {
                const e = (props.payload as WaterfallEntry)
                return [fmtBRL(e.positive ? v : -v), 'Valor']
              }}
              contentStyle={{ fontFamily: FONTS.mono, fontSize: 11 }}
            />
            <ReferenceLine y={0} stroke={BRAND.border} />
            {/* Invisible base bar */}
            <Bar dataKey="base" stackId="a" fill="transparent" />
            {/* Visible value bar */}
            <Bar dataKey="value" stackId="a" label={<CustomLabel />} radius={[2,2,0,0]}>
              {entries.map((e, i) => (
                <Cell
                  key={i}
                  fill={e.isTotal ? BRAND.ink : e.positive ? BRAND.gold : BRAND.negative}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {onEdit && (
        <button onClick={() => onEdit(config)} className="text-xs text-gray-400 self-end" title="Configurar">⚙</button>
      )}
    </div>
  )
}
