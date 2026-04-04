'use client'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult } from '@/lib/analysis/engine'
import { KpiRow } from './blocks/KpiRow'
import { Waterfall } from './blocks/Waterfall'
import { BarRanking } from './blocks/BarRanking'
import { Donut } from './blocks/Donut'
import { Sparkline } from './blocks/Sparkline'
import { TableBreakdown } from './blocks/TableBreakdown'
import { AlertList } from './blocks/AlertList'
import { TextNote } from './blocks/TextNote'

interface OnepageGridProps {
  blocks: BlockConfig[]
  data: AnalysisResult
  isEditing: boolean
  onReorder: (fromIdx: number, toIdx: number) => void
  onRemove: (id: string) => void
  onEditBlock: (config: BlockConfig) => void
}

function BlockRenderer({ config, data, onEdit }: { config: BlockConfig; data: AnalysisResult; onEdit?: (c: BlockConfig) => void }) {
  switch (config.type) {
    case 'kpi_row':
    case 'kpi_card':
      return <KpiRow config={config} data={data} onEdit={onEdit} />
    case 'waterfall':
      return <Waterfall config={config} data={data} onEdit={onEdit} />
    case 'bar_ranking':
      return <BarRanking config={config} data={data} onEdit={onEdit} />
    case 'donut':
      return <Donut config={config} data={data} onEdit={onEdit} />
    case 'sparkline':
      return <Sparkline config={config} data={data} onEdit={onEdit} />
    case 'table_breakdown':
      return <TableBreakdown config={config} data={data} onEdit={onEdit} />
    case 'alert_list':
      return <AlertList config={config} data={data} onEdit={onEdit} />
    case 'text_note':
      return <TextNote config={config} data={data} onEdit={onEdit} />
    default:
      return (
        <div className="bg-white rounded-xl border border-[#E4DFD5] p-4 text-sm text-gray-400 text-center">
          Bloco não reconhecido: {config.type}
        </div>
      )
  }
}

export function OnepageGrid({ blocks, data, isEditing, onReorder, onRemove, onEditBlock }: OnepageGridProps) {
  return (
    <div
      className="onepage-grid grid gap-4"
      style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
    >
      {blocks.map((block, idx) => (
        <div
          key={block.id}
          className="relative group"
          style={{ gridColumn: block.colSpan === 2 ? 'span 2 / span 2' : undefined }}
        >
          <BlockRenderer
            config={block}
            data={data}
            onEdit={isEditing ? onEditBlock : undefined}
          />
          {isEditing && (
            <div
              className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              data-no-print
            >
              {idx > 0 && (
                <button
                  onClick={() => onReorder(idx, idx - 1)}
                  className="w-6 h-6 rounded bg-white border border-[#E4DFD5] text-xs flex items-center justify-center hover:border-[#B8924A] shadow-sm"
                  title="Mover para cima"
                >
                  ↑
                </button>
              )}
              {idx < blocks.length - 1 && (
                <button
                  onClick={() => onReorder(idx, idx + 1)}
                  className="w-6 h-6 rounded bg-white border border-[#E4DFD5] text-xs flex items-center justify-center hover:border-[#B8924A] shadow-sm"
                  title="Mover para baixo"
                >
                  ↓
                </button>
              )}
              <button
                onClick={() => onEditBlock(block)}
                className="w-6 h-6 rounded bg-white border border-[#E4DFD5] text-xs flex items-center justify-center hover:border-[#B8924A] shadow-sm"
                title="Configurar"
              >
                ⚙
              </button>
              <button
                onClick={() => onRemove(block.id)}
                className="w-6 h-6 rounded bg-white border border-red-200 text-xs flex items-center justify-center hover:bg-red-50 shadow-sm text-red-400"
                title="Remover bloco"
              >
                ×
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
