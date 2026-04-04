'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

const FONT_SIZES: Record<string, string> = { xs:'text-xl', sm:'text-2xl', md:'text-3xl', lg:'text-4xl', xl:'text-5xl' }

export function KpiCard({ config, data }: WidgetProps) {
  if (data.tipo !== 'escalar') return null
  const { valor, comparativo, variacao_pct } = data
  const { tamanho_fonte, mostrar_titulo, mostrar_variacao, formato_numero } = config.estilo
  const titulo = config.titulo ?? config.metrica.tipo === 'linha_dre'
    ? (config.metrica as { linha_nome?: string }).linha_nome ?? 'KPI'
    : 'KPI'

  const fmtVal = (v: number) => {
    if (formato_numero === 'percentual') return fmtPct(v)
    return fmtBRL(v, formato_numero === 'milhoes' || formato_numero === 'milhares')
  }

  const isPos = variacao_pct != null && variacao_pct >= 0

  return (
    <div
      className="h-full flex flex-col justify-between p-4 rounded-xl border-b-2"
      style={{ backgroundColor: BRAND.base, borderColor: BRAND.gold }}
    >
      {mostrar_titulo && (
        <span
          className="text-[10px] font-semibold tracking-[0.18em] uppercase truncate"
          style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
        >
          {titulo}
        </span>
      )}
      <span
        className={`font-bold leading-none truncate ${FONT_SIZES[tamanho_fonte] ?? 'text-3xl'}`}
        style={{ fontFamily: FONTS.display, color: BRAND.gold }}
      >
        {fmtVal(valor)}
      </span>
      {mostrar_variacao && variacao_pct != null && (
        <div className="flex items-center gap-1">
          <span style={{ color: isPos ? BRAND.success : BRAND.danger, fontFamily: FONTS.mono, fontSize: 12 }}>
            {isPos ? '↑' : '↓'} {Math.abs(variacao_pct).toFixed(1)}%
          </span>
          {comparativo != null && (
            <span style={{ color: BRAND.muted, fontFamily: FONTS.mono, fontSize: 10 }}>
              vs {fmtVal(comparativo)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
