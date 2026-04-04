'use client'
/**
 * OnePageGridCanvas
 *
 * Drag-to-move + drag-corner-to-resize canvas using react-grid-layout.
 * Each widget occupies grid cells (cols=12, rowHeight=80px).
 *
 * Requires: npm install react-grid-layout @types/react-grid-layout
 * The CSS is inlined in app/globals.css.
 */
import { useCallback } from 'react'
import GridLayout from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import { GripVertical, Copy, Trash2, Settings2 } from 'lucide-react'
import type { WidgetConfig } from '@/lib/one-page-types'
import { OnePageWidgetRenderer } from './OnePageWidgetRenderer'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OnePageGridCanvasProps {
  widgets: WidgetConfig[]
  selectedId: string | null
  selPeriods: string[]
  containerWidth: number
  onSelect: (id: string) => void
  onLayoutChange: (updates: Array<{ id: string; x: number; y: number; w: number; h: number }>) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

// ─── Grid constants ───────────────────────────────────────────────────────────

const COLS       = 12
const ROW_HEIGHT = 80   // px per row unit
const MARGIN     = 12   // gap between widgets

// ─── Widget card ──────────────────────────────────────────────────────────────

function WidgetCard({
  config,
  isSelected,
  periods,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  config: WidgetConfig
  isSelected: boolean
  periods: string[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}) {
  const isTitle = config.type === 'title'

  return (
    <div
      className="w-full h-full relative group overflow-hidden"
      style={{
        borderRadius: 16,
        backgroundColor: isTitle ? 'transparent' : '#ffffff',
        border: isSelected
          ? '2px solid #be8c4a'
          : isTitle
          ? 'none'
          : '1px solid rgba(0,0,0,0.06)',
        boxShadow: isTitle ? 'none' : isSelected
          ? '0 0 0 3px rgba(190,140,74,0.15), 0 4px 16px rgba(0,0,0,0.08)'
          : '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'box-shadow 150ms, border-color 150ms',
        cursor: 'pointer',
      }}
      onClick={() => onSelect(config.id)}
    >
      {/* ── Drag handle — visible on hover, top-left ── */}
      <div
        className="drag-handle absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 cursor-grab active:cursor-grabbing rounded-md p-0.5 select-none"
        style={{ touchAction: 'none', color: 'rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
        title="Arrastar para mover"
      >
        <GripVertical size={14} />
      </div>

      {/* ── Action buttons — top-right on hover ── */}
      <div
        className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onSelect(config.id)}
          className="p-1 rounded-md transition-colors"
          style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', color: '#be8c4a' }}
          title="Configurar"
        >
          <Settings2 size={11} />
        </button>
        <button
          onClick={() => onDuplicate(config.id)}
          className="p-1 rounded-md transition-colors"
          style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', color: '#374151' }}
          title="Duplicar"
        >
          <Copy size={11} />
        </button>
        <button
          onClick={() => onDelete(config.id)}
          className="p-1 rounded-md transition-colors"
          style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', color: '#dc2626' }}
          title="Remover"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* ── Widget content ── */}
      <OnePageWidgetRenderer config={config} periods={periods} />
    </div>
  )
}

// ─── Main canvas ──────────────────────────────────────────────────────────────

export function OnePageGridCanvas({
  widgets,
  selectedId,
  selPeriods,
  containerWidth,
  onSelect,
  onLayoutChange,
  onDelete,
  onDuplicate,
}: OnePageGridCanvasProps) {
  // Map our widget configs to react-grid-layout Layout items
  const layout: Layout[] = widgets.map(w => ({
    i:    w.id,
    x:    Math.max(0, Math.min(COLS - 1, w.x)),
    y:    Math.max(0, w.y),
    w:    Math.max(1, Math.min(COLS, w.w)),
    h:    Math.max(2, w.h),
    minW: 2,
    minH: 2,
  }))

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      const updates = newLayout.map(item => ({
        id: item.i,
        x:  item.x,
        y:  item.y,
        w:  item.w,
        h:  item.h,
      }))
      onLayoutChange(updates)
    },
    [onLayoutChange]
  )

  if (containerWidth < 1) return null

  return (
    <GridLayout
      layout={layout}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      width={containerWidth}
      margin={[MARGIN, MARGIN]}
      isDraggable
      isResizable
      resizeHandles={['se']}
      draggableHandle=".drag-handle"
      onLayoutChange={handleLayoutChange}
      compactType="vertical"
      preventCollision={false}
      useCSSTransforms
      // Transition only on stop, not during drag (smoother)
      transformScale={1}
    >
      {widgets.map(w => (
        <div key={w.id}>
          <WidgetCard
            config={w}
            isSelected={selectedId === w.id}
            periods={selPeriods}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
          />
        </div>
      ))}
    </GridLayout>
  )
}
