'use client'
import { BRAND, FONTS, fmtValue } from '@/lib/brand'
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
  const { tamanho_fonte, mostrar_titulo, mostrar_variacao, cor_primaria, negrito, italico } = config.estilo

  const titulo = config.titulo
    ?? (config.metrica.tipo === 'linha_dre' ? (config.metrica as { linha_nome?: string }).linha_nome
      : config.metrica.tipo === 'medida'    ? (config.metrica as { nome_medida?: string }).nome_medida
      : undefined)
    ?? 'KPI'

  const fmt = (v: number) => fmtValue(v, config.estilo)
  const isPos = variacao_pct != null && variacao_pct >= 0
  const primaryColor = cor_primaria ?? BRAND.gold

  return (
    <div
      className="h-full flex flex-col justify-between p-4 rounded-xl border-b-2"
      style={{ backgroundColor: BRAND.base, borderColor: primaryColor }}
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
        className={`leading-none truncate ${FONT_SIZES[tamanho_fonte] ?? 'text-3xl'} ${negrito ? 'font-bold' : 'font-semibold'} ${italico ? 'italic' : ''}`}
        style={{ fontFamily: FONTS.display, color: primaryColor }}
      >
        {fmt(valor)}
      </span>
      {mostrar_variacao && variacao_pct != null && (
        <div className="flex items-center gap-1">
          <span style={{ color: isPos ? BRAND.positive : BRAND.negative, fontFamily: FONTS.mono, fontSize: 12 }}>
            {isPos ? '↑' : '↓'} {Math.abs(variacao_pct).toFixed(1)}%
          </span>
          {comparativo != null && (
            <span style={{ color: BRAND.muted, fontFamily: FONTS.mono, fontSize: 10 }}>
              vs {fmt(comparativo)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
