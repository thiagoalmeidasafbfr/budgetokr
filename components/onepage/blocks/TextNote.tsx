'use client'
import { useState } from 'react'
import { BRAND, FONTS } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult } from '@/lib/analysis/engine'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

export function TextNote({ config, onEdit }: BlockProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState((config.options?.texto as string) ?? '')
  const titulo = config.titulo ?? 'Nota'

  function handleBlur() {
    setEditing(false)
    if (onEdit) {
      onEdit({ ...config, options: { ...config.options, texto: text } })
    }
  }

  // Very simple markdown: **bold**, *italic*, newlines
  function renderMarkdown(raw: string) {
    return raw
      .split('\n')
      .map((line, i) => {
        const parts = line
          .split(/\*\*(.+?)\*\*|\*(.+?)\*/g)
          .map((part, j) => {
            if (j % 3 === 1) return <strong key={j}>{part}</strong>
            if (j % 3 === 2) return <em key={j}>{part}</em>
            return part
          })
        return <p key={i} className="min-h-[1em]">{parts}</p>
      })
  }

  return (
    <div className="onepage-block bg-[#FBF7EE] rounded-xl border border-[#E4DFD5] p-4 flex flex-col gap-2">
      <div
        className="text-[11px] font-semibold tracking-wide uppercase"
        style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
      >
        {titulo}
      </div>
      {editing ? (
        <textarea
          className="w-full text-sm leading-relaxed resize-none bg-white rounded-lg border border-[#E4DFD5] p-3 outline-none focus:border-[#B8924A] transition-colors"
          style={{ color: BRAND.ink, fontFamily: FONTS.body, minHeight: 100 }}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={handleBlur}
          autoFocus
          placeholder="Escreva uma nota... Use **negrito** ou *itálico*"
        />
      ) : (
        <div
          className="text-sm leading-relaxed cursor-text min-h-[60px] rounded-lg p-1 hover:bg-white/60 transition-colors"
          style={{ color: BRAND.ink, fontFamily: FONTS.body }}
          onClick={() => setEditing(true)}
        >
          {text ? renderMarkdown(text) : (
            <span className="italic" style={{ color: BRAND.muted }}>Clique para adicionar uma nota...</span>
          )}
        </div>
      )}
    </div>
  )
}
