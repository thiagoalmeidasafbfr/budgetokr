'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import GridLayout, { type Layout } from 'react-grid-layout'
import { BRAND } from '@/lib/brand'
import { useBiStore } from '@/lib/bi/store'
import { periodosFromBiPeriodo } from '@/lib/bi/engine'
import type { BiQueryResult, WidgetConfig } from '@/lib/bi/widget-types'
import { KpiCard }        from './widgets/KpiCard'
import { WaterfallChart } from './widgets/WaterfallChart'
import { BarVertical }    from './widgets/BarVertical'
import { BarHorizontal }  from './widgets/BarHorizontal'
import { LineArea }       from './widgets/LineArea'
import { DonutChart }     from './widgets/DonutChart'
import { PieChartWidget } from './widgets/PieChart'
import { TableWidget }    from './widgets/TableWidget'
import { TextLabel }      from './widgets/TextLabel'
import { WidgetConfigPanel } from './WidgetConfigPanel'
import { WidgetPicker }      from './WidgetPicker'
import { BiHeader }          from './BiHeader'
import { BiSidebar }         from './BiSidebar'

type DataCache = Record<string, BiQueryResult | 'loading' | 'error'>

function WidgetRenderer({ config, data, isEditing, onConfigChange }: {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}) {
  const props = { config, data, isEditing, onConfigChange }
  switch (config.visual) {
    case 'kpi_card':       return <KpiCard        {...props} />
    case 'waterfall':      return <WaterfallChart  {...props} />
    case 'bar_vertical':   return <BarVertical     {...props} />
    case 'bar_horizontal': return <BarHorizontal   {...props} />
    case 'line_area':      return <LineArea        {...props} />
    case 'donut':          return <DonutChart      {...props} />
    case 'pie':            return <PieChartWidget  {...props} />
    case 'table':          return <TableWidget     {...props} />
    case 'text_label':     return <TextLabel       {...props} />
    default:               return <div className="text-xs text-gray-400 p-2">Tipo: {config.visual}</div>
  }
}

const LOADING_RESULT: BiQueryResult = { tipo: 'escalar', valor: 0, comparativo: null, variacao_pct: null }

export function BiCanvas() {
  const {
    dashboard, isEditing, activeWidgetId,
    updateWidget, setActiveWidget,
  } = useBiStore()

  const [dataCache, setDataCache] = useState<DataCache>({})
  const [showPicker, setShowPicker] = useState(false)
  const pendingRef = useRef<Set<string>>(new Set())

  // A4 canvas: 794px wide at 96dpi (210mm), inner grid uses 762px (16px padding each side)
  const A4_WIDTH       = 794
  const A4_GRID_WIDTH  = 762
  const A4_ROW_HEIGHT  = 72   // row unit height in px

  const fetchWidget = useCallback(async (wc: WidgetConfig, globalPeriodo?: typeof dashboard.periodo_global) => {
    const effectiveConfig: WidgetConfig = (wc.scope.useGlobalPeriodo !== false && globalPeriodo)
      ? { ...wc, scope: { ...wc.scope, periodo: globalPeriodo } }
      : wc

    if (pendingRef.current.has(wc.id)) return
    pendingRef.current.add(wc.id)
    setDataCache(prev => ({ ...prev, [wc.id]: 'loading' }))
    try {
      const res = await fetch('/api/bi/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetConfig: effectiveConfig }),
      })
      if (!res.ok) throw new Error(await res.text())
      const result: BiQueryResult = await res.json()
      setDataCache(prev => ({ ...prev, [wc.id]: result }))
    } catch (e) {
      console.error('[BiCanvas] fetch failed for', wc.id, e)
      setDataCache(prev => ({ ...prev, [wc.id]: 'error' }))
    } finally {
      pendingRef.current.delete(wc.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch all widgets when widgets list or global period changes
  useEffect(() => {
    const w = dashboard.widgets.filter(w => w.visual !== 'text_label')
    for (const wc of w) fetchWidget(wc, dashboard.periodo_global)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.widgets, dashboard.periodo_global, fetchWidget])

  const layouts: Layout[] = dashboard.widgets.map(w => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    isDraggable: isEditing,
    isResizable: isEditing,
  }))

  function handleLayoutChange(newLayouts: Layout[]) {
    const updated = dashboard.widgets.map(w => {
      const nl = newLayouts.find(l => l.i === w.id)
      if (!nl) return w
      return { ...w, layout: { x: nl.x, y: nl.y, w: nl.w, h: nl.h } }
    })
    useBiStore.setState(s => ({
      dashboard: { ...s.dashboard, widgets: updated },
      isDirty: true,
    }))
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: BRAND.base }}>
      {/* Left sidebar — period filter */}
      <BiSidebar />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        <BiHeader onAddWidget={() => setShowPicker(true)} />

        {/* Widget grid — A4 one-page format */}
        <div
          className="flex-1 overflow-y-auto bi-canvas"
          style={{ backgroundColor: '#e8e4dd', padding: '24px 20px' }}
        >
          {/* A4 paper */}
          <div
            className="mx-auto bg-white relative"
            style={{
              width: A4_WIDTH,
              minHeight: 1123,   // A4 height at 96dpi (297mm)
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
              padding: '16px',
            }}
          >
          {dashboard.widgets.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-2xl"
              style={{ borderColor: BRAND.border }}
            >
              <p className="text-sm mb-3" style={{ color: BRAND.muted }}>
                Canvas vazio — adicione widgets para começar
              </p>
              {isEditing && (
                <button
                  onClick={() => setShowPicker(true)}
                  className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                  style={{ backgroundColor: BRAND.gold }}
                >
                  + Adicionar primeiro widget
                </button>
              )}
            </div>
          ) : (
            <GridLayout
              className="layout"
              layout={layouts}
              cols={12}
              rowHeight={A4_ROW_HEIGHT}
              width={A4_GRID_WIDTH}
              isDraggable={isEditing}
              isResizable={isEditing}
              margin={[10, 10]}
              containerPadding={[0, 0]}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".rgl-drag-handle"
            >
              {dashboard.widgets.map(wc => {
                const raw = dataCache[wc.id]
                const data: BiQueryResult = (raw && raw !== 'loading' && raw !== 'error')
                  ? raw as BiQueryResult
                  : LOADING_RESULT
                // text_label widgets never fetch data — skip loading/error states
                const isTextLabel = wc.visual === 'text_label'
                const isLoading = !isTextLabel && (raw === 'loading' || raw === undefined)
                const isError   = !isTextLabel && raw === 'error'

                return (
                  <div
                    key={wc.id}
                    className={`rgl-item bg-white rounded-xl overflow-hidden group relative ${isEditing ? 'ring-1 ring-gray-200' : ''}`}
                  >
                    {/* Edit chrome */}
                    {isEditing && (
                      <>
                        {/* Drag handle — left side only */}
                        <div
                          className="rgl-drag-handle absolute top-0 left-0 right-10 h-6 flex items-center px-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-grab"
                          style={{ backgroundColor: BRAND.gold + 'CC' }}
                          data-no-print
                        >
                          <span className="text-white text-[10px] font-mono select-none truncate">
                            ⠿ {wc.titulo ?? wc.visual}
                          </span>
                        </div>

                        {/* Action buttons — right side, outside drag handle */}
                        <div
                          className="absolute top-0 right-0 h-6 flex items-center gap-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                          style={{ backgroundColor: BRAND.gold + 'CC' }}
                          data-no-print
                          onPointerDown={e => e.stopPropagation()}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); setActiveWidget(activeWidgetId === wc.id ? null : wc.id) }}
                            className="text-white text-xs px-1 hover:opacity-70 leading-none"
                            title="Configurar"
                          >⚙</button>
                          <button
                            onClick={e => { e.stopPropagation(); useBiStore.getState().removeWidget(wc.id) }}
                            className="text-white text-xs px-1 hover:opacity-70 leading-none"
                            title="Remover"
                          >×</button>
                        </div>
                      </>
                    )}

                    {/* Content */}
                    <div className={`h-full p-2 ${isEditing ? 'pt-7' : ''}`}>
                      {isLoading ? (
                        <div className="h-full flex items-center justify-center">
                          <div
                            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                            style={{ borderColor: BRAND.gold }}
                          />
                        </div>
                      ) : isError ? (
                        <div className="h-full flex items-center justify-center text-xs text-red-400">
                          Erro ao carregar dados
                        </div>
                      ) : (
                        <WidgetRenderer
                          config={wc}
                          data={data}
                          isEditing={isEditing}
                          onConfigChange={c => updateWidget(wc.id, c)}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </GridLayout>
          )}
          </div>{/* end A4 paper */}
        </div>
      </div>

      {/* Config panel slide-over */}
      {activeWidgetId && isEditing && (
        <WidgetConfigPanel
          widgetId={activeWidgetId}
          onClose={() => setActiveWidget(null)}
        />
      )}

      {/* Widget picker modal */}
      {showPicker && <WidgetPicker onClose={() => setShowPicker(false)} />}
    </div>
  )
}
