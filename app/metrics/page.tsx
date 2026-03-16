'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Target, Filter, X, Check, ChevronDown, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Metric, FilterCondition } from '@/lib/types'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b',
]

const OPERATORS = [
  { value: '=', label: 'igual a' },
  { value: '!=', label: 'diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'not_contains', label: 'não contém' },
  { value: 'starts_with', label: 'começa com' },
  { value: 'in', label: 'está em (vírgula)' },
] as const

const COLUMNS = [
  { value: 'grp', label: 'Grupo' },
  { value: 'department', label: 'Departamento' },
  { value: 'account', label: 'Conta' },
  { value: 'period', label: 'Período' },
] as const

type ColValue = typeof COLUMNS[number]['value']
type OpValue = typeof OPERATORS[number]['value']

interface MetricFormState {
  name: string
  description: string
  color: string
  filters: FilterCondition[]
}

const emptyForm = (): MetricFormState => ({
  name: '',
  description: '',
  color: '#6366f1',
  filters: [],
})

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [editing, setEditing] = useState<number | null>(null) // metric id or -1 for new
  const [form, setForm] = useState<MetricFormState>(emptyForm())
  const [activeId, setActiveId] = useState<number | null>(null)
  const [distinctValues, setDistinctValues] = useState<Record<string, string[]>>({})
  const [showSuggestions, setShowSuggestions] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadMetrics()
    fetch('/api/datasets').then(r => r.json()).then(data => {
      if (data.activeId) {
        setActiveId(data.activeId)
        loadDistinctValues(data.activeId)
      }
    })
  }, [])

  const loadMetrics = () => {
    fetch('/api/metrics').then(r => r.json()).then(setMetrics)
  }

  const loadDistinctValues = async (id: number) => {
    const cols = ['grp', 'department', 'account', 'period'] as const
    const results = await Promise.all(
      cols.map(col => fetch(`/api/comparison?datasetId=${id}&type=distinct&col=${col}`).then(r => r.json()))
    )
    const vals: Record<string, string[]> = {}
    cols.forEach((col, i) => { vals[col] = results[i] })
    setDistinctValues(vals)
  }

  const startNew = () => {
    setForm(emptyForm())
    setEditing(-1)
  }

  const startEdit = (m: Metric) => {
    setForm({ name: m.name, description: m.description ?? '', color: m.color, filters: [...m.filters] })
    setEditing(m.id)
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm(emptyForm())
  }

  const save = async () => {
    if (!form.name.trim()) return
    setLoading(true)
    const body = { ...form, dataset_id: activeId }

    if (editing === -1) {
      await fetch('/api/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } else {
      await fetch('/api/metrics', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing, ...body }) })
    }

    setLoading(false)
    cancelEdit()
    loadMetrics()
  }

  const remove = async (id: number) => {
    if (!confirm('Remover esta métrica?')) return
    await fetch(`/api/metrics?id=${id}`, { method: 'DELETE' })
    loadMetrics()
  }

  const addFilter = () => {
    setForm(f => ({
      ...f,
      filters: [...f.filters, { column: 'grp', operator: '=', value: '' }],
    }))
  }

  const updateFilter = (i: number, patch: Partial<FilterCondition>) => {
    setForm(f => {
      const filters = [...f.filters]
      filters[i] = { ...filters[i], ...patch } as FilterCondition
      return { ...f, filters }
    })
  }

  const removeFilter = (i: number) => {
    setForm(f => ({ ...f, filters: f.filters.filter((_, j) => j !== i) }))
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Métricas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Defina filtros para calcular métricas departamentais automaticamente</p>
        </div>
        {editing === null && (
          <Button onClick={startNew}><Plus size={16} /> Nova Métrica</Button>
        )}
      </div>

      {/* Info box */}
      {!activeId && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 px-4 py-3 rounded-lg text-sm">
          <Info size={16} className="flex-shrink-0" />
          Importe um dataset para visualizar os valores disponíveis nos filtros.
        </div>
      )}

      {/* Form */}
      {editing !== null && (
        <Card className="ring-1 ring-indigo-100">
          <CardHeader>
            <CardTitle>{editing === -1 ? 'Nova Métrica' : 'Editar Métrica'}</CardTitle>
            <CardDescription>
              Defina filtros para determinar quais linhas compõem essa métrica.
              Ex: <code className="bg-gray-100 px-1 rounded text-xs">Grupo = "Operating Expenses"</code> → SG&A
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Name + color */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Nome da Métrica *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Ex: SG&A, COGS, Headcount..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Cor</label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={cn('w-6 h-6 rounded-full transition-transform', form.color === c && 'ring-2 ring-offset-1 ring-gray-400 scale-110')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Descrição (opcional)</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Ex: Despesas operacionais excluindo COGS"
              />
            </div>

            {/* Filters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Filtros <span className="text-gray-400 font-normal">(todos devem ser verdadeiros)</span>
                </label>
                <Button size="sm" variant="outline" onClick={addFilter}>
                  <Plus size={13} /> Adicionar Filtro
                </Button>
              </div>

              {form.filters.length === 0 && (
                <div className="border-2 border-dashed border-gray-100 rounded-lg p-6 text-center">
                  <Filter size={24} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">Sem filtros — inclui todas as linhas do dataset</p>
                  <Button size="sm" variant="ghost" onClick={addFilter} className="mt-2">
                    <Plus size={13} /> Adicionar primeiro filtro
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {form.filters.map((filter, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                    {i > 0 && (
                      <span className="text-xs text-gray-400 font-medium bg-gray-200 px-2 py-0.5 rounded">E</span>
                    )}
                    {i === 0 && (
                      <span className="text-xs text-gray-400 font-medium bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded">ONDE</span>
                    )}

                    <select
                      value={filter.column}
                      onChange={e => updateFilter(i, { column: e.target.value as ColValue, value: '' })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {COLUMNS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>

                    <select
                      value={filter.operator}
                      onChange={e => updateFilter(i, { operator: e.target.value as OpValue })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>

                    <div className="relative flex-1">
                      <input
                        value={filter.value}
                        onChange={e => updateFilter(i, { value: e.target.value })}
                        onFocus={() => setShowSuggestions(i)}
                        onBlur={() => setTimeout(() => setShowSuggestions(null), 200)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder={filter.operator === 'in' ? 'val1, val2, val3' : 'Valor...'}
                      />
                      {showSuggestions === i && distinctValues[filter.column]?.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {distinctValues[filter.column]
                            .filter(v => !filter.value || v.toLowerCase().includes(filter.value.toLowerCase()))
                            .slice(0, 20)
                            .map(v => (
                              <button
                                key={v}
                                onMouseDown={() => updateFilter(i, { value: v })}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 text-gray-700"
                              >
                                {v}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>

                    <button onClick={() => removeFilter(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Formula preview */}
              {form.filters.length > 0 && (
                <div className="mt-3 bg-indigo-50 rounded-lg px-3 py-2 text-xs font-mono text-indigo-700">
                  {form.name || 'Métrica'} = SUM(budget/actual) WHERE{' '}
                  {form.filters.map((f, i) => {
                    const colLabel = COLUMNS.find(c => c.value === f.column)?.label ?? f.column
                    const opLabel = OPERATORS.find(o => o.value === f.operator)?.label ?? f.operator
                    return (
                      <span key={i}>
                        {i > 0 && ' AND '}
                        <span className="text-indigo-900 font-bold">{colLabel}</span>
                        {' '}{opLabel}{' '}
                        <span className="text-emerald-700">&quot;{f.value}&quot;</span>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
              <Button onClick={save} disabled={loading} className="flex-1">
                {loading ? 'Salvando...' : <><Check size={16} /> Salvar Métrica</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics list */}
      {metrics.length === 0 && editing === null && (
        <Card>
          <CardContent className="p-12 text-center">
            <Target size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="font-semibold text-gray-700">Nenhuma métrica definida</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">
              Crie métricas para calcular automaticamente SG&A, COGS, Headcount e outros KPIs
            </p>
            <Button onClick={startNew}><Plus size={16} /> Criar primeira métrica</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {metrics.map(m => (
          <Card key={m.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div
                className="w-3 h-12 rounded-full flex-shrink-0"
                style={{ backgroundColor: m.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  <Badge variant="secondary">{m.filters.length} filtro{m.filters.length !== 1 ? 's' : ''}</Badge>
                </div>
                {m.description && <p className="text-sm text-gray-500 mt-0.5">{m.description}</p>}
                {m.filters.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.filters.map((f, i) => {
                      const colLabel = COLUMNS.find(c => c.value === f.column)?.label ?? f.column
                      return (
                        <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-mono">
                          {colLabel} {f.operator === '=' ? '=' : f.operator} &quot;{f.value}&quot;
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => startEdit(m)}>
                  <Edit2 size={13} />
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove(m.id)}>
                  <Trash2 size={13} className="text-red-400" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
