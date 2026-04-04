'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult, BreakdownItem } from '@/lib/analysis/engine'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

export function AlertList({ config, data, onEdit }: BlockProps) {
  const limite = (config.options?.limite as number) ?? 5
  const ordenar = (config.options?.ordenar as string) ?? 'desvio_pct'
  const titulo = config.titulo ?? 'Top Alertas'

  const items: BreakdownItem[] = [...(data.breakdown ?? [])]
    .filter(b => b.desvio != null && b.desvio < 0)
    .sort((a, b) => {
      if (ordenar === 'desvio_pct') return (a.desvio_pct ?? 0) - (b.desvio_pct ?? 0)
      return (a.desvio ?? 0) - (b.desvio ?? 0)
    })
    .slice(0, limite)

  return (
    <div className="onepage-block bg-white rounded-xl border border-[#E4DFD5] p-4 flex flex-col gap-3">
      <div
        className="text-[11px] font-semibold tracking-wide uppercase"
        style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
      >
        {titulo}
      </div>
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: BRAND.positive }}>
            ✓ Sem desvios negativos
          </p>
        )}
        {items.map((item, i) => (
          <div
            key={item.id ?? i}
            className="flex items-center gap-3 p-2 rounded-lg"
            style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
          >
            <span className="text-base shrink-0">⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: BRAND.ink }}>
                {item.label}
              </p>
              <p className="text-[10px]" style={{ color: BRAND.muted }}>
                Realizado: <span style={{ fontFamily: FONTS.mono }}>{fmtBRL(item.valor_realizado)}</span>
                {item.valor_budget != null && (
                  <> · Budget: <span style={{ fontFamily: FONTS.mono }}>{fmtBRL(item.valor_budget)}</span></>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p
                className="text-sm font-bold"
                style={{ fontFamily: FONTS.mono, color: BRAND.negative }}
              >
                {fmtBRL(item.desvio)}
              </p>
              {item.desvio_pct != null && (
                <p
                  className="text-[10px]"
                  style={{ fontFamily: FONTS.mono, color: BRAND.negative }}
                >
                  {fmtPct(item.desvio_pct)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {onEdit && (
        <button onClick={() => onEdit(config)} className="text-xs text-gray-400 self-end">⚙</button>
      )}
    </div>
  )
}
