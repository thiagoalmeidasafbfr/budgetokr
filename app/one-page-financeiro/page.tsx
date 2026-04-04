'use client'
import { useState, useEffect, useRef } from 'react'
import { Plus, Save, BarChart2 } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { OnePageCanvas } from '@/components/OnePageCanvas'
import { OnePageAddWidgetModal } from '@/components/OnePageAddWidgetModal'
import { OnePageConfigPanel } from '@/components/OnePageConfigPanel'
import { formatPeriodo } from '@/lib/utils'
import type { WidgetConfig } from '@/lib/one-page-types'

export default function OnePageFinanceiro() {
  const [widgets, setWidgets]           = useState<WidgetConfig[]>([])
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingWidget, setEditingWidget]   = useState<WidgetConfig | null>(null)
  const [allPeriodos, setAllPeriodos]   = useState<string[]>([])
  const [selYear, setSelYear]           = useState<string | null>('2026')
  const [selPeriods, setSelPeriods]     = useState<string[]>([])
  const [isSaving, setIsSaving]         = useState(false)
  const [isLoaded, setIsLoaded]         = useState(false)
  const isFirstLoad = useRef(true)

  // ── Load periods ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/analise?type=distinct&col=data_lancamento', { cache: 'no-store' })
      .then(r => r.json())
      .then(dates => {
        const periodos = [
          ...new Set(
            (Array.isArray(dates) ? dates : [])
              .map((d: string) => d?.substring(0, 7))
              .filter(Boolean)
          ),
        ].sort() as string[]
        setAllPeriodos(periodos)

        if (isFirstLoad.current) {
          isFirstLoad.current = false
          const now  = new Date()
          const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          const cur  = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
          const ytd  = periodos.filter(p => p.startsWith('2026') && p <= cur)
          setSelPeriods(ytd.length > 0 ? ytd : periodos.filter(p => p.startsWith('2026')))
        }
      })
      .catch(() => {})
  }, [])

  // Auto-select YTD on year change
  useEffect(() => {
    if (!allPeriodos.length || isFirstLoad.current) return
    if (selYear) {
      const now  = new Date()
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const cur  = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
      const ytd  = allPeriodos.filter(p => p.startsWith(selYear) && p <= cur)
      setSelPeriods(ytd.length > 0 ? ytd : allPeriodos.filter(p => p.startsWith(selYear)))
    } else {
      setSelPeriods([])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selYear])

  // ── Load saved layout ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/one-page-layout', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.widgets && Array.isArray(data.widgets)) {
          setWidgets(data.widgets as WidgetConfig[])
        }
        setIsLoaded(true)
      })
      .catch(() => setIsLoaded(true))
  }, [])

  const yearPeriods = selYear ? allPeriodos.filter(p => p.startsWith(selYear)) : allPeriodos

  function togglePeriod(p: string) {
    setSelPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort())
  }

  function selectAllMonths()  { setSelPeriods(yearPeriods) }
  function clearAllMonths()   { setSelPeriods([]) }

  const selectedWidget   = widgets.find(w => w.id === selectedId) ?? null
  const configPanelOpen  = selectedWidget !== null

  async function saveLayout() {
    setIsSaving(true)
    try {
      await fetch('/api/one-page-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets }),
      })
    } catch { /* silent */ }
    setIsSaving(false)
  }

  function addWidget(w: WidgetConfig)                { setWidgets(prev => [...prev, w]) }
  function updateWidget(id: string, u: Partial<WidgetConfig>) { setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...u } : w)) }
  function deleteWidget(id: string)  { setWidgets(prev => prev.filter(w => w.id !== id)); if (selectedId === id) setSelectedId(null) }
  function duplicateWidget(id: string) {
    const w = widgets.find(x => x.id === id)
    if (!w) return
    addWidget({ ...w, id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: `${w.title} (cópia)` })
  }

  function handleModalClose()          { setIsAddModalOpen(false); setEditingWidget(null) }
  function handleModalAdd(w: WidgetConfig) {
    if (editingWidget) updateWidget(editingWidget.id, w)
    else addWidget(w)
    handleModalClose()
  }
  function handleChangeSource() {
    if (selectedWidget) { setEditingWidget(selectedWidget); setIsAddModalOpen(true) }
  }

  // ── Period label ──────────────────────────────────────────────────────────────
  const periodLabel = (() => {
    if (!selPeriods.length) return 'Nenhum período'
    if (selPeriods.length === 1) return formatPeriodo(selPeriods[0])
    return `${formatPeriodo(selPeriods[0])} → ${formatPeriodo(selPeriods[selPeriods.length - 1])}`
  })()

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F6F2' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 backdrop-blur-sm border-b"
        style={{ backgroundColor: 'rgba(255,255,255,0.96)', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        {/* Row 1: title + controls */}
        <div className="flex items-center gap-3 flex-wrap px-6 py-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(190,140,74,0.12)' }}
            >
              <BarChart2 size={16} style={{ color: '#be8c4a' }} />
            </div>
            <div>
              <p
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9,
                  color: '#9B6E20',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                BI Canvas · {periodLabel}
              </p>
              <h1 className="text-lg font-bold leading-tight" style={{ color: '#0f172a' }}>
                One Page Financeiro
              </h1>
            </div>
          </div>

          <YearFilter periodos={allPeriodos} selYear={selYear} onChange={setSelYear} />

          <button
            onClick={() => { setEditingWidget(null); setIsAddModalOpen(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
            style={{ backgroundColor: '#be8c4a' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#a87840' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#be8c4a' }}
          >
            <Plus size={13} /> Adicionar Widget
          </button>

          <button
            onClick={saveLayout}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
            style={{ borderColor: 'rgba(0,0,0,0.10)', color: '#374151' }}
          >
            {isSaving ? (
              <span
                className="inline-block animate-spin"
                style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #be8c4a', borderTopColor: 'transparent' }}
              />
            ) : (
              <Save size={13} />
            )}
            Salvar
          </button>
        </div>

        {/* Row 2: period selector */}
        {yearPeriods.length > 0 && (
          <div
            className="border-t px-6 py-2 flex items-center gap-2 flex-wrap"
            style={{ borderColor: 'rgba(0,0,0,0.04)', backgroundColor: 'rgba(0,0,0,0.01)' }}
          >
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: '#9B6E20',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Períodos
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {yearPeriods.map(p => {
                const active = selPeriods.includes(p)
                return (
                  <button
                    key={p}
                    onClick={() => togglePeriod(p)}
                    className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                    style={{
                      backgroundColor: active ? 'rgba(190,140,74,0.15)' : 'transparent',
                      color: active ? '#9B6E20' : 'rgba(0,0,0,0.35)',
                      border: active ? '1px solid rgba(190,140,74,0.3)' : '1px solid transparent',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10,
                    }}
                  >
                    {formatPeriodo(p)}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 ml-1">
              <button onClick={selectAllMonths} style={{ color: '#9B6E20', fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}>
                Todos
              </button>
              <button onClick={clearAllMonths} style={{ color: 'rgba(0,0,0,0.35)', fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}>
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div
        className="transition-all duration-300"
        style={{ paddingRight: configPanelOpen ? 292 : 0 }}
      >
        <div className="p-5">
          {!isLoaded ? (
            <div className="grid grid-cols-12 gap-3">
              {[4, 4, 4, 8, 4, 12].map((w, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl"
                  style={{ gridColumn: `span ${w}`, height: i < 3 ? 160 : 280, backgroundColor: 'rgba(0,0,0,0.04)' }}
                />
              ))}
            </div>
          ) : widgets.length === 0 ? (
            <EmptyState onAdd={() => { setEditingWidget(null); setIsAddModalOpen(true) }} />
          ) : (
            <OnePageCanvas
              widgets={widgets}
              selectedId={selectedId}
              selPeriods={selPeriods}
              onSelect={id => setSelectedId(prev => prev === id ? null : id)}
              onReorder={setWidgets}
              onDelete={deleteWidget}
              onDuplicate={duplicateWidget}
            />
          )}
        </div>
      </div>

      {/* ── Config panel ────────────────────────────────────────────────────── */}
      <OnePageConfigPanel
        widget={selectedWidget}
        onClose={() => setSelectedId(null)}
        onUpdate={updates => selectedId && updateWidget(selectedId, updates)}
        onDelete={() => { if (selectedId) deleteWidget(selectedId) }}
        onDuplicate={() => { if (selectedId) duplicateWidget(selectedId) }}
        onChangeSource={handleChangeSource}
        onOpenEditModal={handleChangeSource}
      />

      {/* ── Add / Edit modal ────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <OnePageAddWidgetModal
          initial={editingWidget}
          onClose={handleModalClose}
          onAdd={handleModalAdd}
        />
      )}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const EXAMPLES = [
    { icon: '📊', title: 'Barras horizontais', desc: 'Net Revenue por loja (medida + agrupar por CC)' },
    { icon: '📈', title: 'Linha temporal', desc: 'Evolução da margem EBITDA mês a mês' },
    { icon: '🗺️', title: 'Treemap', desc: 'Distribuição de receita por departamento' },
    { icon: '🎯', title: 'KPI Card', desc: 'Total realizado vs budget com variação' },
  ]

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-20">
      <div className="text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'rgba(190,140,74,0.1)' }}
        >
          <BarChart2 size={26} style={{ color: '#be8c4a' }} />
        </div>
        <p className="font-bold text-xl" style={{ color: '#0f172a' }}>Canvas vazio</p>
        <p className="text-sm mt-1 max-w-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
          Adicione widgets conectados às suas métricas cadastradas para montar seu Business Intelligence
        </p>
      </div>

      {/* Example widgets */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {EXAMPLES.map((ex, i) => (
          <div
            key={i}
            className="rounded-xl p-4"
            style={{ border: '1px solid rgba(0,0,0,0.07)', backgroundColor: '#fff' }}
          >
            <span className="text-xl">{ex.icon}</span>
            <p className="font-semibold text-sm mt-2" style={{ color: '#0f172a' }}>{ex.title}</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.45)' }}>{ex.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-colors"
        style={{ backgroundColor: '#be8c4a' }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#a87840' }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#be8c4a' }}
      >
        <Plus size={15} /> Adicionar primeiro widget
      </button>
    </div>
  )
}
