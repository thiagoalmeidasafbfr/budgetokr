'use client'
import { useState, useEffect } from 'react'
import { BRAND, FONTS, fmtBRL } from '@/lib/brand'
import { useBiStore } from '@/lib/bi/store'
import type { WidgetConfig, WidgetVisual, BiMetrica, BiScope, BiPeriodo, WidgetEstilo } from '@/lib/bi/widget-types'
import { WIDGET_META, DEFAULT_ESTILO } from '@/lib/bi/widget-types'

interface DimensoesData {
  departamentos: Array<{ id: string; nome: string }>
  centros_custo: Array<{ id: string; nome: string; departamento_id: string }>
  linhas_dre:    Array<{ nome: string; tipo: string }>
}

interface WidgetConfigPanelProps {
  widgetId: string
  onClose: () => void
}

const VISUAL_LABELS: Record<WidgetVisual, string> = {
  kpi_card:       'KPI Card',
  waterfall:      'Cascata DRE',
  bar_vertical:   'Barras Vert.',
  bar_horizontal: 'Barras Horiz.',
  line_area:      'Linha/Área',
  donut:          'Rosca',
  pie:            'Pizza',
  table:          'Tabela',
  text_label:     'Texto Livre',
}

const VISUAL_ICONS: Record<WidgetVisual, string> = {
  kpi_card: '🎯', waterfall: '🌊', bar_vertical: '📊', bar_horizontal: '📶',
  line_area: '📈', donut: '🍩', pie: '🥧', table: '📋', text_label: '✏️',
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const ANOS  = [2022,2023,2024,2025,2026]

export function WidgetConfigPanel({ widgetId, onClose }: WidgetConfigPanelProps) {
  const { dashboard, updateWidget, removeWidget, addWidget } = useBiStore()
  const widget = dashboard.widgets.find(w => w.id === widgetId)

  const [draft, setDraft]         = useState<WidgetConfig | null>(widget ?? null)
  const [dimensoes, setDimensoes] = useState<DimensoesData | null>(null)
  const [tab, setTab]             = useState<'what'|'where'|'how'>('what')
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    fetch('/api/bi/dimensoes').then(r => r.json()).then(d => setDimensoes(d)).catch(() => {})
  }, [])

  if (!draft) return null

  const upd = (partial: Partial<WidgetConfig>) => setDraft(prev => prev ? { ...prev, ...partial } : prev)
  const updScope  = (s: Partial<BiScope>)       => upd({ scope:  { ...draft.scope,  ...s } })
  const updEstilo = (e: Partial<WidgetEstilo>)   => upd({ estilo: { ...draft.estilo, ...e } })

  function handleApply() {
    if (!draft) return
    updateWidget(widgetId, draft)
    onClose()
  }

  function handleDuplicate() {
    if (!draft) return
    const newId = `widget_${Date.now()}`
    addWidget({ ...draft, id: newId, layout: { ...draft.layout, x: (draft.layout.x + draft.layout.w) % 12, y: draft.layout.y + 1 } })
    onClose()
  }

  function handleRemove() {
    removeWidget(widgetId)
    onClose()
  }

  const dreLinhas = (dimensoes?.linhas_dre ?? []).filter(l => l.tipo !== 'calculada')
  const depts     = dimensoes?.departamentos ?? []
  const ccs       = (dimensoes?.centros_custo ?? []).filter(cc =>
    !draft.scope.departamento_id || cc.departamento_id === draft.scope.departamento_id
  )

  const TabBtn = ({ id, label }: { id: 'what'|'where'|'how'; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${tab === id ? 'border-b-2' : ''}`}
      style={{
        fontFamily: FONTS.heading,
        borderColor: tab === id ? BRAND.gold : 'transparent',
        color: tab === id ? BRAND.gold : BRAND.muted,
        letterSpacing: '0.1em',
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-40 flex flex-col bg-white shadow-2xl border-l"
      style={{ width: 380, borderColor: BRAND.border }}
      data-no-print
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BRAND.border }}>
        <h3 className="font-bold text-sm tracking-wide" style={{ fontFamily: FONTS.heading, color: BRAND.ink, letterSpacing: '0.08em' }}>
          CONFIGURAR WIDGET
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: BRAND.border }}>
        <TabBtn id="what" label="O QUÊ" />
        <TabBtn id="where" label="ONDE" />
        <TabBtn id="how"   label="COMO" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm">

        {/* ─ O QUÊ ─ */}
        {tab === 'what' && (
          <>
            {/* Visual selector */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-2"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Tipo de visualização</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(VISUAL_ICONS) as WidgetVisual[]).map(v => (
                  <button
                    key={v}
                    onClick={() => upd({ visual: v })}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all"
                    style={{
                      borderColor: draft.visual === v ? BRAND.gold : BRAND.border,
                      backgroundColor: draft.visual === v ? '#FBF7EE' : 'white',
                    }}
                  >
                    <span className="text-lg">{VISUAL_ICONS[v]}</span>
                    <span className="text-[9px] font-medium" style={{ color: BRAND.ink, fontFamily: FONTS.mono }}>{VISUAL_LABELS[v]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Metric type */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-2"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Métrica</label>
              <select
                value={draft.metrica.tipo}
                onChange={e => upd({ metrica: { tipo: e.target.value as BiMetrica['tipo'], linha_nome: '' } as BiMetrica })}
                className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:border-[#B8924A]"
                style={{ borderColor: BRAND.border, color: BRAND.ink }}
              >
                <option value="linha_dre">Linha da DRE (escalar)</option>
                <option value="grupo_dre">Grupo DRE</option>
                <option value="serie_temporal">Série Temporal</option>
                <option value="breakdown_dpto">Breakdown por Departamento</option>
                <option value="breakdown_cc">Breakdown por Centro de Custo</option>
                <option value="topN_grupo">Top-N de um Grupo</option>
                <option value="dre_completa">DRE Completa</option>
                <option value="dre_parcial">DRE Parcial (selecionar linhas)</option>
              </select>
            </div>

            {/* DRE line selector */}
            {(draft.metrica.tipo === 'linha_dre' || draft.metrica.tipo === 'serie_temporal' ||
              draft.metrica.tipo === 'breakdown_cc' || draft.metrica.tipo === 'breakdown_dpto') && (
              <div>
                <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                       style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Linha DRE</label>
                <select
                  value={(draft.metrica as { linha_nome?: string }).linha_nome ?? ''}
                  onChange={e => upd({ metrica: { ...draft.metrica, linha_nome: e.target.value } as BiMetrica })}
                  className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:border-[#B8924A]"
                  style={{ borderColor: BRAND.border, color: BRAND.ink }}
                >
                  <option value="">— Selecionar —</option>
                  {dreLinhas.map(l => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
                </select>
              </div>
            )}

            {/* Grupo selector */}
            {(draft.metrica.tipo === 'grupo_dre' || draft.metrica.tipo === 'topN_grupo') && (
              <div>
                <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                       style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Grupo DRE</label>
                <select
                  value={(draft.metrica as { grupo_nome?: string }).grupo_nome ?? ''}
                  onChange={e => upd({ metrica: { ...draft.metrica, grupo_nome: e.target.value } as BiMetrica })}
                  className="w-full px-2 py-1.5 border rounded text-sm outline-none"
                  style={{ borderColor: BRAND.border, color: BRAND.ink }}
                >
                  <option value="">— Selecionar grupo —</option>
                  {dreLinhas.filter(l => l.tipo === 'grupo').map(l => <option key={l.nome} value={l.nome}>{l.nome}</option>)}
                </select>
              </div>
            )}

            {draft.metrica.tipo === 'topN_grupo' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                         style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>N</label>
                  <input type="number" min={1} max={50}
                    value={(draft.metrica as { n?: number }).n ?? 10}
                    onChange={e => upd({ metrica: { ...draft.metrica, n: parseInt(e.target.value) || 10 } as BiMetrica })}
                    className="w-full px-2 py-1.5 border rounded text-sm outline-none"
                    style={{ borderColor: BRAND.border }} />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                         style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Ordem</label>
                  <select
                    value={(draft.metrica as { ordem?: string }).ordem ?? 'desc'}
                    onChange={e => upd({ metrica: { ...draft.metrica, ordem: e.target.value } as BiMetrica })}
                    className="w-full px-2 py-1.5 border rounded text-sm"
                    style={{ borderColor: BRAND.border }}>
                    <option value="desc">Maior → Menor</option>
                    <option value="asc">Menor → Maior</option>
                  </select>
                </div>
              </div>
            )}

            {/* Custom title */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Título customizado</label>
              <input
                type="text"
                value={draft.titulo ?? ''}
                onChange={e => upd({ titulo: e.target.value || undefined })}
                placeholder="Automático (nome da métrica)"
                className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:border-[#B8924A]"
                style={{ borderColor: BRAND.border, color: BRAND.ink }}
              />
            </div>
          </>
        )}

        {/* ─ ONDE ─ */}
        {tab === 'where' && (
          <>
            {/* Department */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Departamento</label>
              <select
                value={draft.scope.departamento_id ?? ''}
                onChange={e => updScope({ departamento_id: e.target.value || undefined, centros_custo: [] })}
                className="w-full px-2 py-1.5 border rounded text-sm outline-none"
                style={{ borderColor: BRAND.border, color: BRAND.ink }}
              >
                <option value="">Todos os departamentos</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>

            {/* CCs multiselect */}
            {ccs.length > 0 && (
              <div>
                <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                       style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>
                  Centros de custo ({draft.scope.centros_custo?.length ? `${draft.scope.centros_custo.length} sel.` : 'todos'})
                </label>
                <div className="max-h-36 overflow-y-auto border rounded" style={{ borderColor: BRAND.border }}>
                  {ccs.map(cc => {
                    const sel = draft.scope.centros_custo?.includes(cc.id) ?? false
                    return (
                      <label key={cc.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={sel}
                          onChange={e => {
                            const prev = draft.scope.centros_custo ?? []
                            updScope({ centros_custo: e.target.checked ? [...prev, cc.id] : prev.filter(c => c !== cc.id) })
                          }} />
                        <span className="text-xs truncate" style={{ color: BRAND.ink }}>{cc.nome}</span>
                      </label>
                    )
                  })}
                </div>
                <button onClick={() => updScope({ centros_custo: [] })}
                        className="text-[10px] mt-1" style={{ color: BRAND.muted }}>Limpar seleção</button>
              </div>
            )}

            {/* Period override */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Período</label>
              <div className="flex gap-1 mb-2">
                {(['mes','ytd'] as const).map(t => (
                  <button key={t}
                    onClick={() => updScope({
                      periodo: t === 'mes'
                        ? { tipo: 'mes', mes: 1, ano: new Date().getFullYear() }
                        : { tipo: 'ytd', ano: new Date().getFullYear() }
                    })}
                    className="flex-1 py-1 text-xs rounded border transition-colors"
                    style={{
                      borderColor: draft.scope.periodo.tipo === t ? BRAND.gold : BRAND.border,
                      backgroundColor: draft.scope.periodo.tipo === t ? '#FBF7EE' : 'white',
                      color: draft.scope.periodo.tipo === t ? BRAND.gold : BRAND.muted,
                    }}>
                    {t === 'mes' ? 'Mensal' : 'YTD'}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {draft.scope.periodo.tipo === 'mes' && (
                  <select
                    value={(draft.scope.periodo as { mes: number }).mes}
                    onChange={e => updScope({ periodo: { ...draft.scope.periodo, mes: parseInt(e.target.value) } as BiPeriodo })}
                    className="flex-1 px-2 py-1.5 border rounded text-sm" style={{ borderColor: BRAND.border }}>
                    {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                  </select>
                )}
                <select
                  value={(draft.scope.periodo as { ano: number }).ano}
                  onChange={e => updScope({ periodo: { ...draft.scope.periodo, ano: parseInt(e.target.value) } as BiPeriodo })}
                  className="flex-1 px-2 py-1.5 border rounded text-sm" style={{ borderColor: BRAND.border }}>
                  {ANOS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Comparativo */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Comparativo</label>
              <select
                value={draft.scope.comparativo ?? ''}
                onChange={e => updScope({ comparativo: (e.target.value || null) as BiScope['comparativo'] })}
                className="w-full px-2 py-1.5 border rounded text-sm" style={{ borderColor: BRAND.border, color: BRAND.ink }}>
                <option value="">Nenhum</option>
                <option value="budget">vs Budget</option>
                <option value="mes_anterior">vs Mês anterior</option>
                <option value="ano_anterior">vs Ano anterior</option>
              </select>
            </div>
          </>
        )}

        {/* ─ COMO ─ */}
        {tab === 'how' && (
          <>
            {/* Toggles */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-2"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Exibir</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['mostrar_titulo',   'Título'],
                  ['mostrar_legenda',  'Legenda'],
                  ['mostrar_eixos',    'Eixos'],
                  ['mostrar_grid',     'Grid'],
                  ['mostrar_valores',  'Valores'],
                  ['mostrar_variacao', 'Variação'],
                ] as const).map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox"
                      checked={draft.estilo[k] as boolean}
                      onChange={e => updEstilo({ [k]: e.target.checked })} />
                    <span className="text-xs" style={{ color: BRAND.ink }}>{lbl}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Tamanho da fonte</label>
              <div className="flex gap-1">
                {(['xs','sm','md','lg','xl'] as const).map(s => (
                  <button key={s}
                    onClick={() => updEstilo({ tamanho_fonte: s })}
                    className="flex-1 py-1 text-xs rounded border transition-colors"
                    style={{
                      borderColor: draft.estilo.tamanho_fonte === s ? BRAND.gold : BRAND.border,
                      backgroundColor: draft.estilo.tamanho_fonte === s ? '#FBF7EE' : 'white',
                      color: draft.estilo.tamanho_fonte === s ? BRAND.gold : BRAND.muted,
                      fontFamily: FONTS.mono,
                    }}>
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Number format */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Formato de número</label>
              <select
                value={draft.estilo.formato_numero}
                onChange={e => updEstilo({ formato_numero: e.target.value as WidgetEstilo['formato_numero'] })}
                className="w-full px-2 py-1.5 border rounded text-sm"
                style={{ borderColor: BRAND.border, color: BRAND.ink }}>
                <option value="inteiro">Inteiro (1.234.567)</option>
                <option value="decimal">Decimal (1.234.567,89)</option>
                <option value="milhares">Milhares (1.234 K)</option>
                <option value="milhoes">Milhões (1,2 M)</option>
                <option value="percentual">Percentual (12,3%)</option>
              </select>
            </div>

            {/* Prefix / Suffix */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                       style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Prefixo</label>
                <input type="text" placeholder="ex: R$"
                  value={draft.estilo.prefixo ?? ''}
                  onChange={e => updEstilo({ prefixo: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  style={{ borderColor: BRAND.border }} />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                       style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Sufixo</label>
                <input type="text" placeholder="ex: %"
                  value={draft.estilo.sufixo ?? ''}
                  onChange={e => updEstilo({ sufixo: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  style={{ borderColor: BRAND.border }} />
              </div>
            </div>

            {/* Primary color */}
            <div>
              <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1"
                     style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>Cor primária</label>
              <div className="flex items-center gap-2">
                <input type="color"
                  value={draft.estilo.cor_primaria ?? BRAND.gold}
                  onChange={e => updEstilo({ cor_primaria: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border" style={{ borderColor: BRAND.border }} />
                <button onClick={() => updEstilo({ cor_primaria: undefined })}
                        className="text-xs" style={{ color: BRAND.muted }}>
                  Resetar ({BRAND.gold})
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-4 flex flex-col gap-2" style={{ borderColor: BRAND.border }}>
        <button
          onClick={handleApply}
          className="w-full py-2 rounded-lg font-semibold text-sm text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: BRAND.gold, fontFamily: FONTS.heading, letterSpacing: '0.08em' }}
        >
          APLICAR
        </button>
        <div className="flex gap-2">
          <button onClick={handleDuplicate}
                  className="flex-1 py-1.5 text-xs border rounded-lg transition-colors hover:bg-gray-50"
                  style={{ borderColor: BRAND.border, color: BRAND.muted }}>
            Duplicar widget
          </button>
          {confirmRemove ? (
            <button onClick={handleRemove}
                    className="flex-1 py-1.5 text-xs border rounded-lg transition-colors font-semibold"
                    style={{ borderColor: BRAND.danger, color: BRAND.danger, backgroundColor: '#FEF2F2' }}>
              Confirmar remoção
            </button>
          ) : (
            <button onClick={() => setConfirmRemove(true)}
                    className="flex-1 py-1.5 text-xs border rounded-lg transition-colors hover:bg-red-50"
                    style={{ borderColor: BRAND.border, color: BRAND.danger }}>
              Remover widget
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
