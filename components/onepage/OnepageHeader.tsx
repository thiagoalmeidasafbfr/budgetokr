'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BRAND, FONTS } from '@/lib/brand'
import type { AnalysisConfig, OticaAnalise } from '@/lib/analysis/engine'
import type { BlockConfig } from '@/lib/analysis/templates'
import { getTemplate } from '@/lib/analysis/templates'

interface DimensaoOption {
  tipo: string
  id: string
  label: string
  otica_provavel: OticaAnalise
}

interface OnepageHeaderProps {
  config: AnalysisConfig
  otica?: OticaAnalise
  isEditing: boolean
  isSaving: boolean
  onConfigChange: (config: AnalysisConfig) => void
  onToggleEdit: () => void
  onSave: (nome: string) => void
  onAddBlock: () => void
  onResetTemplate: () => void
}

const OTICA_LABELS: Record<OticaAnalise, string> = {
  receita:     'Receita',
  despesa:     'Despesa',
  misto:       'Misto',
  consolidado: 'Consolidado',
}

const OTICA_COLORS: Record<OticaAnalise, string> = {
  receita:     '#2D6A4F',
  despesa:     '#C1292E',
  misto:       '#B8924A',
  consolidado: '#6B7280',
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const ANOS = [2022, 2023, 2024, 2025, 2026]

export function OnepageHeader({
  config,
  otica,
  isEditing,
  isSaving,
  onConfigChange,
  onToggleEdit,
  onSave,
  onAddBlock,
  onResetTemplate,
}: OnepageHeaderProps) {
  const [dimensoes, setDimensoes] = useState<DimensaoOption[]>([])
  const [search, setSearch] = useState('')
  const [showDimensaoDD, setShowDimensaoDD] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState(config.nome ?? '')

  useEffect(() => {
    fetch('/api/onepage/list?type=dimensoes')
      .then(r => r.json())
      .then(d => setDimensoes(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  const filtered = dimensoes.filter(d =>
    d.label.toLowerCase().includes(search.toLowerCase()) ||
    d.tipo.toLowerCase().includes(search.toLowerCase())
  )

  const currentDimLabel = dimensoes.find(d =>
    config.dimensao.tipo === d.tipo &&
    (config.dimensao.tipo === 'consolidado' ||
      (config.dimensao.tipo === 'centro_custo' && config.dimensao.tipo === d.tipo && (config.dimensao as {tipo:string;id:string}).id === d.id) ||
      (config.dimensao.tipo === 'unidade_negocio' && (config.dimensao as {tipo:string;id:string}).id === d.id) ||
      (config.dimensao.tipo === 'grupo_contas' && (config.dimensao as {tipo:string;grupo:string}).grupo === d.id))
  )?.label ?? 'Selecionar dimensão...'

  const periodo = config.periodo
  const mes = periodo.tipo === 'mes' ? periodo.mes : 1
  const ano = periodo.tipo === 'mes' ? periodo.ano : (periodo.tipo === 'ytd' ? periodo.ano : 2025)

  function handleDimSelect(opt: DimensaoOption) {
    let dimensao: AnalysisConfig['dimensao']
    if (opt.tipo === 'consolidado') dimensao = { tipo: 'consolidado' }
    else if (opt.tipo === 'centro_custo') dimensao = { tipo: 'centro_custo', id: opt.id }
    else if (opt.tipo === 'unidade_negocio') dimensao = { tipo: 'unidade_negocio', id: opt.id }
    else if (opt.tipo === 'grupo_contas') dimensao = { tipo: 'grupo_contas', grupo: opt.id }
    else dimensao = { tipo: 'consolidado' }
    onConfigChange({ ...config, dimensao })
    setShowDimensaoDD(false)
    setSearch('')
  }

  return (
    <div
      className="flex flex-col gap-3 p-4 bg-white rounded-xl border border-[#E4DFD5] mb-4"
      data-no-print
    >
      {/* Row 1: title + actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1
            className="text-2xl font-bold italic leading-tight"
            style={{ fontFamily: FONTS.display, color: BRAND.ink }}
          >
            Analytics Engine
          </h1>
          <p className="text-xs" style={{ color: BRAND.muted, fontFamily: FONTS.mono }}>
            One-Page · Glorioso Finance
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {otica && (
            <span
              className="text-[10px] font-semibold px-2 py-1 rounded-full"
              style={{
                fontFamily: FONTS.mono,
                backgroundColor: OTICA_COLORS[otica] + '20',
                color: OTICA_COLORS[otica],
              }}
            >
              {OTICA_LABELS[otica]}
            </span>
          )}
          <button
            onClick={() => window.print()}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#E4DFD5] hover:bg-gray-50 transition-colors"
            style={{ color: BRAND.muted }}
          >
            Exportar PDF
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={isSaving}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#B8924A] hover:bg-[#FBF7EE] transition-colors font-medium"
            style={{ color: BRAND.gold }}
          >
            {isSaving ? 'Salvando...' : 'Salvar análise'}
          </button>
          {isEditing && (
            <>
              <button
                onClick={onAddBlock}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#B8924A] text-white hover:bg-[#6B4E18] transition-colors font-medium"
              >
                + Bloco
              </button>
              <button
                onClick={onResetTemplate}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#E4DFD5] hover:bg-gray-50 transition-colors"
                style={{ color: BRAND.muted }}
              >
                Reset template
              </button>
            </>
          )}
          <button
            onClick={onToggleEdit}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
              isEditing ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'border-[#E4DFD5] hover:bg-gray-50'
            }`}
            style={isEditing ? {} : { color: BRAND.ink }}
          >
            {isEditing ? '✓ Visualizar' : '✎ Editar'}
          </button>
        </div>
      </div>

      {/* Row 2: filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Dimension picker */}
        <div className="relative">
          <button
            onClick={() => setShowDimensaoDD(v => !v)}
            className="text-sm px-3 py-1.5 rounded-lg border border-[#E4DFD5] hover:border-[#B8924A] transition-colors flex items-center gap-2 min-w-[200px]"
            style={{ color: BRAND.ink }}
          >
            <span className="flex-1 text-left truncate">{currentDimLabel}</span>
            <span className="text-gray-400">▾</span>
          </button>
          {showDimensaoDD && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#E4DFD5] rounded-xl shadow-xl w-80">
              <div className="p-2">
                <input
                  type="text"
                  placeholder="Buscar dimensão..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-[#E4DFD5] rounded-lg outline-none focus:border-[#B8924A]"
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto max-h-64 pb-2">
                {filtered.slice(0, 50).map(d => (
                  <button
                    key={`${d.tipo}-${d.id}`}
                    onClick={() => handleDimSelect(d)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#FBF7EE] flex items-center gap-2"
                    style={{ color: BRAND.ink }}
                  >
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                      style={{ fontFamily: FONTS.mono, backgroundColor: '#F3F4F6', color: BRAND.muted }}
                    >
                      {d.tipo.replace(/_/g, ' ')}
                    </span>
                    <span className="truncate">{d.label}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-center py-3 text-gray-400">Nenhum resultado</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Period type */}
        <div className="flex items-center gap-1">
          {(['mes', 'ytd'] as const).map(t => (
            <button
              key={t}
              onClick={() => {
                if (t === 'mes') onConfigChange({ ...config, periodo: { tipo: 'mes', mes, ano } })
                else onConfigChange({ ...config, periodo: { tipo: 'ytd', ano } })
              }}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                periodo.tipo === t ? 'bg-[#B8924A] text-white border-[#B8924A]' : 'border-[#E4DFD5] hover:bg-gray-50'
              }`}
              style={periodo.tipo !== t ? { color: BRAND.muted } : {}}
            >
              {t === 'mes' ? 'Mensal' : 'YTD'}
            </button>
          ))}
        </div>

        {/* Month (only for mes mode) */}
        {periodo.tipo === 'mes' && (
          <select
            value={mes}
            onChange={e => onConfigChange({ ...config, periodo: { tipo: 'mes', mes: Number(e.target.value), ano } })}
            className="text-sm px-2 py-1.5 border border-[#E4DFD5] rounded-lg outline-none focus:border-[#B8924A]"
            style={{ color: BRAND.ink }}
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        )}

        {/* Year */}
        <select
          value={ano}
          onChange={e => onConfigChange({
            ...config,
            periodo: periodo.tipo === 'ytd'
              ? { tipo: 'ytd', ano: Number(e.target.value) }
              : { tipo: 'mes', mes, ano: Number(e.target.value) }
          })}
          className="text-sm px-2 py-1.5 border border-[#E4DFD5] rounded-lg outline-none focus:border-[#B8924A]"
          style={{ color: BRAND.ink }}
        >
          {ANOS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Comparativo */}
        <select
          value={config.comparativo ?? 'nenhum'}
          onChange={e => onConfigChange({ ...config, comparativo: e.target.value as AnalysisConfig['comparativo'] })}
          className="text-sm px-2 py-1.5 border border-[#E4DFD5] rounded-lg outline-none focus:border-[#B8924A]"
          style={{ color: BRAND.ink }}
        >
          <option value="nenhum">Sem comparativo</option>
          <option value="budget">vs Budget</option>
          <option value="mes_anterior">vs Mês anterior</option>
          <option value="ano_anterior">vs Ano anterior</option>
        </select>
      </div>

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-[#E4DFD5]">
            <h3
              className="text-lg font-bold mb-4"
              style={{ fontFamily: FONTS.heading, color: BRAND.ink, letterSpacing: '0.04em' }}
            >
              SALVAR ANÁLISE
            </h3>
            <input
              type="text"
              placeholder="Nome da análise..."
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4DFD5] rounded-lg text-sm outline-none focus:border-[#B8924A] mb-4"
              style={{ color: BRAND.ink }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && saveName.trim()) { onSave(saveName.trim()); setShowSaveModal(false) } }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-sm px-4 py-2 border border-[#E4DFD5] rounded-lg hover:bg-gray-50"
                style={{ color: BRAND.muted }}
              >
                Cancelar
              </button>
              <button
                onClick={() => { if (saveName.trim()) { onSave(saveName.trim()); setShowSaveModal(false) } }}
                disabled={!saveName.trim()}
                className="text-sm px-4 py-2 rounded-lg bg-[#B8924A] text-white font-medium hover:bg-[#6B4E18] disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
