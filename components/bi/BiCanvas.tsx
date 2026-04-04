'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import GridLayout, { type Layout } from 'react-grid-layout'
import { BRAND, FONTS } from '@/lib/brand'
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

// Per-widget data cache
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

// Placeholder data while loading
const LOADING_RESULT: BiQueryResult = { tipo: 'escalar', valor: 0, comparativo: null, variacao_pct: null }

export function BiCanvas() {
  const {
    dashboard, isEditing, activeWidgetId,
    updateWidget, setActiveWidget, isDirty,
    setDashboard,
  } = useBiStore()

  const [dataCache, setDataCache] = useState<DataCache>({})
  const [showPicker, setShowPicker] = useState(false)
  const [containerWidth, setContainerWidth] = useState(1200)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingRef   = useRef<Set<string>>(new Set())

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Fetch data for a single widget — injects global period when useGlobalPeriodo !== false
  const fetchWidget = useCallback(async (wc: WidgetConfig, globalPeriodo?: typeof dashboard.periodo_global) => {
    const effectiveConfig: WidgetConfig = (wc.scope.useGlobalPeriodo !== false && globalPeriodo)
      ? { ...wc, scope: { ...wc.scope, periodo: globalPeriodo } }
      : wc

    const cacheKey = JSON.stringify({
      id: wc.id,
      periodos: periodosFromBiPeriodo(effectiveConfig.scope.periodo),
      scope: { departamentos: effectiveConfig.scope.departamentos, centros_custo: effectiveConfig.scope.centros_custo },
      metrica: effectiveConfig.metrica,
    })

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
  // dashboard.periodo_global must be in deps to trigger re-fetch on period change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.widgets, dashboard.periodo_global, fetchWidget])

  // React-grid-layout layouts
  const layouts: Layout[] = dashboard.widgets.map(w => ({
    i: w.id,
    x: w.layout.x,
    y: w.layout.y,
    w: w.layout.w,
    h: w.layout.h,
    isDraggable:  isEditing,
    isResizable:  isEditing,
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
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: BRAND.base }}>
      <BiHeader onAddWidget={() => setShowPicker(true)} />

      <div className="flex-1 p-4 bi-canvas" ref={containerRef}>
        {dashboard.widgets.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-2xl"
            style={{ borderColor: BRAND.border }}
          >
            <p className="text-sm mb-3" style={{ color: BRAND.muted }}>Canvas vazio — adicione widgets para começar</p>
            {isEditing && (
              <button
                onClick={() => setShowPicker(true)}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: BRAND.gold }}>
                + Adicionar primeiro widget
              </button>
            )}
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={layouts}
            cols={12}
            rowHeight={80}
            width={containerWidth}
            isDraggable={isEditing}
            isResizable={isEditing}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".rgl-drag-handle"
          >
            {dashboard.widgets.map(wc => {
              const raw = dataCache[wc.id]
              const data: BiQueryResult = (raw && raw !== 'loading' && raw !== 'error')
                ? raw as BiQueryResult
                : LOADING_RESULT
              const isLoading = raw === 'loading' || raw === undefined
              const isError   = raw === 'error'

              return (
                <div
                  key={wc.id}
                  className={`rgl-item bg-white rounded-xl overflow-hidden group relative ${isEditing ? 'ring-1' : ''}`}
                  style={isEditing ? { ringColor: BRAND.border } : undefined}
                >
                  {/* Edit chrome — only in edit mode */}
                  {isEditing && (
                    <>
                      {/* Drag handle strip — only the dots icon is the drag target */}
                      <div
                        className="rgl-drag-handle absolute top-0 left-0 right-10 h-6 flex items-center px-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-grab"
                        style={{ backgroundColor: BRAND.gold + 'CC' }}
                        data-no-print
                      >
                        <span className="text-white text-[10px] font-mono select-none truncate">⠿ {wc.titulo ?? wc.visual}</span>
                      </div>

                      {/* Action buttons — outside drag handle, separate from it */}
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
                        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                             style={{ borderColor: BRAND.gold }} />
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
