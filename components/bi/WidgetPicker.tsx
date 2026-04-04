'use client'
import { BRAND, FONTS } from '@/lib/brand'
import { useBiStore } from '@/lib/bi/store'
import type { WidgetVisual, WidgetConfig, BiPeriodo } from '@/lib/bi/widget-types'
import { WIDGET_META, DEFAULT_ESTILO } from '@/lib/bi/widget-types'

interface WidgetPickerProps {
  onClose: () => void
}

function nextY(widgets: WidgetConfig[]): number {
  if (!widgets.length) return 0
  return Math.max(...widgets.map(w => w.layout.y + w.layout.h))
}

export function WidgetPicker({ onClose }: WidgetPickerProps) {
  const { dashboard, addWidget, setActiveWidget } = useBiStore()

  function handlePick(visual: WidgetVisual) {
    const meta    = WIDGET_META.find(m => m.visual === visual)!
    const now     = new Date()
    const periodo: BiPeriodo = { tipo: 'mes', mes: now.getMonth() + 1, ano: now.getFullYear() }
    const newId   = `widget_${Date.now()}`

    const newWidget: WidgetConfig = {
      id:      newId,
      visual,
      metrica: meta.defaultMetrica,
      scope: {
        periodo,
        comparativo: 'budget',
      },
      estilo: { ...DEFAULT_ESTILO },
      layout: {
        x: 0,
        y: nextY(dashboard.widgets),
        w: meta.defaultW,
        h: meta.defaultH,
      },
    }
    addWidget(newWidget)
    setActiveWidget(newId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-no-print>
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto"
        style={{ border: `1px solid ${BRAND.border}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold tracking-wide"
              style={{ fontFamily: FONTS.heading, color: BRAND.ink, letterSpacing: '0.06em' }}>
            ADICIONAR WIDGET
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {WIDGET_META.map(meta => (
            <button
              key={meta.visual}
              onClick={() => handlePick(meta.visual)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border text-center hover:border-[#B8924A] hover:bg-[#FBF7EE] transition-all group"
              style={{ borderColor: BRAND.border }}
            >
              <span className="text-3xl">{meta.icon}</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: BRAND.ink, fontFamily: FONTS.heading }}>{meta.label}</p>
                <p className="text-[10px] leading-tight mt-0.5" style={{ color: BRAND.muted }}>{meta.descricao}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
