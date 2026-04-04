'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult, BreakdownItem } from '@/lib/analysis/engine'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

function statusColor(desvio: number | null) {
  if (desvio == null) return BRAND.neutral
  if (desvio > 0) return BRAND.positive
  return BRAND.negative
}

function statusBg(desvio: number | null) {
  if (desvio == null) return '#F3F4F6'
  if (desvio > 0) return '#D1FAE5'
  return '#FEE2E2'
}

export function BarRanking({ config, data, onEdit }: BlockProps) {
  const limite = (config.options?.limite as number) ?? 10
  const ordenar = (config.options?.ordenar as string) ?? 'valor_realizado'
  const titulo = config.titulo ?? 'Ranking'

  const items: BreakdownItem[] = [...(data.breakdown ?? [])]
    .sort((a, b) => {
      if (ordenar === 'desvio') return Math.abs(b.desvio ?? 0) - Math.abs(a.desvio ?? 0)
      if (ordenar === 'desvio_pct') return Math.abs(b.desvio_pct ?? 0) - Math.abs(a.desvio_pct ?? 0)
      return Math.abs(b.valor_realizado) - Math.abs(a.valor_realizado)
    })
    .slice(0, limite)

  const maxVal = Math.max(...items.map(i => Math.abs(i.valor_realizado)), 1)

  return (
    <div className="onepage-block bg-white rounded-xl border border-[#E4DFD5] p-4 flex flex-col gap-3">
      <div
        className="text-[11px] font-semibold tracking-wide uppercase"
        style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
      >
        {titulo}
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 360 }}>
        {items.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Sem dados</p>
        )}
        {items.map((item, i) => {
          const pct = (Math.abs(item.valor_realizado) / maxVal) * 100
          const color = statusColor(item.desvio)
          const bg = statusBg(item.desvio)
          return (
            <div key={item.id ?? i} className="flex items-center gap-2 min-w-0">
              <span
                className="text-[10px] w-4 shrink-0 text-right"
                style={{ fontFamily: FONTS.mono, color: BRAND.muted }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-xs truncate font-medium" style={{ color: BRAND.ink }}>
                    {item.label}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-xs font-medium"
                      style={{ fontFamily: FONTS.mono, color: BRAND.ink }}
                    >
                      {fmtBRL(item.valor_realizado, true)}
                    </span>
                    {item.desvio_pct != null && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ fontFamily: FONTS.mono, color, backgroundColor: bg }}
                      >
                        {fmtPct(item.desvio_pct)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-1.5 rounded-full" style={{ backgroundColor: '#F3F4F6' }}>
                  <div
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: BRAND.gold }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {onEdit && (
        <button onClick={() => onEdit(config)} className="text-xs text-gray-400 self-end">⚙</button>
      )}
    </div>
  )
}
