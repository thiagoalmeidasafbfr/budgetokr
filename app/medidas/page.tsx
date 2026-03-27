'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Target, X, Check, Info, Divide, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Medida, FilterCondition, FilterColumn, FilterOperator } from '@/lib/types'

import { CHART_COLORS as COLORS } from '@/lib/constants'

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: '=',           label: 'igual a'          },
  { value: '!=',          label: 'diferente de'     },
  { value: 'contains',    label: 'contém'           },
  { value: 'not_contains',label: 'não contém'       },
  { value: 'starts_with', label: 'começa com'       },
  { value: 'in',          label: 'está em (vírgula)'},
]

const FILTER_COLUMNS: Array<{ value: FilterColumn; label: string; group: string }> = [
  { value: 'agrupamento_arvore',   label: 'Agrupamento Árvore',   group: 'Conta Contábil' },
  { value: 'dre',                  label: 'DRE',                   group: 'Conta Contábil' },
  { value: 'numero_conta_contabil',label: 'Número da Conta',       group: 'Conta Contábil' },
  { value: 'nome_conta_contabil',  label: 'Nome da Conta',         group: 'Conta Contábil' },
  { value: 'departamento',         label: 'Departamento',          group: 'Centro de Custo' },
  { value: 'nome_departamento',    label: 'Nome Departamento',     group: 'Centro de Custo' },
  { value: 'area',                 label: 'Área',                  group: 'Centro de Custo' },
  { value: 'centro_custo',         label: 'Centro de Custo (ID)',  group: 'Centro de Custo' },
  { value: 'fonte',                label: 'Fonte',                 group: 'Lançamento' },
  { value: 'data_lancamento',      label: 'Data de Lançamento',    group: 'Lançamento' },
]

interface MedidaForm {
  nome: string
  descricao: string
  unidade: string
  cor: string
  tipo_medida: 'simples' | 'ratio'
  tipo_fonte: 'budget' | 'razao' | 'ambos'
  filtros: FilterCondition[]
  denominador_filtros: FilterCondition[]
  denominador_tipo_fonte: 'budget' | 'razao' | 'ambos'
  departamentos: string[]
}

const emptyForm = (): MedidaForm => ({
  nome: '', descricao: '', unidade: '', cor: '#6366f1',
  tipo_medida: 'simples', tipo_fonte: 'ambos',
  filtros: [],
  denominador_filtros: [],
  denominador_tipo_fonte: 'ambos',
  departamentos: [],
})

export default function MedidasPage() {
  const [medidas,      setMedidas]      = useState<Medida[]>([])
  const [editing,      setEditing]      = useState<number | null>(null)
  const [form,         setForm]         = useState<MedidaForm>(emptyForm())
  const [distinctVals, setDistinctVals] = useState<Record<string, string[]>>({})
  const [suggestions,  setSuggestions]  = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [allDepts,     setAllDepts]     = useState<string[]>([])

  useEffect(() => { loadMedidas() }, [])
  useEffect(() => {
    fetch('/api/analise?type=distinct&col=nome_departamento').then(r => r.json()).then(d => setAllDepts(Array.isArray(d) ? d : []))
  }, [])

  const loadMedidas = () =>
    fetch('/api/medidas').then(r => r.json()).then(d => {
      if (d?.error) { setError(d.error); return }
      setMedidas(Array.isArray(d) ? d : [])
    }).catch(e => setError(String(e)))

  const loadDistinct = async (col: FilterColumn) => {
    if (distinctVals[col]) return
    const res = await fetch(`/api/analise?type=distinct&col=${col}`)
    const vals = await res.json()
    setDistinctVals(prev => ({ ...prev, [col]: Array.isArray(vals) ? vals : [] }))
  }

  const save = async () => {
    if (!form.nome.trim()) return
    setLoading(true)
    setError(null)
    try {
      const method = editing === -1 ? 'POST' : 'PUT'
      const body   = editing === -1 ? form : { id: editing, ...form }
      const res = await fetch('/api/medidas', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data?.error) {
        setError(data?.error || `Erro HTTP ${res.status}`)
        setLoading(false)
        return
      }
      setEditing(null)
      loadMedidas()
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  const remove = async (id: number) => {
    if (!confirm('Remover medida?')) return
    await fetch(`/api/medidas?id=${id}`, { method: 'DELETE' })
    loadMedidas()
  }

  const addFilter = (section: 'num' | 'den') =>
    setForm(f => {
      const key = section === 'num' ? 'filtros' : 'denominador_filtros'
      const existing = f[key]
      return {
        ...f,
        [key]: [
          ...existing,
          {
            column: 'agrupamento_arvore' as FilterColumn,
            operator: '=' as FilterOperator,
            value: '',
            logic: 'AND' as const,
          },
        ],
      }
    })

  const updateFilter = (section: 'num' | 'den', i: number, patch: Partial<FilterCondition>) =>
    setForm(f => {
      const key = section === 'num' ? 'filtros' : 'denominador_filtros'
      const arr = [...f[key]]
      arr[i] = { ...arr[i], ...patch } as FilterCondition
      return { ...f, [key]: arr }
    })

  const removeFilter = (section: 'num' | 'den', i: number) =>
    setForm(f => {
      const key = section === 'num' ? 'filtros' : 'denominador_filtros'
      return { ...f, [key]: f[key].filter((_, j) => j !== i) }
    })

  const groupedCols = FILTER_COLUMNS.reduce<Record<string, typeof FILTER_COLUMNS>>((acc, c) => {
    if (!acc[c.group]) acc[c.group] = []
    acc[c.group].push(c)
    return acc
  }, {})

  const openEdit = (m: Medida) => {
    setForm({
      nome: m.nome, descricao: m.descricao ?? '', unidade: m.unidade ?? '',
      cor: m.cor,
      tipo_medida: m.tipo_medida ?? 'simples',
      tipo_fonte: m.tipo_fonte,
      filtros: (m.filtros || []).map((f, i) => ({ ...f, logic: f.logic || (i === 0 ? 'AND' : (m.filtros_operador || 'AND')) })),
      denominador_filtros: (m.denominador_filtros || []).map((f, i) => ({ ...f, logic: f.logic || (i === 0 ? 'AND' : (m.denominador_filtros_operador || 'AND')) })),
      denominador_tipo_fonte: m.denominador_tipo_fonte ?? 'ambos',
      departamentos: m.departamentos ?? [],
    })
    setEditing(m.id)
    setError(null)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medidas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Defina KPIs como SG&A, COGS, Headcount usando filtros no star schema</p>
        </div>
        {editing === null && <Button onClick={() => { setForm(emptyForm()); setEditing(-1); setError(null) }}><Plus size={15} /> Nova Medida</Button>}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Erro</p>
            <p className="text-red-600 text-xs mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 text-gray-700 px-4 py-3 rounded-lg text-sm">
        <Info size={15} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Como funciona</p>
          <p className="text-gray-700 text-xs mt-0.5">
            <strong>Simples:</strong> soma de <code className="bg-gray-100 px-1 rounded">debito_credito</code> filtrada. Ex: SG&A = agrupamento = &quot;Operating Expenses&quot;.<br />
            <strong>Ratio:</strong> Numerador &divide; Denominador. Ex: SG&A Marketing / Receita Marketing = % do custo sobre receita.<br />
            <strong>E / OU:</strong> Cada critério pode ser conectado ao anterior com &quot;E&quot; (ambos devem ser verdadeiros) ou &quot;OU&quot; (qualquer um basta). Clique no conector para alternar.
          </p>
        </div>
      </div>

      {/* Form */}
      {editing !== null && (
        <Card className="ring-1 ring-gray-100">
          <CardHeader>
            <CardTitle>{editing === -1 ? 'Nova Medida' : 'Editar Medida'}</CardTitle>
            <CardDescription>Defina filtros e conecte-os com E ou OU clicando no conector entre cada linha.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Name + color */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Nome *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="Ex: SG&A, COGS, % Marketing sobre Receita…" />
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

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Descrição</label>
                <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="Descrição opcional" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Unidade</label>
                <input value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="R$, %, x…" />
              </div>
            </div>

            {/* Atribuição de departamentos */}
            {allDepts.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Visível para departamentos
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">(vazio = todos)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {allDepts.map(d => {
                    const selected = form.departamentos.includes(d)
                    return (
                      <button key={d} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          departamentos: selected
                            ? f.departamentos.filter(x => x !== d)
                            : [...f.departamentos, d],
                        }))}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          selected
                            ? 'bg-gray-900 text-white border-gray-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-500'
                        )}>
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tipo de medida */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Tipo de Medida</label>
              <div className="flex gap-2">
                {([['simples','Simples (soma)'],['ratio','Ratio (A ÷ B)']] as const).map(([t, label]) => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, tipo_medida: t }))}
                    className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm border font-medium transition-colors',
                      form.tipo_medida === t ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
                    {t === 'ratio' && <Divide size={14} />}{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Simples: fonte + filtros */}
            {form.tipo_medida === 'simples' && (
              <>
                <FonteSelector value={form.tipo_fonte} onChange={v => setForm(f => ({ ...f, tipo_fonte: v }))} />
                <FilterSection
                  title="Filtros"
                  filtros={form.filtros}
                  groupedCols={groupedCols}
                  suggestions={suggestions}
                  distinctVals={distinctVals}
                  prefix="num"
                  onAdd={() => addFilter('num')}
                  onUpdate={(i, p) => updateFilter('num', i, p)}
                  onRemove={i => removeFilter('num', i)}
                  onFocus={(key) => { setSuggestions(key); loadDistinct(key.split('-')[1] as FilterColumn) }}
                  onBlur={() => setTimeout(() => setSuggestions(null), 150)}
                />
              </>
            )}

            {/* Ratio: numerador + denominador */}
            {form.tipo_medida === 'ratio' && (
              <div className="space-y-4">
                <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/30">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs">A</span>
                    Numerador
                  </p>
                  <FonteSelector value={form.tipo_fonte} onChange={v => setForm(f => ({ ...f, tipo_fonte: v }))} />
                  <FilterSection
                    title="Filtros do Numerador"
                    filtros={form.filtros}
                    groupedCols={groupedCols}
                    suggestions={suggestions}
                    distinctVals={distinctVals}
                    prefix="num"
                    onAdd={() => addFilter('num')}
                    onUpdate={(i, p) => updateFilter('num', i, p)}
                    onRemove={i => removeFilter('num', i)}
                    onFocus={(key) => { setSuggestions(key); loadDistinct(key.split('-')[1] as FilterColumn) }}
                    onBlur={() => setTimeout(() => setSuggestions(null), 150)}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                  <div className="flex items-center gap-1 text-gray-400 text-sm font-medium">
                    <Divide size={14} /> dividido por
                  </div>
                  <div className="flex-1 border-t border-dashed border-gray-300" />
                </div>

                <div className="border border-amber-100 rounded-xl p-4 space-y-3 bg-amber-50/30">
                  <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs">B</span>
                    Denominador
                  </p>
                  <FonteSelector value={form.denominador_tipo_fonte} onChange={v => setForm(f => ({ ...f, denominador_tipo_fonte: v }))} />
                  <FilterSection
                    title="Filtros do Denominador"
                    filtros={form.denominador_filtros}
                    groupedCols={groupedCols}
                    suggestions={suggestions}
                    distinctVals={distinctVals}
                    prefix="den"
                    onAdd={() => addFilter('den')}
                    onUpdate={(i, p) => updateFilter('den', i, p)}
                    onRemove={i => removeFilter('den', i)}
                    onFocus={(key) => { setSuggestions(key); loadDistinct(key.split('-')[1] as FilterColumn) }}
                    onBlur={() => setTimeout(() => setSuggestions(null), 150)}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setEditing(null); setError(null) }}>Cancelar</Button>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{m.nome}</p>
                  <Badge variant={m.tipo_fonte === 'budget' ? 'default' : m.tipo_fonte === 'razao' ? 'success' : 'secondary'}>
                    {m.tipo_fonte}
                  </Badge>
                  {(m.tipo_medida === 'ratio') && (
                    <Badge variant="outline" className="gap-1"><Divide size={10} />Ratio</Badge>
                  )}
                  <Badge variant="outline">{m.filtros.length} filtro{m.filtros.length !== 1 ? 's' : ''}</Badge>
                  {m.tipo_medida === 'ratio' && (
                    <Badge variant="outline" className="text-amber-600">{m.denominador_filtros?.length ?? 0} filtro(s) den.</Badge>
                  )}
                </div>
                {m.descricao && <p className="text-xs text-gray-500 mt-0.5">{m.descricao}</p>}
                {m.filtros.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                    {m.filtros.map((f, i) => {
                      const col = FILTER_COLUMNS.find(c => c.value === f.column)?.label ?? f.column
                      const connector = i > 0 ? (f.logic || 'AND') : null
                      return (
                        <span key={i} className="contents">
                          {connector && (
                            <span className={cn('text-[10px] font-bold px-1', connector === 'OR' ? 'text-amber-500' : 'text-blue-500')}>
                              {connector === 'OR' ? 'OU' : 'E'}
                            </span>
                          )}
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-mono">
                            {col} {f.operator} &quot;{f.value}&quot;
                          </span>
                        </span>
                      )
                    })}
                    {m.tipo_medida === 'ratio' && m.denominador_filtros?.length > 0 && (
                      <>
                        <span className="text-gray-400 text-xs">&divide;</span>
                        {m.denominador_filtros.map((f, i) => {
                          const col = FILTER_COLUMNS.find(c => c.value === f.column)?.label ?? f.column
                          const connector = i > 0 ? (f.logic || 'AND') : null
                          return (
                            <span key={i} className="contents">
                              {connector && (
                                <span className={cn('text-[10px] font-bold px-1', connector === 'OR' ? 'text-amber-500' : 'text-blue-500')}>
                                  {connector === 'OR' ? 'OU' : 'E'}
                                </span>
                              )}
                              <span className="bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full font-mono">
                                {col} {f.operator} &quot;{f.value}&quot;
                              </span>
                            </span>
                          )
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => openEdit(m)}><Edit2 size={12} /></Button>
                <Button size="sm" variant="outline" onClick={() => remove(m.id)}><Trash2 size={12} className="text-red-400" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FonteSelector({ value, onChange }: { value: 'budget'|'razao'|'ambos'; onChange: (v: 'budget'|'razao'|'ambos') => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">Fonte de dados</label>
      <div className="flex gap-2">
        {(['budget','razao','ambos'] as const).map(t => (
          <button key={t} onClick={() => onChange(t)}
            className={cn('px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors',
              value === t ? 'bg-gray-900 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
            {t === 'budget' ? 'Budget' : t === 'razao' ? 'Razão' : 'Budget + Razão'}
          </button>
        ))}
      </div>
    </div>
  )
}

function FilterSection({
  title, filtros, groupedCols, suggestions, distinctVals, prefix,
  onAdd, onUpdate, onRemove, onFocus, onBlur,
}: {
  title: string
  filtros: FilterCondition[]
  groupedCols: Record<string, Array<{ value: FilterColumn; label: string; group: string }>>
  suggestions: string | null
  distinctVals: Record<string, string[]>
  prefix: string
  onAdd: () => void
  onUpdate: (i: number, p: Partial<FilterCondition>) => void
  onRemove: (i: number) => void
  onFocus: (key: string) => void
  onBlur: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">{title}</label>
        <Button size="sm" variant="outline" onClick={onAdd}><Plus size={13} /> Adicionar</Button>
      </div>

      {filtros.length === 0 && (
        <div className="border-2 border-dashed border-gray-100 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-400">Sem filtros — agrega todos os lançamentos do tipo selecionado</p>
          <Button size="sm" variant="ghost" onClick={onAdd} className="mt-1"><Plus size={13} /> Primeiro filtro</Button>
        </div>
      )}

      <div className="space-y-1">
        {filtros.map((f, i) => {
          const logic = f.logic || 'AND'
          return (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
              {i === 0 ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700 flex-shrink-0">
                  ONDE
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onUpdate(i, { logic: logic === 'AND' ? 'OR' : 'AND' })}
                  title="Clique para alternar E/OU"
                  className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 cursor-pointer transition-colors border',
                    logic === 'OR'
                      ? 'bg-amber-100 text-amber-600 border-amber-300 hover:bg-amber-200'
                      : 'bg-blue-100 text-blue-600 border-blue-300 hover:bg-blue-200'
                  )}>
                  {logic === 'OR' ? 'OU' : 'E'}
                </button>
              )}
              <select value={f.column}
                onChange={e => { onUpdate(i, { column: e.target.value as FilterColumn, value: '' }); onFocus(`${prefix}-${e.target.value}`) }}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
                {Object.entries(groupedCols).map(([group, cols]) => (
                  <optgroup key={group} label={group}>
                    {cols.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <select value={f.operator} onChange={e => onUpdate(i, { operator: e.target.value as FilterOperator })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400">
                {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              <div className="relative flex-1">
                <input value={f.value}
                  onChange={e => onUpdate(i, { value: e.target.value })}
                  onFocus={() => onFocus(`${prefix}-${f.column}`)}
                  onBlur={onBlur}
                  placeholder={f.operator === 'in' ? 'val1, val2, val3' : 'Valor…'}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400" />
                {suggestions === `${prefix}-${f.column}` && (distinctVals[f.column]?.length ?? 0) > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                    {(distinctVals[f.column] ?? [])
                      .filter(v => !f.value || v.toLowerCase().includes(f.value.toLowerCase()))
                      .slice(0, 25)
                      .map(v => (
                        <button key={v} onMouseDown={() => onUpdate(i, { value: v })}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-700 truncate">
                          {v}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <button onClick={() => onRemove(i)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
