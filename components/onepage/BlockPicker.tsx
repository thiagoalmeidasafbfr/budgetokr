'use client'
import { BRAND, FONTS } from '@/lib/brand'
import type { BlockConfig, BlockType } from '@/lib/analysis/templates'
import { BLOCK_DESCRIPTIONS } from '@/lib/analysis/templates'

interface BlockPickerProps {
  onSelect: (type: BlockType) => void
  onClose: () => void
}

const BLOCK_ICONS: Record<BlockType, string> = {
  kpi_card:        '🎯',
  kpi_row:         '📊',
  waterfall:       '🌊',
  bar_ranking:     '📶',
  donut:           '🍩',
  sparkline:       '📈',
  table_breakdown: '📋',
  gauge_meta:      '⏲',
  alert_list:      '⚠️',
  text_note:       '📝',
}

const ALL_TYPES: BlockType[] = [
  'kpi_row', 'kpi_card', 'waterfall', 'sparkline',
  'bar_ranking', 'donut', 'table_breakdown', 'alert_list',
  'gauge_meta', 'text_note',
]

export function BlockPicker({ onSelect, onClose }: BlockPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4"
        style={{ border: `1px solid ${BRAND.border}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-lg font-bold"
            style={{ fontFamily: FONTS.heading, color: BRAND.ink, letterSpacing: '0.04em' }}
          >
            ADICIONAR BLOCO
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {ALL_TYPES.map(type => (
            <button
              key={type}
              onClick={() => { onSelect(type); onClose() }}
              className="flex items-start gap-3 p-3 rounded-xl border text-left hover:border-[#B8924A] hover:bg-[#FBF7EE] transition-all"
              style={{ borderColor: BRAND.border }}
            >
              <span className="text-2xl shrink-0">{BLOCK_ICONS[type]}</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: BRAND.ink }}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                <p className="text-[11px] leading-tight mt-0.5" style={{ color: BRAND.muted }}>
                  {BLOCK_DESCRIPTIONS[type]}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
