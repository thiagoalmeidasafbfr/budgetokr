// lib/bi/store.ts — Zustand store for BI Canvas
'use client'
import { create } from 'zustand'
import type { BiDashboard, WidgetConfig, WidgetLayout, BiPeriodo } from './widget-types'

const DEFAULT_PERIODO: BiPeriodo = (() => {
  const now = new Date()
  return { tipo: 'mes', mes: now.getMonth() + 1, ano: now.getFullYear() }
})()

const EMPTY_DASHBOARD: BiDashboard = {
  id:             '',
  user_id:        '',
  nome:           'Meu Dashboard',
  periodo_global: DEFAULT_PERIODO,
  widgets:        [],
  atualizado_em:  new Date().toISOString(),
}

interface BiStore {
  dashboard:     BiDashboard
  isEditing:     boolean
  activeWidgetId: string | null
  isDirty:       boolean

  // actions
  setDashboard:   (d: BiDashboard) => void
  setEditing:     (v: boolean) => void
  addWidget:      (config: WidgetConfig) => void
  updateWidget:   (id: string, config: Partial<WidgetConfig>) => void
  removeWidget:   (id: string) => void
  updateLayout:   (layouts: WidgetLayout[]) => void
  setActiveWidget:(id: string | null) => void
  setPeriodoGlobal:(p: BiPeriodo) => void
  saveDashboard:  () => Promise<void>
}

export const useBiStore = create<BiStore>((set, get) => ({
  dashboard:      EMPTY_DASHBOARD,
  isEditing:      false,
  activeWidgetId: null,
  isDirty:        false,

  setDashboard: (d) => set({ dashboard: d, isDirty: false }),
  setEditing:   (v) => set({ isEditing: v, activeWidgetId: null }),

  addWidget: (config) => set((s) => ({
    dashboard: { ...s.dashboard, widgets: [...s.dashboard.widgets, config] },
    isDirty: true,
  })),

  updateWidget: (id, partial) => set((s) => ({
    dashboard: {
      ...s.dashboard,
      widgets: s.dashboard.widgets.map(w => w.id === id ? { ...w, ...partial } : w),
    },
    isDirty: true,
  })),

  removeWidget: (id) => set((s) => ({
    dashboard: {
      ...s.dashboard,
      widgets: s.dashboard.widgets.filter(w => w.id !== id),
    },
    isDirty: true,
    activeWidgetId: s.activeWidgetId === id ? null : s.activeWidgetId,
  })),

  updateLayout: (layouts) => set((s) => ({
    dashboard: {
      ...s.dashboard,
      widgets: s.dashboard.widgets.map(w => {
        const l = layouts.find(ll => ll.x !== undefined && (w.layout.x === ll.x))
        return l ? { ...w, layout: l } : w
      }),
    },
    isDirty: true,
  })),

  setActiveWidget: (id) => set({ activeWidgetId: id }),

  setPeriodoGlobal: (p) => set((s) => ({
    dashboard: { ...s.dashboard, periodo_global: p },
    isDirty: true,
  })),

  saveDashboard: async () => {
    const { dashboard } = get()
    try {
      const res = await fetch('/api/bi/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...dashboard,
          atualizado_em: new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const saved = await res.json()
      set((s) => ({
        dashboard: { ...s.dashboard, id: saved.id },
        isDirty: false,
      }))
    } catch (e) {
      console.error('[BiStore] saveDashboard failed:', e)
      throw e
    }
  },
}))
