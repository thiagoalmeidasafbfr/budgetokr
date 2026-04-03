'use client'
import { useState, useEffect } from 'react'
import { Plus, Save, LayoutGrid } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { OnePageCanvas } from '@/components/OnePageCanvas'
import { OnePageAddWidgetModal } from '@/components/OnePageAddWidgetModal'
import { OnePageConfigPanel } from '@/components/OnePageConfigPanel'
import type { WidgetConfig } from '@/lib/one-page-types'

export default function OnePageFinanceiro() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null)
  const [allPeriodos, setAllPeriodos] = useState<string[]>([])
  const [selYear, setSelYear] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Carregar períodos disponíveis
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
      })
      .catch(() => {})
  }, [])

  // Carregar layout salvo
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

  const filteredPeriodos = selYear
    ? allPeriodos.filter(p => p.startsWith(selYear))
    : allPeriodos

  const selectedWidget = widgets.find(w => w.id === selectedId) ?? null
  const configPanelOpen = selectedWidget !== null

  async function saveLayout() {
    setIsSaving(true)
    try {
      await fetch('/api/one-page-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets }),
      })
    } catch {
      // silently fail
    }
    setIsSaving(false)
  }

  function addWidget(w: WidgetConfig) {
    setWidgets(prev => [...prev, w])
  }

  function updateWidget(id: string, updates: Partial<WidgetConfig>) {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w))
  }

  function deleteWidget(id: string) {
    setWidgets(prev => prev.filter(w => w.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function duplicateWidget(id: string) {
    const widget = widgets.find(w => w.id === id)
    if (!widget) return
    const newWidget: WidgetConfig = {
      ...widget,
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${widget.title} (cópia)`,
    }
    setWidgets(prev => [...prev, newWidget])
  }

  function handleModalClose() {
    setIsAddModalOpen(false)
    setEditingWidget(null)
  }

  function handleModalAdd(w: WidgetConfig) {
    if (editingWidget) {
      updateWidget(editingWidget.id, w)
    } else {
      addWidget(w)
    }
    handleModalClose()
  }

  function handleChangeSource() {
    if (selectedWidget) {
      setEditingWidget(selectedWidget)
      setIsAddModalOpen(true)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F6F2' }}>
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 backdrop-blur-sm border-b flex items-center gap-3 flex-wrap px-6 py-3"
        style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <div className="flex-1 min-w-0">
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              color: '#9B6E20',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            BI Canvas
          </p>
          <h1 className="text-xl font-bold" style={{ color: '#0f172a' }}>
            One Page Financeiro
          </h1>
        </div>

        <YearFilter periodos={allPeriodos} selYear={selYear} onChange={setSelYear} />

        <button
          onClick={() => { setEditingWidget(null); setIsAddModalOpen(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
          style={{ backgroundColor: '#be8c4a' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#a87840')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#be8c4a')}
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
              style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #be8c4a', borderTopColor: 'transparent' }}
            />
          ) : (
            <Save size={13} />
          )}
          Salvar
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div
        className="transition-all duration-300"
        style={{ paddingRight: configPanelOpen ? 288 : 0 }}
      >
        <div className="p-6">
          {!isLoaded ? (
            <div className="grid grid-cols-12 gap-3">
              {[4, 4, 4, 8, 4].map((w, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl"
                  style={{
                    gridColumn: `span ${w}`,
                    height: 200,
                    backgroundColor: 'rgba(0,0,0,0.05)',
                  }}
                />
              ))}
            </div>
          ) : widgets.length === 0 ? (
            <EmptyState onAdd={() => { setEditingWidget(null); setIsAddModalOpen(true) }} />
          ) : (
            <OnePageCanvas
              widgets={widgets}
              selectedId={selectedId}
              selPeriods={filteredPeriodos}
              onSelect={id => setSelectedId(prev => prev === id ? null : id)}
              onReorder={setWidgets}
              onDelete={deleteWidget}
              onDuplicate={duplicateWidget}
            />
          )}
        </div>
      </div>

      {/* ── Config panel ─────────────────────────────────────────────────────── */}
      <OnePageConfigPanel
        widget={selectedWidget}
        onClose={() => setSelectedId(null)}
        onUpdate={updates => selectedId && updateWidget(selectedId, updates)}
        onDelete={() => { if (selectedId) deleteWidget(selectedId) }}
        onDuplicate={() => { if (selectedId) duplicateWidget(selectedId) }}
        onChangeSource={handleChangeSource}
        onOpenEditModal={handleChangeSource}
      />

      {/* ── Add / Edit modal ─────────────────────────────────────────────────── */}
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
  return (
    <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '60vh' }}>
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: 'rgba(190,140,74,0.12)' }}
      >
        <LayoutGrid size={28} style={{ color: '#be8c4a' }} />
      </div>
      <div className="text-center">
        <p className="font-semibold text-lg" style={{ color: '#0f172a' }}>
          Seu canvas está vazio
        </p>
        <p className="text-sm mt-1" style={{ color: 'rgba(0,0,0,0.45)' }}>
          Clique em &quot;Adicionar Widget&quot; para começar a construir seu dashboard
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: '#be8c4a' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#a87840')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#be8c4a')}
      >
        <Plus size={14} /> Adicionar primeiro widget
      </button>
    </div>
  )
}
