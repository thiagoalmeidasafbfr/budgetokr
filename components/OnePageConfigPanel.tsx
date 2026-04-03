'use client'
import { X, Trash2, Copy, BarChart2, TrendingUp, PieChart, Table2, Type, Gauge, SlidersHorizontal } from 'lucide-react'
import type { WidgetConfig, WidgetType } from '@/lib/one-page-types'

interface Props {
  widget: WidgetConfig | null
  onClose: () => void
  onUpdate: (updates: Partial<WidgetConfig>) => void
  onDelete: () => void
  onDuplicate: () => void
  onChangeSource: () => void
  onOpenEditModal?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: '#9B6E20',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs mb-1 font-medium" style={{ color: 'rgba(0,0,0,0.5)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function PanelInput({
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
      className="w-full rounded-lg px-3 py-1.5 text-sm"
      style={{ border: '1px solid rgba(0,0,0,0.10)', color: '#0f172a', backgroundColor: 'white' }}
    />
  )
}

function PanelToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: '#374151' }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? '#be8c4a' : 'rgba(0,0,0,0.15)' }}
      >
        <span
          className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
          style={{
            marginTop: 2,
            marginLeft: 2,
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  )
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  unit?: string
}) {
  return (
    <FieldRow label={`${label} — ${value}${unit ?? ''}`}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: '#be8c4a' }}
      />
    </FieldRow>
  )
}

// ─── Widget type picker ───────────────────────────────────────────────────────

const TYPE_ICONS: Record<WidgetType, React.ElementType> = {
  kpi:   Gauge,
  bar:   BarChart2,
  line:  TrendingUp,
  donut: PieChart,
  table: Table2,
  title: Type,
}

const TYPE_LABELS: Record<WidgetType, string> = {
  kpi:   'KPI',
  bar:   'Barras',
  line:  'Linha',
  donut: 'Donut',
  table: 'Tabela',
  title: 'Título',
}

function TypePicker({
  current,
  onChange,
}: {
  current: WidgetType
  onChange: (t: WidgetType) => void
}) {
  const types: WidgetType[] = ['kpi', 'bar', 'line', 'donut', 'table', 'title']
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {types.map(t => {
        const Icon = TYPE_ICONS[t]
        const active = t === current
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className="flex flex-col items-center gap-1 py-2 rounded-lg transition-all text-xs"
            style={{
              border: active ? '1.5px solid #be8c4a' : '1px solid rgba(0,0,0,0.08)',
              backgroundColor: active ? 'rgba(190,140,74,0.1)' : 'white',
              color: active ? '#be8c4a' : '#374151',
            }}
          >
            <Icon size={13} />
            {TYPE_LABELS[t]}
          </button>
        )
      })}
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OnePageConfigPanel({
  widget,
  onClose,
  onUpdate,
  onDelete,
  onDuplicate,
  onChangeSource,
  onOpenEditModal,
}: Props) {
  const isOpen = widget !== null

  if (!isOpen) return null

  const fontSizes: { value: WidgetConfig['fontSize']; label: string }[] = [
    { value: 'sm', label: 'P' },
    { value: 'md', label: 'M' },
    { value: 'lg', label: 'G' },
    { value: 'xl', label: 'XL' },
  ]

  const colorSchemes: { value: WidgetConfig['colorScheme']; label: string }[] = [
    { value: 'default', label: 'Padrão' },
    { value: 'gold',    label: 'Ouro' },
    { value: 'green',   label: 'Verde' },
    { value: 'blue',    label: 'Azul' },
    { value: 'mono',    label: 'Mono' },
  ]

  const borderStyles: { value: WidgetConfig['borderStyle']; label: string }[] = [
    { value: 'card',   label: 'Card' },
    { value: 'subtle', label: 'Sutil' },
    { value: 'none',   label: 'Sem borda' },
  ]

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-30 flex flex-col overflow-y-auto"
      style={{
        width: 272,
        backgroundColor: 'white',
        borderLeft: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 sticky top-0 bg-white z-10"
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
            Configurar
          </p>
          <p className="text-sm font-semibold" style={{ color: '#0f172a' }}>
            {widget.title || 'Widget'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
        >
          <X size={14} style={{ color: '#64748b' }} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-5">

        {/* Conteúdo */}
        <PanelSection label="Conteúdo">
          <FieldRow label="Título">
            <PanelInput
              value={widget.title}
              onChange={v => onUpdate({ title: v })}
              placeholder="Título do widget"
            />
          </FieldRow>
          <FieldRow label="Subtítulo">
            <PanelInput
              value={widget.subtitle ?? ''}
              onChange={v => onUpdate({ subtitle: v })}
              placeholder="Opcional"
            />
          </FieldRow>
        </PanelSection>

        {/* Dados */}
        {widget.type !== 'title' && (
          <PanelSection label="Dados">
            <div
              className="rounded-lg p-3 text-xs"
              style={{ backgroundColor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}
            >
              <p style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>Fonte atual</p>
              <p className="font-medium" style={{ color: '#0f172a' }}>
                {widget.dataSource.kind === 'summary'    && 'Sumário Executivo'}
                {widget.dataSource.kind === 'exec_chart' && `Top N · ${widget.dataSource.groupBy}`}
                {widget.dataSource.kind === 'analise'    && `Análise · ${widget.dataSource.groupBy}`}
                {widget.dataSource.kind === 'medida'     && `Medida: ${widget.dataSource.medidaNome}`}
                {widget.dataSource.kind === 'static'     && 'Estático'}
              </p>
            </div>
            <button
              onClick={onChangeSource}
              className="w-full text-xs font-medium py-2 rounded-lg border transition-colors"
              style={{ borderColor: 'rgba(0,0,0,0.10)', color: '#374151' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F7F6F2')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Trocar fonte de dados
            </button>
          </PanelSection>
        )}

        {/* Tipo */}
        <PanelSection label="Tipo de visualização">
          <TypePicker current={widget.type} onChange={t => onUpdate({ type: t })} />
        </PanelSection>

        {/* Visual */}
        <PanelSection label="Visual">
          <FieldRow label="Fonte">
            <div className="flex gap-1">
              {fontSizes.map(fs => (
                <button
                  key={fs.value}
                  type="button"
                  onClick={() => onUpdate({ fontSize: fs.value })}
                  className="flex-1 py-1 rounded-md text-xs font-medium transition-all"
                  style={{
                    border: widget.fontSize === fs.value ? '1.5px solid #be8c4a' : '1px solid rgba(0,0,0,0.10)',
                    backgroundColor: widget.fontSize === fs.value ? 'rgba(190,140,74,0.1)' : 'white',
                    color: widget.fontSize === fs.value ? '#be8c4a' : '#374151',
                  }}
                >
                  {fs.label}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Cores">
            <div className="flex flex-wrap gap-1">
              {colorSchemes.map(cs => (
                <button
                  key={cs.value}
                  type="button"
                  onClick={() => onUpdate({ colorScheme: cs.value })}
                  className="px-2 py-1 rounded-md text-xs font-medium transition-all"
                  style={{
                    border: widget.colorScheme === cs.value ? '1.5px solid #be8c4a' : '1px solid rgba(0,0,0,0.10)',
                    backgroundColor: widget.colorScheme === cs.value ? 'rgba(190,140,74,0.1)' : 'white',
                    color: widget.colorScheme === cs.value ? '#be8c4a' : '#374151',
                  }}
                >
                  {cs.label}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Borda">
            <div className="flex gap-1">
              {borderStyles.map(bs => (
                <button
                  key={bs.value}
                  type="button"
                  onClick={() => onUpdate({ borderStyle: bs.value })}
                  className="flex-1 py-1 rounded-md text-xs transition-all"
                  style={{
                    border: widget.borderStyle === bs.value ? '1.5px solid #be8c4a' : '1px solid rgba(0,0,0,0.10)',
                    backgroundColor: widget.borderStyle === bs.value ? 'rgba(190,140,74,0.1)' : 'white',
                    color: widget.borderStyle === bs.value ? '#be8c4a' : '#374151',
                  }}
                >
                  {bs.label}
                </button>
              ))}
            </div>
          </FieldRow>

          {widget.type !== 'title' && (
            <PanelToggle
              label="Legenda"
              checked={widget.showLegend}
              onChange={v => onUpdate({ showLegend: v })}
            />
          )}
          {widget.type === 'kpi' && (
            <PanelToggle
              label="Mostrar variação"
              checked={widget.showDelta}
              onChange={v => onUpdate({ showDelta: v })}
            />
          )}
          {(widget.type === 'bar' || widget.type === 'line') && (
            <>
              <PanelToggle
                label="Eixos"
                checked={widget.showAxes !== false}
                onChange={v => onUpdate({ showAxes: v })}
              />
              <PanelToggle
                label="Linhas de grade"
                checked={widget.showGrid !== false}
                onChange={v => onUpdate({ showGrid: v })}
              />
              <PanelToggle
                label="Rótulos de dados"
                checked={widget.showDataLabels}
                onChange={v => onUpdate({ showDataLabels: v })}
              />
            </>
          )}
        </PanelSection>

        {/* Filtros ativos — apenas para exec_chart */}
        {widget.dataSource.kind === 'exec_chart' && (
          <PanelSection label="Filtros de Dados">
            <div className="space-y-2">
              {widget.dataSource.filterDepts?.length ? (
                <div className="flex items-start gap-1.5">
                  <span
                    className="px-1.5 py-0.5 rounded-full flex-shrink-0 text-[10px] font-medium"
                    style={{ backgroundColor: 'rgba(190,140,74,0.12)', color: '#be8c4a' }}
                  >
                    DEPT
                  </span>
                  <p className="text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
                    {widget.dataSource.filterDepts.join(', ')}
                  </p>
                </div>
              ) : null}
              {widget.dataSource.filterDreGroup ? (
                <div className="flex items-start gap-1.5">
                  <span
                    className="px-1.5 py-0.5 rounded-full flex-shrink-0 text-[10px] font-medium"
                    style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#6366f1' }}
                  >
                    DRE
                  </span>
                  <p className="text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
                    {widget.dataSource.filterDreGroup}
                  </p>
                </div>
              ) : null}
              {widget.dataSource.filterUnidades?.length ? (
                <div className="flex items-start gap-1.5">
                  <span
                    className="px-1.5 py-0.5 rounded-full flex-shrink-0 text-[10px] font-medium"
                    style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                  >
                    UN
                  </span>
                  <p className="text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
                    {widget.dataSource.filterUnidades.join(', ')}
                  </p>
                </div>
              ) : null}
              {widget.dataSource.filterCentros?.length ? (
                <div className="flex items-start gap-1.5">
                  <span
                    className="px-1.5 py-0.5 rounded-full flex-shrink-0 text-[10px] font-medium"
                    style={{ backgroundColor: 'rgba(20,184,166,0.12)', color: '#0d9488' }}
                  >
                    CC
                  </span>
                  <p className="text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
                    {widget.dataSource.filterCentros.join(', ')}
                  </p>
                </div>
              ) : null}
              {!widget.dataSource.filterDepts?.length &&
                !widget.dataSource.filterDreGroup &&
                !widget.dataSource.filterUnidades?.length &&
                !widget.dataSource.filterCentros?.length && (
                  <p className="text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>
                    Sem filtros — exibindo todos os dados
                  </p>
                )}
            </div>
            <button
              onClick={onOpenEditModal ?? onChangeSource}
              className="flex items-center gap-1.5 text-xs font-medium mt-1"
              style={{ color: '#be8c4a' }}
            >
              <SlidersHorizontal size={11} /> Editar filtros avançados
            </button>
          </PanelSection>
        )}

        {/* Layout */}
        <PanelSection label="Layout">
          <SliderField
            label="Largura"
            value={widget.w}
            onChange={v => onUpdate({ w: v })}
            min={1}
            max={12}
            unit=" col"
          />
          <SliderField
            label="Altura"
            value={widget.h}
            onChange={v => onUpdate({ h: v })}
            min={1}
            max={8}
            unit=" un"
          />
        </PanelSection>

        {/* Perigo */}
        <PanelSection label="Ações">
          <button
            onClick={onDuplicate}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ border: '1px solid rgba(0,0,0,0.08)', color: '#374151' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F7F6F2')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Copy size={13} /> Duplicar widget
          </button>
          <button
            onClick={onDelete}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(220,38,38,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Trash2 size={13} /> Deletar widget
          </button>
        </PanelSection>
      </div>
    </div>
  )
}
