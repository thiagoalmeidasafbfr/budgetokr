'use client'
import { useState } from 'react'
import { BRAND, FONTS } from '@/lib/brand'
import { useBiStore } from '@/lib/bi/store'
import type { BiPeriodo } from '@/lib/bi/widget-types'
import { labelFromBiPeriodo } from '@/lib/bi/engine'

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const ANOS  = [2022,2023,2024,2025,2026]

interface BiHeaderProps {
  onAddWidget: () => void
}

export function BiHeader({ onAddWidget }: BiHeaderProps) {
  const { dashboard, isEditing, isDirty, setEditing, saveDashboard, setPeriodoGlobal } = useBiStore()
  const [isSaving, setIsSaving]     = useState(false)
  const [editName, setEditName]     = useState(false)
  const [nome, setNome]             = useState(dashboard.nome)
  const [saveErr, setSaveErr]       = useState<string|null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const p = dashboard.periodo_global

  // Derive current year and selected months for the picker
  const pickerAno = p.tipo === 'mes' ? p.ano
    : p.tipo === 'ytd' ? p.ano
    : p.tipo === 'lista' && p.periodos.length > 0 ? parseInt(p.periodos[0].slice(0, 4))
    : new Date().getFullYear()

  const [pickerYear, setPickerYear] = useState(pickerAno)

  // Which months are selected in the picker
  const selectedMonths: Set<string> = new Set(
    p.tipo === 'mes'   ? [`${p.ano}-${String(p.mes).padStart(2, '0')}`]
    : p.tipo === 'ytd' ? Array.from({length: 12}, (_, i) => `${p.ano}-${String(i+1).padStart(2, '0')}`)
    : p.tipo === 'lista' ? p.periodos
    : []
  )

  function toggleMonth(m: number) {
    const key = `${pickerYear}-${String(m).padStart(2, '0')}`
    const next = new Set(selectedMonths)
    // Only keep months from pickerYear when toggling to avoid cross-year confusion
    const sameYear = [...next].filter(k => k.startsWith(`${pickerYear}-`))
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    const sorted = [...next].sort()
    if (sorted.length === 0) return // don't allow empty
    if (sorted.length === 1) {
      const [y, mon] = sorted[0].split('-').map(Number)
      setPeriodoGlobal({ tipo: 'mes', mes: mon, ano: y })
    } else {
      setPeriodoGlobal({ tipo: 'lista', periodos: sorted })
    }
  }

  function selectAllYear() {
    setPeriodoGlobal({ tipo: 'ytd', ano: pickerYear })
  }

  function clearYear() {
    // Reset to current month
    const now = new Date()
    setPeriodoGlobal({ tipo: 'mes', mes: now.getMonth() + 1, ano: pickerYear })
  }

  async function handleSave() {
    setIsSaving(true); setSaveErr(null)
    try { await saveDashboard() }
    catch { setSaveErr('Erro ao salvar') }
    finally { setIsSaving(false) }
  }

  function handleNameBlur() {
    setEditName(false)
    useBiStore.setState(s => ({ dashboard: { ...s.dashboard, nome: nome || 'Meu Dashboard' } }))
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-white border-b flex-wrap relative"
      style={{ borderColor: BRAND.border }}
      data-no-print
    >
      {/* Dashboard name */}
      <div className="flex items-center gap-2 mr-2">
        {isEditing && editName ? (
          <input
            className="text-lg font-bold italic border-b outline-none bg-transparent"
            style={{ fontFamily: FONTS.display, color: BRAND.ink, borderColor: BRAND.gold, minWidth: 160 }}
            value={nome}
            onChange={e => setNome(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={e => e.key === 'Enter' && handleNameBlur()}
            autoFocus
          />
        ) : (
          <h1
            className="text-lg font-bold italic cursor-pointer hover:opacity-70 transition-opacity"
            style={{ fontFamily: FONTS.display, color: BRAND.ink }}
            onClick={() => isEditing && setEditName(true)}
          >
            {dashboard.nome}
          </h1>
        )}
      </div>

      {/* Period selector — center */}
      <div className="flex items-center gap-2 flex-1 justify-center">
        {/* Period display button — click to open picker */}
        <button
          onClick={() => setShowPicker(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors hover:bg-[#FBF7EE]"
          style={{ borderColor: BRAND.gold, color: BRAND.gold, fontFamily: FONTS.mono }}
        >
          <span>📅</span>
          <span>{labelFromBiPeriodo(dashboard.periodo_global)}</span>
          <span className="opacity-50 text-xs">▾</span>
        </button>

        {/* Dropdown period picker */}
        {showPicker && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-30" onClick={() => setShowPicker(false)} />
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-40 bg-white rounded-xl shadow-xl border p-4 min-w-[320px]"
              style={{ borderColor: BRAND.border }}
            >
              {/* Year selector */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-semibold tracking-widest uppercase"
                      style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Ano</span>
                <div className="flex gap-1">
                  {ANOS.map(y => (
                    <button key={y}
                      onClick={() => setPickerYear(y)}
                      className="px-2 py-0.5 rounded text-xs border transition-colors"
                      style={{
                        borderColor: pickerYear === y ? BRAND.gold : BRAND.border,
                        backgroundColor: pickerYear === y ? '#FBF7EE' : 'white',
                        color: pickerYear === y ? BRAND.gold : BRAND.muted,
                        fontFamily: FONTS.mono,
                      }}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {MESES_SHORT.map((m, i) => {
                  const key = `${pickerYear}-${String(i+1).padStart(2,'0')}`
                  const isSel = selectedMonths.has(key)
                  return (
                    <button key={i}
                      onClick={() => toggleMonth(i+1)}
                      className="py-1.5 rounded text-xs font-medium border transition-all"
                      style={{
                        borderColor: isSel ? BRAND.gold : BRAND.border,
                        backgroundColor: isSel ? BRAND.gold : 'white',
                        color: isSel ? 'white' : BRAND.ink,
                        fontFamily: FONTS.mono,
                      }}>
                      {m}
                    </button>
                  )
                })}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 pt-2 border-t" style={{ borderColor: BRAND.border }}>
                <button onClick={selectAllYear}
                        className="flex-1 py-1 text-xs rounded border transition-colors hover:bg-[#FBF7EE]"
                        style={{ borderColor: BRAND.gold, color: BRAND.gold, fontFamily: FONTS.mono }}>
                  YTD {pickerYear}
                </button>
                <button onClick={() => { clearYear(); setShowPicker(false) }}
                        className="flex-1 py-1 text-xs rounded border transition-colors hover:bg-gray-50"
                        style={{ borderColor: BRAND.border, color: BRAND.muted, fontFamily: FONTS.mono }}>
                  Limpar
                </button>
                <button onClick={() => setShowPicker(false)}
                        className="flex-1 py-1 text-xs rounded text-white font-semibold transition-colors hover:opacity-90"
                        style={{ backgroundColor: BRAND.gold, fontFamily: FONTS.mono }}>
                  OK
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 ml-auto flex-wrap">
        {!isEditing ? (
          <>
            <button
              onClick={() => window.print()}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: BRAND.border, color: BRAND.muted }}>
              Exportar PDF
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors hover:bg-[#FBF7EE]"
              style={{ borderColor: BRAND.gold, color: BRAND.gold }}>
              ✎ Editar dashboard
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onAddWidget}
              className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition-colors hover:opacity-90"
              style={{ backgroundColor: BRAND.gold }}>
              + Adicionar widget
            </button>
            {saveErr && <span className="text-xs text-red-500">{saveErr}</span>}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors hover:bg-gray-50 relative"
              style={{ borderColor: BRAND.border, color: BRAND.ink }}>
              {isSaving ? 'Salvando...' : 'Salvar'}
              {isDirty && !isSaving && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ backgroundColor: BRAND.gold }} />
              )}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: BRAND.border, color: BRAND.muted }}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
