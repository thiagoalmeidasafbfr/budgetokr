'use client'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { useState } from 'react'

export function TextLabel({ config, onConfigChange }: WidgetProps) {
  const [editing, setEditing] = useState(false)
  const text = (config.options?.texto as string) ?? config.titulo ?? ''

  function handleBlur(val: string) {
    setEditing(false)
    onConfigChange({ ...config, titulo: val, options: { ...config.options, texto: val } })
  }

  return (
    <div className="h-full flex items-center px-2"
         style={{ fontFamily: FONTS.display, color: BRAND.ink }}>
      {editing ? (
        <input
          className="w-full text-xl font-bold italic bg-transparent border-b outline-none"
          style={{ borderColor: BRAND.gold, color: BRAND.ink }}
          defaultValue={text}
          autoFocus
          onBlur={e => handleBlur(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <p
          className="text-xl font-bold italic cursor-text w-full truncate"
          style={{ color: BRAND.ink }}
          onClick={() => setEditing(true)}
        >
          {text || <span style={{ color: BRAND.muted, fontStyle: 'italic' }}>Clique para editar...</span>}
        </p>
      )}
    </div>
  )
}
