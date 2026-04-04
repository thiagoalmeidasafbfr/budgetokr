'use client'
import { useState } from 'react'
import { BRAND, FONTS } from '@/lib/brand'
import { useBiStore } from '@/lib/bi/store'
import { labelFromBiPeriodo } from '@/lib/bi/engine'

interface BiHeaderProps {
  onAddWidget: () => void
}

export function BiHeader({ onAddWidget }: BiHeaderProps) {
  const { dashboard, isEditing, isDirty, setEditing, saveDashboard } = useBiStore()
  const [isSaving, setIsSaving] = useState(false)
  const [editName, setEditName] = useState(false)
  const [nome, setNome]         = useState(dashboard.nome)
  const [saveErr, setSaveErr]   = useState<string|null>(null)

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
      className="flex items-center gap-3 px-4 py-3 bg-white border-b shrink-0"
      style={{ borderColor: BRAND.border }}
      data-no-print
    >
      {/* Dashboard name */}
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
          title={isEditing ? 'Clique para renomear' : undefined}
        >
          {dashboard.nome}
        </h1>
      )}

      {/* Period label — read-only, shows current global selection */}
      <span
        className="text-xs px-2 py-1 rounded-md border"
        style={{
          fontFamily: FONTS.mono,
          borderColor: BRAND.border,
          color: BRAND.muted,
          backgroundColor: BRAND.base,
        }}
      >
        {labelFromBiPeriodo(dashboard.periodo_global)}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isEditing ? (
          <>
            <button
              onClick={() => window.print()}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: BRAND.border, color: BRAND.muted }}
            >
              Exportar PDF
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors hover:bg-[#FBF7EE]"
              style={{ borderColor: BRAND.gold, color: BRAND.gold }}
            >
              ✎ Editar dashboard
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onAddWidget}
              className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition-colors hover:opacity-90"
              style={{ backgroundColor: BRAND.gold }}
            >
              + Adicionar widget
            </button>
            {saveErr && <span className="text-xs text-red-500">{saveErr}</span>}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors hover:bg-gray-50 relative"
              style={{ borderColor: BRAND.border, color: BRAND.ink }}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
              {isDirty && !isSaving && (
                <span
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: BRAND.gold }}
                />
              )}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: BRAND.border, color: BRAND.muted }}
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
