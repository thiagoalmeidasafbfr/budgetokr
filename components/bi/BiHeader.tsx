'use client'
import { useState } from 'react'
import { BRAND, FONTS } from '@/lib/brand'
import { useBiStore } from '@/lib/bi/store'
import type { BiPeriodo } from '@/lib/bi/widget-types'
import { labelFromBiPeriodo } from '@/lib/bi/engine'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const ANOS  = [2022,2023,2024,2025,2026]

interface BiHeaderProps {
  onAddWidget: () => void
}

export function BiHeader({ onAddWidget }: BiHeaderProps) {
  const { dashboard, isEditing, isDirty, setEditing, saveDashboard, setPeriodoGlobal } = useBiStore()
  const [isSaving, setIsSaving]   = useState(false)
  const [editName, setEditName]   = useState(false)
  const [nome, setNome]           = useState(dashboard.nome)
  const [saveErr, setSaveErr]     = useState<string|null>(null)

  const p = dashboard.periodo_global
  const mes = p.tipo === 'mes' ? p.mes : 1
  const ano = p.tipo === 'mes' || p.tipo === 'ytd' ? p.ano : 2025

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
      className="flex items-center gap-3 px-4 py-3 bg-white border-b flex-wrap"
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
      <div className="flex items-center gap-2 flex-1 justify-center flex-wrap">
        <div className="flex gap-1">
          {(['mes','ytd'] as const).map(t => (
            <button key={t}
              onClick={() => setPeriodoGlobal(
                t === 'mes' ? { tipo:'mes', mes, ano } : { tipo:'ytd', ano }
              )}
              className="px-2 py-1 text-xs rounded border transition-colors"
              style={{
                borderColor: p.tipo === t ? BRAND.gold : BRAND.border,
                backgroundColor: p.tipo === t ? '#FBF7EE' : 'white',
                color: p.tipo === t ? BRAND.gold : BRAND.muted,
                fontFamily: FONTS.mono,
              }}>
              {t === 'mes' ? 'Mensal' : 'YTD'}
            </button>
          ))}
        </div>
        {p.tipo === 'mes' && (
          <select value={mes}
            onChange={e => setPeriodoGlobal({ tipo: 'mes', mes: parseInt(e.target.value), ano })}
            className="px-2 py-1 border rounded text-sm outline-none"
            style={{ borderColor: BRAND.border, fontFamily: FONTS.mono }}>
            {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        )}
        <select value={ano}
          onChange={e => setPeriodoGlobal(
            p.tipo === 'ytd' ? { tipo: 'ytd', ano: parseInt(e.target.value) }
              : { tipo: 'mes', mes, ano: parseInt(e.target.value) }
          )}
          className="px-2 py-1 border rounded text-sm outline-none"
          style={{ borderColor: BRAND.border, fontFamily: FONTS.mono }}>
          {ANOS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-xs" style={{ fontFamily: FONTS.mono, color: BRAND.muted }}>
          {labelFromBiPeriodo(dashboard.periodo_global)}
        </span>
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
