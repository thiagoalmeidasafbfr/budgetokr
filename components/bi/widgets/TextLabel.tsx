'use client'
import { BRAND, FONTS } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { useState } from 'react'

const FONT_SIZES: Record<string, string> = { xs:'text-sm', sm:'text-base', md:'text-xl', lg:'text-2xl', xl:'text-3xl' }

export function TextLabel({ config, onConfigChange }: WidgetProps) {
  const [editing, setEditing] = useState(false)
  const text = (config.options?.texto as string) ?? config.titulo ?? ''
  const { tamanho_fonte, cor_primaria, negrito, italico } = config.estilo
  const textSize  = FONT_SIZES[tamanho_fonte] ?? 'text-xl'
  const textColor = cor_primaria ?? BRAND.ink

  function handleBlur(val: string) {
    setEditing(false)
    onConfigChange({ ...config, titulo: val, options: { ...config.options, texto: val } })
  }

  return (
    <div className="h-full flex items-center px-2"
         style={{ fontFamily: FONTS.display, color: BRAND.ink }}>
      {editing ? (
        <input
          className={`w-full bg-transparent border-b outline-none ${textSize} ${negrito ? 'font-bold' : 'font-semibold'} ${italico ? 'italic' : ''}`}
          style={{ borderColor: BRAND.gold, color: textColor }}
          defaultValue={text}
          autoFocus
          onBlur={e => handleBlur(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <p
          className={`cursor-text w-full truncate ${textSize} ${negrito ? 'font-bold' : 'font-semibold'} ${italico ? 'italic' : ''}`}
          style={{ color: textColor }}
          onClick={() => setEditing(true)}
        >
          {text || <span style={{ color: BRAND.muted, fontStyle: 'italic' }}>Clique para editar...</span>}
        </p>
      )}
    </div>
  )
}
