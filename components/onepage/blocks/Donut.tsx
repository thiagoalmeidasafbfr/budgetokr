'use client'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { BRAND, FONTS, CHART_PALETTE, fmtBRL } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult, BreakdownItem } from '@/lib/analysis/engine'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

export function Donut({ config, data, onEdit }: BlockProps) {
  const titulo = config.titulo ?? config.options?.titulo as string ?? 'Distribuição'
  const agruparPor = config.options?.agrupar_por as string ?? 'item'

  let items: Array<{ name: string; value: number }>

  if (agruparPor === 'natureza') {
    const byNat: Record<string, number> = {}
    for (const b of (data.breakdown ?? []) as BreakdownItem[]) {
      byNat[b.natureza] = (byNat[b.natureza] ?? 0) + Math.abs(b.valor_realizado)
    }
    items = Object.entries(byNat)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  } else {
    items = ((data.breakdown ?? []) as BreakdownItem[])
      .filter(b => Math.abs(b.valor_realizado) > 0)
      .slice(0, 8)
      .map(b => ({ name: b.label, value: Math.abs(b.valor_realizado) }))
  }

  const total = items.reduce((s, i) => s + i.value, 0)

  const CustomLegend = ({ payload }: Record<string, unknown>) => (
    <ul className="flex flex-col gap-1 mt-2">
      {((payload as Array<Record<string, unknown>>) ?? []).map((entry, i) => (
        <li key={i} className="flex items-center gap-1.5 text-[11px]">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color as string }} />
          <span className="truncate" style={{ color: BRAND.ink, maxWidth: 140 }}>{entry.value as string}</span>
          <span className="ml-auto font-medium shrink-0" style={{ fontFamily: FONTS.mono, color: BRAND.muted }}>
            {total > 0 ? `${((items[i]?.value ?? 0) / total * 100).toFixed(1)}%` : '—'}
          </span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="onepage-block bg-white rounded-xl border border-[#E4DFD5] p-4 flex flex-col gap-2">
      <div
        className="text-[11px] font-semibold tracking-wide uppercase"
        style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
      >
        {titulo}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={items}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {items.map((_, i) => (
                  <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [fmtBRL(v, true), 'Valor']}
                contentStyle={{ fontFamily: FONTS.mono, fontSize: 11 }}
              />
              <Legend content={<CustomLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {onEdit && (
        <button onClick={() => onEdit(config)} className="text-xs text-gray-400 self-end">⚙</button>
      )}
    </div>
  )
}
