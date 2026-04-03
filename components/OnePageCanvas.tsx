'use client'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Copy, Trash2 } from 'lucide-react'
import type { WidgetConfig } from '@/lib/one-page-types'
import { OnePageWidgetRenderer } from './OnePageWidgetRenderer'

interface OnePageCanvasProps {
  widgets: WidgetConfig[]
  selectedId: string | null
  selPeriods: string[]
  onSelect: (id: string) => void
  onReorder: (widgets: WidgetConfig[]) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

function SortableWidget({
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id })

  const colSpan = Math.max(1, Math.min(12, config.w))

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: `span ${colSpan}`,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 20 : 'auto',
      }}
      className="relative group"
    >
      {/* Widget card */}
      <div
        onClick={() => onSelect(config.id)}
        className="overflow-hidden rounded-xl transition-all cursor-pointer"
        style={{
          minHeight: `${config.h * 80}px`,
          backgroundColor:
            config.borderStyle === 'none'
              ? 'transparent'
              : 'white',
          border:
            config.borderStyle === 'none'
              ? 'none'
              : config.borderStyle === 'subtle'
              ? '1px solid rgba(0,0,0,0.04)'
              : '1px solid rgba(0,0,0,0.06)',
          boxShadow:
            config.borderStyle === 'card'
              ? '0 1px 4px rgba(0,0,0,0.06)'
              : 'none',
          outline: isSelected ? '2px solid #be8c4a' : 'none',
          outlineOffset: '2px',
        }}
      >
        {/* Drag handle — top left */}
        <button
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing rounded-md p-0.5"
          style={{ touchAction: 'none' }}
          onClick={e => e.stopPropagation()}
          title="Arrastar"
        >
          <GripVertical size={14} style={{ color: 'rgba(0,0,0,0.35)' }} />
        </button>

        {/* Action buttons — top right */}
        <div
          className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onDuplicate(config.id)}
            className="p-1 rounded-md transition-colors"
            style={{
              background: 'white',
              border: '1px solid rgba(0,0,0,0.08)',
              color: '#374151',
            }}
            title="Duplicar"
          >
            <Copy size={11} />
          </button>
          <button
            onClick={() => onDelete(config.id)}
            className="p-1 rounded-md transition-colors"
            style={{
              background: 'white',
              border: '1px solid rgba(0,0,0,0.08)',
              color: '#dc2626',
            }}
            title="Deletar"
          >
            <Trash2 size={11} />
          </button>
        </div>

        <OnePageWidgetRenderer config={config} periods={periods} />
      </div>
    </div>
  )
}

export function OnePageCanvas({
  widgets,
  selectedId,
  selPeriods,
  onSelect,
  onReorder,
  onDelete,
  onDuplicate,
}: OnePageCanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id)
      const newIndex = widgets.findIndex(w => w.id === over.id)
      if (oldIndex >= 0 && newIndex >= 0) {
        onReorder(arrayMove(widgets, oldIndex, newIndex))
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={widgets.map(w => w.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-12 gap-3">
          {widgets.map(config => (
            <SortableWidget
              key={config.id}
              config={config}
              isSelected={selectedId === config.id}
              periods={selPeriods}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
