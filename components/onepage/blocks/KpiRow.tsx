'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult } from '@/lib/analysis/engine'
import { METRICA_LABELS } from '@/lib/analysis/templates'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

const isPct = (key: string) => key.includes('pct') || key.includes('margem')
const isNeg = (v: number) => v < 0

function KpiCard({ metricKey, data }: { metricKey: string; data: AnalysisResult }) {
  const raw = data[metricKey as keyof AnalysisResult]
  const value = typeof raw === 'number' ? raw : null
  const label = METRICA_LABELS[metricKey] ?? metricKey
  const formatted = value == null ? '—' : isPct(metricKey) ? fmtPct(value) : fmtBRL(value, true)
  const color = value == null ? BRAND.muted : isNeg(value) ? BRAND.negative : BRAND.positive

  return (
    <div className="flex flex-col gap-1 px-4 py-3 border-r border-[#E4DFD5] last:border-r-0 min-w-0 flex-1">
      <span
        className="text-[9px] font-medium tracking-[0.18em] uppercase truncate"
        style={{ fontFamily: FONTS.mono, color: BRAND.muted }}
      >
        {label}
      </span>
      <span
        className="text-2xl md:text-3xl font-bold leading-none truncate"
        style={{ fontFamily: FONTS.display, color: metricKey.startsWith('receita') || metricKey === 'ebit' ? BRAND.gold : color }}
      >
        {formatted}
      </span>
    </div>
  )
}

export function KpiRow({ config, data, onEdit }: BlockProps) {
  const metricas = (config.options?.metricas as string[]) ?? ['receita_bruta', 'ebit', 'margem_ebit', 'resultado_liquido']

  return (
    <div className="onepage-block bg-white rounded-xl border border-[#E4DFD5] overflow-hidden">
      {config.titulo && (
        <div
          className="px-4 py-2 border-b border-[#E4DFD5] text-[11px] font-semibold tracking-wide uppercase"
          style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
        >
          {config.titulo}
        </div>
      )}
      <div className="flex divide-x divide-[#E4DFD5] overflow-x-auto">
        {metricas.map(m => (
          <KpiCard key={m} metricKey={m} data={data} />
        ))}
      </div>
      {onEdit && (
        <button
          onClick={() => onEdit(config)}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Configurar bloco"
        >
          ⚙
        </button>
      )}
    </div>
  )
}
