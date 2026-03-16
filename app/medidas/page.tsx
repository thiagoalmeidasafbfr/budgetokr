'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Target, Filter, X, Check, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Medida, FilterCondition, FilterColumn, FilterOperator } from '@/lib/types'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#0ea5e9','#64748b']

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: '=',           label: 'igual a'          },
  { value: '!=',          label: 'diferente de'     },
  { value: 'contains',    label: 'contém'           },
  { value: 'not_contains',label: 'não contém'       },
  { value: 'starts_with', label: 'começa com'       },
  { value: 'in',          label: 'está em (vírgula)'},
]

const FILTER_COLUMNS: Array<{ value: FilterColumn; label: string; group: string }> = [
  // Conta Contábil (dimensão)
  { value: 'agrupamento_arvore',   label: 'Agrupamento Árvore',   group: 'Conta Contábil' },
  { value: 'dre',                  label: 'DRE',                   group: 'Conta Contábil' },
  { value: 'numero_conta_contabil',label: 'Número da Conta',       group: 'Conta Contábil' },
  { value: 'nome_conta_contabil',  label: 'Nome da Conta',         group: 'Conta Contábil' },
  // Centro de Custo (dimensão)
  { value: 'departamento',         label: 'Departamento',          group: 'Centro de Custo' },
  { value: 'nome_departamento',    label: 'Nome Departamento',     group: 'Centro de Custo' },
  { value: 'area',                 label: 'Área',                  group: 'Centro de Custo' },
  { value: 'centro_custo',         label: 'Centro de Custo (ID)',  group: 'Centro de Custo' },
  // Lançamento
  { value: 'fonte',                label: 'Fonte',                 group: 'Lançamento' },
  { value: 'data_lancamento',      label: 'Data de Lançamento',    group: 'Lançamento' },
]

interface MedidaForm {
  nome: string
  descricao: string
  cor: string
  tipo_fonte: 'budget' | 'razao' | 'ambos'
  filtros: FilterCondition[]
}

const emptyForm = (): MedidaForm => ({
  nome: '', descricao: '', cor: '#6366f1', tipo_fonte: 'ambos', filtros: [],
})

export default function MedidasPage() {
  const [medidas,         setMedidas]         = useState<Medida[]>([])
  const [editing,         setEditing]         = useState<number | null>(null)
  const [form,            setForm]            = useState<MedidaForm>(emptyForm())
  const [distinctVals,    setDistinctVals]    = useState<Record<string, string[]>>({})
  const [suggestions,     setSuggestions]     = useState<number | null>(null)
  const [loading,         setLoading]         = useState(false)

  useEffect(() => { loadMedidas() }, [])

  const loadMedidas = () =>
    fetch('/api/medidas').then(r => r.json()).then(d => setMedidas(Array.isArray(d) ? d : []))

  const loadDistinct = async (col: FilterColumn) => {
    if (distinctVals[col]) return
    const res = await fetch(`/api/analise?type=distinct&col=${col}`)
    const vals = await res.json()
    setDistinctVals(prev => ({ ...prev, [col]: Array.isArray(vals) ? vals : [] }))
  }

  const save = async () => {
    if (!form.nome.trim()) return
    setLoading(true)
    const method = editing === -1 ? 'POST' : 'PUT'
    const body   = editing === -1 ? form : { id: editing, ...form }
    await fetch('/api/medidas', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setLoading(false)
    setEditing(null)
    loadMedidas()
  }

  const remove = async (id: number) => {
    if (!confirm('Remover medida?')) return
    await fetch(`/api/medidas?id=${id}`, { method: 'DELETE' })
    loadMedidas()
  }

  const addFilter = () => setForm(f => ({ ...f, filtros: [...f.filtros, { column: 'agrupamento_arvore', operator: '=', value: '' }] }))
  const updateFilter = (i: number, patch: Partial<FilterCondition>) => setForm(f => {
    const filtros = [...f.filtros]
    filtros[i] = { ...filtros[i], ...patch } as FilterCondition
    return { ...f, filtros }
  })
  const removeFilter = (i: number) => setForm(f => ({ ...f, filtros: f.filtros.filter((_, j) => j !== i) }))

  const groupedCols = FILTER_COLUMNS.reduce<Record<string, typeof FILTER_COLUMNS>>((acc, c) => {
    if (!acc[c.group]) acc[c.group] = []
    acc[c.group].push(c)
    return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medidas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Defina KPIs como SG&A, COGS, Headcount usando filtros no star schema</p>
        </div>
        {editing === null && <Button onClick={() => { setForm(emptyForm()); setEditing(-1) }}><Plus size={15} /> Nova Medida</Button>}
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-3 rounded-lg text-sm">
        <Info size={15} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Como funciona</p>
          <p className="text-indigo-600 text-xs mt-0.5">
            Uma medida = soma de <code className="bg-indigo-100 px-1 rounded">debito_credito</code> dos lançamentos que
            passam nos filtros. Os filtros cruzam automaticamente com as dimensões de <strong>Contas Contábeis</strong> e <strong>Centros de Custo</strong> via JOIN.
            Exemplo: <code className="bg-indigo-100 px-1 rounded">Agrupamento = "Operating Expenses"</code> → SG&A
          </p>
        </div>
      </div>

      {/* Form */}
      {editing !== null && (
        <Card className="ring-1 ring-indigo-100">
          <CardHeader>
            <CardTitle>{editing === -1 ? 'Nova Medida' : 'Editar Medida'}</CardTitle>
            <CardDescription>
              Filtros aplicam AND entre si. Os campos de dimensões são resolvidos via JOIN automático.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Name + color */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Nome *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Ex: SG&A, COGS, Receita Bruta…" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Cor</label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, cor: c }))}
                      className={cn('w-6 h-6 rounded-full transition-transform', form.cor === c && 'ring-2 ring-offset-1 ring-gray-400 scale-110')}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Descrição</label>
              <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Descrição opcional" />
            </div>

            {/* Fonte */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Fonte de dados</label>
              <div className="flex gap-2">
                {(['budget','razao','ambos'] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, tipo_fonte: t }))}
                    className={cn('px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors',
                      form.tipo_fonte === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
                    {t === 'budget' ? 'Budget' : t === 'razao' ? 'Razão' : 'Budget + Razão'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {form.tipo_fonte === 'ambos' ? 'Calcula budget e razão separadamente para comparação' : `Agrega apenas lançamentos do tipo "${form.tipo_fonte}"`}
              </p>
            </div>

            {/* Filters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Filtros <span className="text-gray-400 font-normal">(todos aplicados com AND)</span>
                </label>
                <Button size="sm" variant="outline" onClick={addFilter}><Plus size={13} /> Adicionar</Button>
              </div>

              {form.filtros.length === 0 && (
                <div className="border-2 border-dashed border-gray-100 rounded-lg p-6 text-center">
                  <Filter size={22} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">Sem filtros — agrega todos os lançamentos do tipo selecionado</p>
                  <Button size="sm" variant="ghost" onClick={addFilter} className="mt-2"><Plus size={13} /> Primeiro filtro</Button>
                </div>
              )}

              <div className="space-y-2">
                {form.filtros.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded flex-shrink-0',
                      i === 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-500')}>
                      {i === 0 ? 'ONDE' : 'E'}
                    </span>

                    {/* Column selector grouped */}
                    <select value={f.column}
                      onChange={e => { updateFilter(i, { column: e.target.value as FilterColumn, value: '' }); loadDistinct(e.target.value as FilterColumn) }}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      {Object.entries(groupedCols).map(([group, cols]) => (
                        <optgroup key={group} label={group}>
                          {cols.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </optgroup>
                      ))}
                    </select>

                    <select value={f.operator} onChange={e => updateFilter(i, { operator: e.target.value as FilterOperator })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>

                    <div className="relative flex-1">
                      <input value={f.value}
                        onChange={e => updateFilter(i, { value: e.target.value })}
                        onFocus={() => { setSuggestions(i); loadDistinct(f.column) }}
                        onBlur={() => setTimeout(() => setSuggestions(null), 150)}
                        placeholder={f.operator === 'in' ? 'val1, val2, val3' : 'Valor…'}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      {suggestions === i && (distinctVals[f.column]?.length ?? 0) > 0 && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                          {(distinctVals[f.column] ?? [])
                            .filter(v => !f.value || v.toLowerCase().includes(f.value.toLowerCase()))
                            .slice(0, 25)
                            .map(v => (
                              <button key={v} onMouseDown={() => updateFilter(i, { value: v })}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 text-gray-700 truncate">
                                {v}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>

                    <button onClick={() => removeFilter(i)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Formula preview */}
              {form.filtros.length > 0 && (
                <div className="mt-3 bg-gray-900 rounded-lg px-4 py-3 text-xs font-mono text-green-400 overflow-x-auto">
                  <span className="text-gray-400">-- {form.nome || 'medida'}</span>
                  <br />
                  <span className="text-blue-400">SELECT</span> SUM(l.debito_credito){' '}
                  <span className="text-blue-400">FROM</span> lancamentos l
                  <br />
                  <span className="text-blue-400ml-2"> LEFT JOIN</span> contas_contabeis ca <span className="text-blue-400">ON</span> l.numero_conta_contabil = ca.numero_conta_contabil
                  <br />
                  <span className="text-blue-400"> LEFT JOIN</span> centros_custo cc <span className="text-blue-400">ON</span> l.centro_custo = cc.centro_custo
                  <br />
                  <span className="text-blue-400">WHERE</span> l.tipo = <span className="text-yellow-400">&apos;{form.tipo_fonte !== 'ambos' ? form.tipo_fonte : 'budget|razao'}&apos;</span>
                  {form.filtros.map((f, i) => {
                    const col = FILTER_COLUMNS.find(c => c.value === f.column)?.label ?? f.column
                    return (
                      <span key={i}>
                        <br />&nbsp;&nbsp;<span className="text-blue-400">AND</span>{' '}
                        <span className="text-white">{f.column}</span>{' = '}<span className="text-yellow-400">&apos;{f.value}&apos;</span>
                        <span className="text-gray-500"> -- {col}</span>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} disabled={loading} className="flex-1">
                {loading ? 'Salvando…' : <><Check size={15} /> Salvar Medida</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {medidas.length === 0 && editing === null && (
        <Card><CardContent className="p-12 text-center">
          <Target size={36} className="mx-auto text-gray-200 mb-3" />
          <p className="font-semibold text-gray-700">Nenhuma medida definida</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Crie medidas para calcular SG&A, COGS, Headcount e outros KPIs</p>
          <Button onClick={() => { setForm(emptyForm()); setEditing(-1) }}><Plus size={15} /> Criar primeira medida</Button>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {medidas.map(m => (
          <Card key={m.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: m.cor }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{m.nome}</p>
                  <Badge variant={m.tipo_fonte === 'budget' ? 'default' : m.tipo_fonte === 'razao' ? 'success' : 'secondary'}>
                    {m.tipo_fonte}
                  </Badge>
                  <Badge variant="outline">{m.filtros.length} filtro{m.filtros.length !== 1 ? 's' : ''}</Badge>
                </div>
                {m.descricao && <p className="text-xs text-gray-500 mt-0.5">{m.descricao}</p>}
                {m.filtros.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {m.filtros.map((f, i) => {
                      const col = FILTER_COLUMNS.find(c => c.value === f.column)?.label ?? f.column
                      return (
                        <span key={i} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-mono">
                          {col} {f.operator} &quot;{f.value}&quot;
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => { setForm({ nome: m.nome, descricao: m.descricao ?? '', cor: m.cor, tipo_fonte: m.tipo_fonte, filtros: m.filtros }); setEditing(m.id) }}>
                  <Edit2 size={12} />
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove(m.id)}>
                  <Trash2 size={12} className="text-red-400" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
