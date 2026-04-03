'use client'
import { useEffect, useState } from 'react'
import { X, BarChart2, TrendingUp, PieChart, Table2, Type, Gauge, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WidgetConfig, WidgetType, DataSource } from '@/lib/one-page-types'
import { createDefaultWidget } from '@/lib/one-page-types'

interface Props {
  initial: WidgetConfig | null
  onClose: () => void
  onAdd: (w: WidgetConfig) => void
}

type Step = 1 | 2 | 3

type MedidaOption = { id: number; nome: string }

const WIDGET_TYPES: { type: WidgetType; icon: React.ElementType; label: string; desc: string }[] = [
  { type: 'kpi',    icon: Gauge,      label: 'KPI Card',      desc: 'Valor em destaque com variação' },
  { type: 'bar',    icon: BarChart2,  label: 'Barras',        desc: 'Comparativo entre categorias' },
  { type: 'line',   icon: TrendingUp, label: 'Linha',         desc: 'Evolução ao longo do tempo' },
  { type: 'donut',  icon: PieChart,   label: 'Donut',         desc: 'Distribuição proporcional' },
  { type: 'table',  icon: Table2,     label: 'Tabela',        desc: 'Lista detalhada de valores' },
  { type: 'title',  icon: Type,       label: 'Título',        desc: 'Texto livre para organizar' },
]

const GROUPBY_OPTIONS = [
  { value: 'dre',              label: 'Agrupamento DRE' },
  { value: 'conta_contabil',   label: 'Conta Contábil' },
  { value: 'centro_custo',     label: 'Centro de Custo' },
  { value: 'departamento',     label: 'Departamento' },
  { value: 'unidade_negocio',  label: 'Unidade de Negócio' },
  { value: 'agrupamento_arvore', label: 'Árvore de Agrupamento' },
]

const FIELD_OPTIONS = [
  { value: 'razao',    label: 'Realizado' },
  { value: 'budget',   label: 'Budget' },
  { value: 'variacao', label: 'Variação' },
]

const SUMMARY_FIELDS = [
  { value: 'razao_ytd',    label: 'Realizado YTD' },
  { value: 'budget_ytd',   label: 'Budget YTD' },
  { value: 'variacao',     label: 'Variação Absoluta' },
  { value: 'variacao_pct', label: 'Variação %' },
]

const MEDIDA_VIEW_FIELDS = [
  { value: 'razao',        label: 'Realizado' },
  { value: 'budget',       label: 'Budget' },
  { value: 'variacao',     label: 'Variação' },
  { value: 'variacao_pct', label: 'Variação %' },
]

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: Step; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width: i + 1 === step ? 20 : 6,
            height: 6,
            backgroundColor: i + 1 <= step ? '#be8c4a' : 'rgba(0,0,0,0.12)',
          }}
        />
      ))}
    </div>
  )
}

// ─── Input / Select helpers ───────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(0,0,0,0.55)' }}>
      {children}
    </label>
  )
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2 text-sm"
      style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#0f172a', backgroundColor: 'white' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg px-3 py-2 text-sm"
      style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#0f172a', backgroundColor: 'white' }}
    />
  )
}

function NumberInput({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => onChange(Math.max(min, Number(e.target.value) || min))}
      className="w-full rounded-lg px-3 py-2 text-sm"
      style={{ border: '1px solid rgba(0,0,0,0.12)', color: '#0f172a', backgroundColor: 'white' }}
    />
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: checked ? '#be8c4a' : 'rgba(0,0,0,0.15)' }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform"
        style={{
          marginTop: 2,
          marginLeft: 2,
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
        }}
      />
    </button>
  )
}

// ─── Step 1: Widget type ──────────────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (type: WidgetType) => void }) {
  return (
    <div>
      <p className="text-sm font-semibold mb-4" style={{ color: '#0f172a' }}>
        Que tipo de widget deseja adicionar?
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WIDGET_TYPES.map(({ type, icon: Icon, label, desc }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className="flex flex-col items-start gap-2 p-3 rounded-xl text-left transition-all hover:shadow-sm"
            style={{ border: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#FAFAF9' }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#be8c4a'
              e.currentTarget.style.backgroundColor = 'rgba(190,140,74,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'
              e.currentTarget.style.backgroundColor = '#FAFAF9'
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(190,140,74,0.12)' }}
            >
              <Icon size={16} style={{ color: '#be8c4a' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0f172a' }}>{label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.45)' }}>{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Step 2: Data source ──────────────────────────────────────────────────────

type SourceKind = 'summary' | 'exec_chart' | 'analise' | 'medida'

function Step2({
  widgetType,
  dataSource,
  onChange,
}: {
  widgetType: WidgetType
  dataSource: DataSource
  onChange: (ds: DataSource) => void
}) {
  const [medidas, setMedidas] = useState<MedidaOption[]>([])
  const [sourceKind, setSourceKind] = useState<SourceKind>(
    (dataSource.kind === 'static' ? 'summary' : dataSource.kind) as SourceKind
  )

  useEffect(() => {
    fetch('/api/medidas', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setMedidas(data.map((m: { id: number; nome: string }) => ({ id: m.id, nome: m.nome })))
      })
      .catch(() => {})
  }, [])

  const availableSources: { value: SourceKind; label: string }[] = (() => {
    if (widgetType === 'kpi') return [
      { value: 'summary',    label: 'Sumário Executivo' },
      { value: 'analise',    label: 'Análise Macro' },
      { value: 'medida',     label: 'Medida Calculada' },
      { value: 'exec_chart', label: 'Top N (Exec Chart)' },
    ]
    if (widgetType === 'line') return [
      { value: 'analise',    label: 'Análise Macro (série temporal)' },
      { value: 'medida',     label: 'Medida Calculada' },
      { value: 'exec_chart', label: 'Top N (Exec Chart)' },
    ]
    return [
      { value: 'exec_chart', label: 'Top N (Exec Chart)' },
      { value: 'analise',    label: 'Análise Macro' },
      { value: 'medida',     label: 'Medida Calculada' },
    ]
  })()

  function applyKind(kind: SourceKind) {
    setSourceKind(kind)
    if (kind === 'summary') onChange({ kind: 'summary', field: 'razao_ytd' })
    if (kind === 'exec_chart') onChange({ kind: 'exec_chart', groupBy: 'dre', field: 'razao', topN: 8 })
    if (kind === 'analise') onChange({ kind: 'analise', groupBy: widgetType === 'line' ? 'periodo' : 'departamento', field: 'razao' })
    if (kind === 'medida') {
      const first = medidas[0]
      onChange({ kind: 'medida', medidaId: first?.id ?? 0, medidaNome: first?.nome ?? '', viewField: 'razao' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Fonte de dados</FieldLabel>
        <div className="flex flex-col gap-1.5">
          {availableSources.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => applyKind(s.value)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all"
              style={{
                border: sourceKind === s.value ? '1.5px solid #be8c4a' : '1px solid rgba(0,0,0,0.10)',
                backgroundColor: sourceKind === s.value ? 'rgba(190,140,74,0.08)' : 'white',
                color: sourceKind === s.value ? '#be8c4a' : '#374151',
              }}
            >
              <span
                className="w-3 h-3 rounded-full border flex-shrink-0"
                style={{
                  borderColor: sourceKind === s.value ? '#be8c4a' : 'rgba(0,0,0,0.25)',
                  backgroundColor: sourceKind === s.value ? '#be8c4a' : 'transparent',
                }}
              />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary config */}
      {sourceKind === 'summary' && dataSource.kind === 'summary' && (
        <div>
          <FieldLabel>Campo</FieldLabel>
          <SelectInput
            value={dataSource.field}
            onChange={v => onChange({ kind: 'summary', field: v as 'budget_ytd' | 'razao_ytd' | 'variacao' | 'variacao_pct' })}
            options={SUMMARY_FIELDS}
          />
        </div>
      )}

      {/* Exec chart config */}
      {sourceKind === 'exec_chart' && dataSource.kind === 'exec_chart' && (
        <div className="space-y-3">
          <div>
            <FieldLabel>Dimensão</FieldLabel>
            <SelectInput
              value={dataSource.groupBy}
              onChange={v => onChange({ ...dataSource, groupBy: v })}
              options={GROUPBY_OPTIONS}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Campo</FieldLabel>
              <SelectInput
                value={dataSource.field}
                onChange={v => onChange({ ...dataSource, field: v as 'razao' | 'budget' | 'variacao' })}
                options={FIELD_OPTIONS}
              />
            </div>
            <div>
              <FieldLabel>Top N</FieldLabel>
              <NumberInput value={dataSource.topN} onChange={v => onChange({ ...dataSource, topN: v })} min={2} max={20} />
            </div>
          </div>
        </div>
      )}

      {/* Analise config */}
      {sourceKind === 'analise' && dataSource.kind === 'analise' && (
        <div className="space-y-3">
          <div>
            <FieldLabel>Agrupamento</FieldLabel>
            <SelectInput
              value={dataSource.groupBy}
              onChange={v => onChange({ ...dataSource, groupBy: v as 'departamento' | 'periodo' })}
              options={[
                { value: 'departamento', label: 'Por Departamento' },
                { value: 'periodo',      label: 'Por Período' },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Campo</FieldLabel>
            <SelectInput
              value={dataSource.field}
              onChange={v => onChange({ ...dataSource, field: v as 'razao' | 'budget' | 'variacao' })}
              options={FIELD_OPTIONS}
            />
          </div>
        </div>
      )}

      {/* Medida config */}
      {sourceKind === 'medida' && dataSource.kind === 'medida' && (
        <div className="space-y-3">
          <div>
            <FieldLabel>Medida Calculada</FieldLabel>
            {medidas.length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>Carregando medidas...</p>
            ) : (
              <SelectInput
                value={String(dataSource.medidaId)}
                onChange={v => {
                  const m = medidas.find(x => String(x.id) === v)
                  if (m) onChange({ ...dataSource, medidaId: m.id, medidaNome: m.nome })
                }}
                options={medidas.map(m => ({ value: String(m.id), label: m.nome }))}
              />
            )}
          </div>
          <div>
            <FieldLabel>Campo</FieldLabel>
            <SelectInput
              value={dataSource.viewField}
              onChange={v => onChange({ ...dataSource, viewField: v as 'razao' | 'budget' | 'variacao' | 'variacao_pct' })}
              options={MEDIDA_VIEW_FIELDS}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step 3: Appearance ───────────────────────────────────────────────────────

function Step3({
  config,
  onChange,
}: {
  config: WidgetConfig
  onChange: (updates: Partial<WidgetConfig>) => void
}) {
  const fontSizes: { value: WidgetConfig['fontSize']; label: string }[] = [
    { value: 'sm', label: 'P' },
    { value: 'md', label: 'M' },
    { value: 'lg', label: 'G' },
    { value: 'xl', label: 'XL' },
  ]

  const colorSchemes: { value: WidgetConfig['colorScheme']; label: string }[] = [
    { value: 'default', label: 'Padrão' },
    { value: 'gold',    label: 'Dourado' },
    { value: 'green',   label: 'Verde' },
    { value: 'blue',    label: 'Azul' },
    { value: 'mono',    label: 'Mono' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Título do widget</FieldLabel>
        <TextInput
          value={config.title}
          onChange={v => onChange({ title: v })}
          placeholder="Ex: Total Realizado"
        />
      </div>

      <div>
        <FieldLabel>Subtítulo (opcional)</FieldLabel>
        <TextInput
          value={config.subtitle ?? ''}
          onChange={v => onChange({ subtitle: v })}
          placeholder="Ex: YTD 2026"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Largura (colunas)</FieldLabel>
          <NumberInput
            value={config.w}
            onChange={v => onChange({ w: Math.max(1, Math.min(12, v)) })}
            min={1}
            max={12}
          />
        </div>
        <div>
          <FieldLabel>Altura (unidades)</FieldLabel>
          <NumberInput
            value={config.h}
            onChange={v => onChange({ h: Math.max(1, Math.min(8, v)) })}
            min={1}
            max={8}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Tamanho da fonte</FieldLabel>
        <div className="flex gap-1.5">
          {fontSizes.map(fs => (
            <button
              key={fs.value}
              type="button"
              onClick={() => onChange({ fontSize: fs.value })}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                border: config.fontSize === fs.value ? '1.5px solid #be8c4a' : '1px solid rgba(0,0,0,0.12)',
                backgroundColor: config.fontSize === fs.value ? 'rgba(190,140,74,0.1)' : 'white',
                color: config.fontSize === fs.value ? '#be8c4a' : '#374151',
              }}
            >
              {fs.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Esquema de cores</FieldLabel>
        <div className="flex gap-1.5 flex-wrap">
          {colorSchemes.map(cs => (
            <button
              key={cs.value}
              type="button"
              onClick={() => onChange({ colorScheme: cs.value })}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                border: config.colorScheme === cs.value ? '1.5px solid #be8c4a' : '1px solid rgba(0,0,0,0.12)',
                backgroundColor: config.colorScheme === cs.value ? 'rgba(190,140,74,0.1)' : 'white',
                color: config.colorScheme === cs.value ? '#be8c4a' : '#374151',
              }}
            >
              {cs.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {config.type !== 'title' && (
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: '#374151' }}>Mostrar legenda</span>
            <Toggle checked={config.showLegend} onChange={v => onChange({ showLegend: v })} />
          </div>
        )}
        {config.type === 'kpi' && (
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: '#374151' }}>Mostrar variação</span>
            <Toggle checked={config.showDelta} onChange={v => onChange({ showDelta: v })} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function OnePageAddWidgetModal({ initial, onClose, onAdd }: Props) {
  const [step, setStep] = useState<Step>(initial ? 2 : 1)
  const [config, setConfig] = useState<WidgetConfig>(
    initial ?? createDefaultWidget('kpi')
  )

  function handleTypeSelect(type: WidgetType) {
    const base = createDefaultWidget(type)
    setConfig({ ...base, title: base.title })
    setStep(type === 'title' ? 3 : 2)
  }

  function updateConfig(updates: Partial<WidgetConfig>) {
    setConfig(prev => ({ ...prev, ...updates }))
  }

  function handleNext() {
    if (step < 3) setStep((step + 1) as Step)
  }

  function handleBack() {
    if (step > 1) setStep((step - 1) as Step)
  }

  function handleSubmit() {
    onAdd(config)
  }

  const totalSteps = config.type === 'title' ? 2 : 3
  const canNext = step < 3
  const isLast = step === 3 || (config.type === 'title' && step === 2)

  const stepLabels: Record<Step, string> = {
    1: 'Tipo de widget',
    2: config.type === 'title' ? 'Aparência' : 'Fonte de dados',
    3: 'Aparência',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div>
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: '#9B6E20',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {stepLabels[step]}
            </p>
            <h3 className="font-semibold text-base" style={{ color: '#0f172a' }}>
              {initial ? 'Editar Widget' : 'Adicionar Widget'}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <StepIndicator step={step} total={totalSteps} />
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
              <X size={16} style={{ color: '#64748b' }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && <Step1 onSelect={handleTypeSelect} />}
          {step === 2 && config.type !== 'title' && (
            <Step2
              widgetType={config.type}
              dataSource={config.dataSource}
              onChange={ds => updateConfig({ dataSource: ds })}
            />
          )}
          {(step === 3 || (step === 2 && config.type === 'title')) && (
            <Step3 config={config} onChange={updateConfig} />
          )}
        </div>

        {/* Footer */}
        {step > 1 && (
          <div
            className="flex items-center justify-between px-5 py-4 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
          >
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'rgba(0,0,0,0.10)', color: '#374151' }}
            >
              <ChevronLeft size={14} /> Voltar
            </button>

            {isLast ? (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-1 text-sm font-medium px-4 py-1.5 rounded-lg text-white transition-colors"
                style={{ backgroundColor: '#be8c4a' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#a87840')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#be8c4a')}
              >
                {initial ? 'Salvar alterações' : 'Adicionar widget'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canNext}
                className="flex items-center gap-1 text-sm font-medium px-4 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40"
                style={{ backgroundColor: '#be8c4a' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#a87840')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#be8c4a')}
              >
                Próximo <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
