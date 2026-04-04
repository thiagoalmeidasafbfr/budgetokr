'use client'
import { useState, useEffect } from 'react'
import { BRAND, FONTS } from '@/lib/brand'
import { useBiStore } from '@/lib/bi/store'
import type { WidgetConfig, WidgetVisual, BiMetrica, BiScope, BiPeriodo, WidgetEstilo } from '@/lib/bi/widget-types'
import { WIDGET_META, DEFAULT_ESTILO } from '@/lib/bi/widget-types'

interface DimensoesData {
  departamentos: Array<{ id: string; nome: string }>
  centros_custo: Array<{ id: string; nome: string; departamento_id: string }>
  linhas_dre:    Array<{ nome: string; tipo: string }>
  medidas:       Array<{ id: number; nome: string; descricao: string; unidade: string; tipo_medida: string; cor: string }>
  unidades:      string[]
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

const MESES_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const ANOS  = [2022,2023,2024,2025,2026]

export function WidgetConfigPanel({ widgetId, onClose }: WidgetConfigPanelProps) {
  const { dashboard, updateWidget, removeWidget, addWidget } = useBiStore()
  const widget = dashboard.widgets.find(w => w.id === widgetId)

  const [draft, setDraft]         = useState<WidgetConfig | null>(widget ?? null)
  const [dimensoes, setDimensoes] = useState<DimensoesData | null>(null)
  const [tab, setTab]             = useState<'what'|'where'|'how'>('what')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => {
    const p = widget?.scope.periodo
    if (!p) return new Date().getFullYear()
    if (p.tipo === 'mes') return p.ano
    if (p.tipo === 'ytd') return p.ano
    if (p.tipo === 'lista' && p.periodos.length > 0) return parseInt(p.periodos[0].slice(0, 4))
    return new Date().getFullYear()
  })

  useEffect(() => {
    fetch('/api/bi/dimensoes').then(r => r.json()).then(d => setDimensoes(d)).catch(() => {})
  }, [])

  if (!draft) return null

  const upd = (partial: Partial<WidgetConfig>) => setDraft(prev => prev ? { ...prev, ...partial } : prev)
  const updScope  = (s: Partial<BiScope>)     => upd({ scope:  { ...draft.scope,  ...s } })
  const updEstilo = (e: Partial<WidgetEstilo>) => upd({ estilo: { ...draft.estilo, ...e } })

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

  const dreLinhas      = (dimensoes?.linhas_dre ?? []).filter(l => l.tipo !== 'calculada')
  const depts          = dimensoes?.departamentos ?? []
  const medidas        = dimensoes?.medidas ?? []
  const allUnidades    = dimensoes?.unidades ?? []
  const selectedUnidades: string[] = draft.scope.unidades ?? []

  // Currently selected departments in draft
  const selectedDepts: string[] = draft.scope.departamentos ?? []

  // CCs visible: only those from selected depts (or all if no dept selected)
  const visibleCCs = (dimensoes?.centros_custo ?? []).filter(cc =>
    selectedDepts.length === 0 || selectedDepts.includes(cc.departamento_id)
  )

  // Period picker helpers
  const periodoPeriodos: Set<string> = new Set(
    draft.scope.periodo.tipo === 'mes'   ? [`${draft.scope.periodo.ano}-${String(draft.scope.periodo.mes).padStart(2,'0')}`]
    : draft.scope.periodo.tipo === 'ytd' ? Array.from({length:12}, (_,i) => `${draft.scope.periodo.ano}-${String(i+1).padStart(2,'0')}`)
    : draft.scope.periodo.tipo === 'lista' ? draft.scope.periodo.periodos
    : []
  )

  function togglePeriodoMonth(m: number) {
    const key = `${pickerYear}-${String(m).padStart(2, '0')}`
    const next = new Set(periodoPeriodos)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    const sorted = [...next].sort()
    if (sorted.length === 0) return
    if (sorted.length === 1) {
      const [y, mon] = sorted[0].split('-').map(Number)
      updScope({ periodo: { tipo: 'mes', mes: mon, ano: y } as BiPeriodo })
    } else {
      updScope({ periodo: { tipo: 'lista', periodos: sorted } as BiPeriodo })
    }
  }

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

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-[10px] font-semibold tracking-widest uppercase mb-1.5"
           style={{ fontFamily: FONTS.heading, color: BRAND.muted }}>
      {children}
    </label>
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
              <SectionLabel>Tipo de visualização</SectionLabel>
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
              <SectionLabel>Métrica</SectionLabel>
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
                {medidas.length > 0 && <option value="medida">Medida criada</option>}
              </select>
            </div>

            {/* DRE line selector */}
            {(draft.metrica.tipo === 'linha_dre' || draft.metrica.tipo === 'serie_temporal' ||
              draft.metrica.tipo === 'breakdown_cc' || draft.metrica.tipo === 'breakdown_dpto') && (
              <div>
                <SectionLabel>Linha DRE</SectionLabel>
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
                <SectionLabel>Grupo DRE</SectionLabel>
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
                  <SectionLabel>N</SectionLabel>
                  <input type="number" min={1} max={50}
                    value={(draft.metrica as { n?: number }).n ?? 10}
                    onChange={e => upd({ metrica: { ...draft.metrica, n: parseInt(e.target.value) || 10 } as BiMetrica })}
                    className="w-full px-2 py-1.5 border rounded text-sm outline-none"
                    style={{ borderColor: BRAND.border }} />
                </div>
                <div className="flex-1">
                  <SectionLabel>Ordem</SectionLabel>
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

            {/* Medida selector */}
            {draft.metrica.tipo === 'medida' && (
              <div>
                <SectionLabel>Medida criada</SectionLabel>
                <select
                  value={(draft.metrica as { medida_id?: number }).medida_id ?? ''}
                  onChange={e => {
                    const id = parseInt(e.target.value)
                    const m = medidas.find(x => x.id === id)
                    if (m) upd({ metrica: { tipo: 'medida', medida_id: m.id, nome_medida: m.nome } as BiMetrica })
                  }}
                  className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:border-[#B8924A]"
                  style={{ borderColor: BRAND.border, color: BRAND.ink }}
                >
                  <option value="">— Selecionar medida —</option>
                  {medidas.map(m => (
                    <option key={m.id} value={m.id}>{m.nome}{m.unidade ? ` (${m.unidade})` : ''}</option>
                  ))}
                </select>
                {draft.metrica.tipo === 'medida' && (draft.metrica as { medida_id?: number }).medida_id && (
                  <p className="text-[10px] mt-1" style={{ color: BRAND.muted }}>
                    {medidas.find(m => m.id === (draft.metrica as { medida_id?: number }).medida_id)?.descricao}
                  </p>
                )}
              </div>
            )}

            {/* Custom title */}
            <div>
              <SectionLabel>Título customizado</SectionLabel>
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
            {/* Use global period toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border"
                 style={{ borderColor: draft.scope.useGlobalPeriodo !== false ? BRAND.gold : BRAND.border,
                          backgroundColor: draft.scope.useGlobalPeriodo !== false ? '#FBF7EE' : 'white' }}>
              <div>
                <p className="text-xs font-semibold" style={{ color: BRAND.ink }}>Usar período global</p>
                <p className="text-[10px]" style={{ color: BRAND.muted }}>Segue o seletor do dashboard</p>
              </div>
              <button
                onClick={() => updScope({ useGlobalPeriodo: draft.scope.useGlobalPeriodo === false ? true : false })}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ backgroundColor: draft.scope.useGlobalPeriodo !== false ? BRAND.gold : '#D1D5DB' }}
              >
                <span className="absolute top-0.5 transition-all w-4 h-4 rounded-full bg-white shadow"
                      style={{ left: draft.scope.useGlobalPeriodo !== false ? '22px' : '2px' }} />
              </button>
            </div>

            {/* Period override — only when not using global */}
            {draft.scope.useGlobalPeriodo === false && (
              <div>
                <SectionLabel>Período específico</SectionLabel>

                {/* Year */}
                <div className="flex gap-1 mb-2">
                  {ANOS.map(y => (
                    <button key={y}
                      onClick={() => setPickerYear(y)}
                      className="flex-1 py-0.5 text-[10px] rounded border transition-colors"
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

                {/* Month grid */}
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {MESES_SHORT.map((m, i) => {
                    const key = `${pickerYear}-${String(i+1).padStart(2,'0')}`
                    const isSel = periodoPeriodos.has(key)
                    return (
                      <button key={i}
                        onClick={() => togglePeriodoMonth(i+1)}
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

                {/* Quick: YTD button */}
                <button
                  onClick={() => updScope({ periodo: { tipo: 'ytd', ano: pickerYear } as BiPeriodo })}
                  className="w-full py-1 text-xs rounded border transition-colors hover:bg-[#FBF7EE]"
                  style={{ borderColor: BRAND.gold, color: BRAND.gold, fontFamily: FONTS.mono }}>
                  YTD {pickerYear}
                </button>
              </div>
            )}

            {/* Unidades de negócio multiselect */}
            {allUnidades.length > 0 && (
              <div>
                <SectionLabel>
                  Unidades de negócio ({selectedUnidades.length === 0 ? 'todas' : `${selectedUnidades.length} sel.`})
                </SectionLabel>
                <div className="max-h-36 overflow-y-auto border rounded" style={{ borderColor: BRAND.border }}>
                  {allUnidades.map(u => {
                    const sel = selectedUnidades.includes(u)
                    return (
                      <label key={u} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={sel}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...selectedUnidades, u]
                              : selectedUnidades.filter(x => x !== u)
                            updScope({ unidades: next })
                          }} />
                        <span className="text-xs truncate" style={{ color: BRAND.ink }}>{u}</span>
                      </label>
                    )
                  })}
                </div>
                {selectedUnidades.length > 0 && (
                  <button onClick={() => updScope({ unidades: [] })}
                          className="text-[10px] mt-1" style={{ color: BRAND.muted }}>
                    Limpar seleção
                  </button>
                )}
              </div>
            )}

            {/* Department multiselect */}
            <div>
              <SectionLabel>
                Departamentos ({selectedDepts.length === 0 ? 'todos' : `${selectedDepts.length} sel.`})
              </SectionLabel>
              <div className="max-h-36 overflow-y-auto border rounded" style={{ borderColor: BRAND.border }}>
                {depts.map(d => {
                  const sel = selectedDepts.includes(d.id)
                  return (
                    <label key={d.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={sel}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selectedDepts, d.id]
                            : selectedDepts.filter(x => x !== d.id)
                          // Clear CC selection when depts change (cascade)
                          updScope({ departamentos: next, centros_custo: [] })
                        }} />
                      <span className="text-xs truncate" style={{ color: BRAND.ink }}>{d.nome}</span>
                    </label>
                  )
                })}
              </div>
              {selectedDepts.length > 0 && (
                <button onClick={() => updScope({ departamentos: [], centros_custo: [] })}
                        className="text-[10px] mt-1" style={{ color: BRAND.muted }}>
                  Limpar seleção
                </button>
              )}
            </div>

            {/* CC multiselect — cascaded from dept */}
            {visibleCCs.length > 0 && (
              <div>
                <SectionLabel>
                  Centros de custo ({(draft.scope.centros_custo?.length ?? 0) === 0 ? 'todos' : `${draft.scope.centros_custo!.length} sel.`})
                </SectionLabel>
                <div className="max-h-48 overflow-y-auto border rounded" style={{ borderColor: BRAND.border }}>
                  {visibleCCs.map(cc => {
                    const sel = draft.scope.centros_custo?.includes(cc.id) ?? false
                    const dept = depts.find(d => d.id === cc.departamento_id)
                    return (
                      <label key={cc.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={sel}
                          onChange={e => {
                            const prev = draft.scope.centros_custo ?? []
                            updScope({ centros_custo: e.target.checked ? [...prev, cc.id] : prev.filter(c => c !== cc.id) })
                          }} />
                        <span className="flex-1 min-w-0">
                          <span className="text-xs truncate block" style={{ color: BRAND.ink }}>{cc.nome}</span>
                          {selectedDepts.length !== 1 && dept && (
                            <span className="text-[9px]" style={{ color: BRAND.muted }}>{dept.nome}</span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <button onClick={() => updScope({ centros_custo: [] })}
                        className="text-[10px] mt-1" style={{ color: BRAND.muted }}>
                  Limpar seleção
                </button>
              </div>
            )}

            {/* Comparativo */}
            <div>
              <SectionLabel>Comparativo</SectionLabel>
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
            {/* Visibility toggles */}
            <div>
              <SectionLabel>Exibir</SectionLabel>
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
              <SectionLabel>Tamanho da fonte</SectionLabel>
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
              <SectionLabel>Formato de número</SectionLabel>
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
                <SectionLabel>Prefixo</SectionLabel>
                <input type="text" placeholder="ex: R$"
                  value={draft.estilo.prefixo ?? ''}
                  onChange={e => updEstilo({ prefixo: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  style={{ borderColor: BRAND.border }} />
              </div>
              <div className="flex-1">
                <SectionLabel>Sufixo</SectionLabel>
                <input type="text" placeholder="ex: %"
                  value={draft.estilo.sufixo ?? ''}
                  onChange={e => updEstilo({ sufixo: e.target.value || undefined })}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                  style={{ borderColor: BRAND.border }} />
              </div>
            </div>

            {/* Primary color */}
            <div>
              <SectionLabel>Cor primária</SectionLabel>
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

            {/* Bold / Italic */}
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox"
                  checked={draft.estilo.negrito}
                  onChange={e => updEstilo({ negrito: e.target.checked })} />
                <span className="text-xs font-bold" style={{ color: BRAND.ink }}>Negrito</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox"
                  checked={draft.estilo.italico}
                  onChange={e => updEstilo({ italico: e.target.checked })} />
                <span className="text-xs italic" style={{ color: BRAND.ink }}>Itálico</span>
              </label>
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
