'use client'
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import type { MetricDef, BoardConfig } from '@/lib/onepage-insights-types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface MetricConfigPanelProps {
  config: BoardConfig
  dreGroups: string[]          // available dre values from the database
  onSave: (config: BoardConfig) => void
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newMetric(order: number): MetricDef {
  return {
    id:        `m-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    name:      '',
    type:      'simple',
    dreGroups: [],
    format:    'currency',
    invertSign: false,
    order,
    viewMode:  'razao',
  }
}

// ─── MetricEditor: edita uma métrica individual ───────────────────────────────

function MetricEditor({
  metric,
  allMetrics,
  dreGroups,
  onChange,
  onDelete,
}: {
  metric: MetricDef
  allMetrics: MetricDef[]
  dreGroups: string[]
  onChange: (m: MetricDef) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(metric.name === '')

  function toggleDreGroup(g: string) {
    const current = metric.dreGroups ?? []
    const next = current.includes(g)
      ? current.filter(x => x !== g)
      : [...current, g]
    onChange({ ...metric, dreGroups: next })
  }

  // Metrics that can be used as numerator / denominator (only simple ones, not self)
  const simpleMetrics = allMetrics.filter(m => m.type === 'simple' && m.id !== metric.id)

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(0,0,0,0.09)' }}
    >
      {/* Metric header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        style={{ backgroundColor: open ? 'rgba(190,140,74,0.06)' : '#fafaf9' }}
        onClick={() => setOpen(v => !v)}
      >
        <GripVertical size={14} style={{ color: 'rgba(0,0,0,0.25)', flexShrink: 0 }} />
        <span
          className="flex-1 text-sm font-medium truncate"
          style={{ color: metric.name ? '#0f172a' : 'rgba(0,0,0,0.35)' }}
        >
          {metric.name || 'Sem nome'}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: metric.type === 'ratio' ? 'rgba(99,102,241,0.1)' : 'rgba(22,163,74,0.1)',
            color: metric.type === 'ratio' ? '#6366f1' : '#16a34a',
            fontSize: 9,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.06em',
          }}
        >
          {metric.type === 'ratio' ? '÷ razão' : '∑ simples'}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-0.5 rounded"
          style={{ color: 'rgba(0,0,0,0.3)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#dc2626' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.3)' }}
        >
          <Trash2 size={13} />
        </button>
        {open ? <ChevronUp size={14} style={{ color: 'rgba(0,0,0,0.4)' }} /> : <ChevronDown size={14} style={{ color: 'rgba(0,0,0,0.4)' }} />}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3" style={{ borderTop: '1px solid rgba(0,0,0,0.05)' }}>
          {/* Name */}
          <Field label="Nome">
            <input
              className="w-full rounded-lg px-3 py-1.5 text-sm border"
              style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#0f172a', outline: 'none' }}
              placeholder="Ex.: Receita Líquida"
              value={metric.name}
              onChange={e => onChange({ ...metric, name: e.target.value })}
            />
          </Field>

          {/* Type */}
          <Field label="Tipo">
            <div className="flex gap-2">
              {(['simple', 'ratio'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => onChange({ ...metric, type: t })}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all"
                  style={{
                    borderColor: metric.type === t ? '#be8c4a' : 'rgba(0,0,0,0.1)',
                    backgroundColor: metric.type === t ? 'rgba(190,140,74,0.1)' : 'transparent',
                    color: metric.type === t ? '#9B6E20' : '#374151',
                  }}
                >
                  {t === 'simple' ? '∑ Soma de grupos DRE' : '÷ Razão (A / B)'}
                </button>
              ))}
            </div>
          </Field>

          {/* Simple: DRE groups */}
          {metric.type === 'simple' && (
            <Field label="Grupos DRE">
              {dreGroups.length === 0 ? (
                <p className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}>Carregando grupos...</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                  {dreGroups.map(g => {
                    const active = (metric.dreGroups ?? []).includes(g)
                    return (
                      <button
                        key={g}
                        onClick={() => toggleDreGroup(g)}
                        className="px-2 py-0.5 rounded text-xs transition-all"
                        style={{
                          border: active ? '1px solid rgba(190,140,74,0.5)' : '1px solid rgba(0,0,0,0.1)',
                          backgroundColor: active ? 'rgba(190,140,74,0.12)' : 'transparent',
                          color: active ? '#9B6E20' : '#374151',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 10,
                        }}
                      >
                        {g}
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>
          )}

          {/* Ratio: numerator / denominator */}
          {metric.type === 'ratio' && (
            <>
              <Field label="Numerador (A)">
                <Select
                  value={metric.numeratorId ?? ''}
                  onChange={v => onChange({ ...metric, numeratorId: v })}
                  options={simpleMetrics.map(m => ({ value: m.id, label: m.name || m.id }))}
                  placeholder="Selecione uma métrica simples..."
                />
              </Field>
              <Field label="Denominador (B)">
                <Select
                  value={metric.denominatorId ?? ''}
                  onChange={v => onChange({ ...metric, denominatorId: v })}
                  options={simpleMetrics.map(m => ({ value: m.id, label: m.name || m.id }))}
                  placeholder="Selecione uma métrica simples..."
                />
              </Field>
            </>
          )}

          {/* Format */}
          <div className="flex items-center gap-3">
            <Field label="Formato" className="flex-1">
              <div className="flex gap-2">
                {(['currency', 'pct'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => onChange({ ...metric, format: f })}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      borderColor: metric.format === f ? '#be8c4a' : 'rgba(0,0,0,0.1)',
                      backgroundColor: metric.format === f ? 'rgba(190,140,74,0.1)' : 'transparent',
                      color: metric.format === f ? '#9B6E20' : '#374151',
                    }}
                  >
                    {f === 'currency' ? 'R$ Valor' : '% Percentual'}
                  </button>
                ))}
              </div>
            </Field>
            {metric.type === 'simple' && (
              <label className="flex items-center gap-1.5 cursor-pointer mt-4">
                <input
                  type="checkbox"
                  checked={!!metric.invertSign}
                  onChange={e => onChange({ ...metric, invertSign: e.target.checked })}
                  className="rounded"
                  style={{ accentColor: '#be8c4a' }}
                />
                <span className="text-xs" style={{ color: '#374151' }}>Inverter sinal</span>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Field & Select helpers ───────────────────────────────────────────────────

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>{label}</p>
      {children}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  return (
    <select
      className="w-full rounded-lg px-3 py-1.5 text-sm border"
      style={{ borderColor: 'rgba(0,0,0,0.12)', color: value ? '#0f172a' : 'rgba(0,0,0,0.4)', outline: 'none', backgroundColor: '#fff' }}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="" style={{ color: 'rgba(0,0,0,0.4)' }}>{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function MetricConfigPanel({ config, dreGroups, onSave, onClose }: MetricConfigPanelProps) {
  const [metrics, setMetrics] = useState<MetricDef[]>(() =>
    [...config.metrics].sort((a, b) => a.order - b.order)
  )

  useEffect(() => {
    setMetrics([...config.metrics].sort((a, b) => a.order - b.order))
  }, [config])

  function addMetric() {
    setMetrics(prev => [...prev, newMetric(prev.length)])
  }

  function updateMetric(id: string, updated: MetricDef) {
    setMetrics(prev => prev.map(m => m.id === id ? updated : m))
  }

  function deleteMetric(id: string) {
    setMetrics(prev => prev.filter(m => m.id !== id))
  }

  function handleSave() {
    const updated = metrics.map((m, i) => ({ ...m, order: i }))
    onSave({ ...config, metrics: updated })
    onClose()
  }

  const hasErrors = metrics.some(m => {
    if (!m.name) return true
    if (m.type === 'simple' && (!m.dreGroups || m.dreGroups.length === 0)) return true
    if (m.type === 'ratio' && (!m.numeratorId || !m.denominatorId)) return true
    return false
  })

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-40 flex flex-col"
        style={{
          width: 400,
          backgroundColor: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}
        >
          <div>
            <p
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: '#9B6E20',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Margin Board
            </p>
            <h2 className="font-semibold text-base" style={{ color: '#0f172a' }}>
              Configurar Métricas
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(0,0,0,0.4)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Explanation */}
        <div className="px-5 py-3 flex-shrink-0" style={{ backgroundColor: 'rgba(190,140,74,0.05)', borderBottom: '1px solid rgba(190,140,74,0.12)' }}>
          <p className="text-xs" style={{ color: '#9B6E20', lineHeight: 1.5 }}>
            Defina as colunas da tabela Margin Board. Métricas simples somam grupos DRE; métricas de razão calculam A ÷ B em percentual (ex.: EBITDA ÷ Receita Líquida).
          </p>
        </div>

        {/* Metrics list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {metrics.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'rgba(0,0,0,0.4)' }}>
              Nenhuma métrica configurada. Clique em &quot;+ Nova Métrica&quot; para começar.
            </p>
          )}
          {metrics.map(m => (
            <MetricEditor
              key={m.id}
              metric={m}
              allMetrics={metrics}
              dreGroups={dreGroups}
              onChange={updated => updateMetric(m.id, updated)}
              onDelete={() => deleteMetric(m.id)}
            />
          ))}

          <button
            onClick={addMetric}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            style={{
              border: '1.5px dashed rgba(190,140,74,0.4)',
              color: '#9B6E20',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(190,140,74,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <Plus size={14} /> Nova Métrica
          </button>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}>
            {metrics.length} métrica{metrics.length !== 1 ? 's' : ''} configurada{metrics.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'rgba(0,0,0,0.1)', color: '#374151' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={hasErrors}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#be8c4a' }}
              onMouseEnter={e => { if (!hasErrors) e.currentTarget.style.backgroundColor = '#a87840' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#be8c4a' }}
            >
              Salvar configuração
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
