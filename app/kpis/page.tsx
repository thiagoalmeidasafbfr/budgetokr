'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, Target, Globe, Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { KpiManual } from '@/lib/query'

import { CHART_COLORS as COLORS } from '@/lib/constants'

interface KpiForm {
  nome: string
  unidade: string
  descricao: string
  cor: string
  departamento: string
  tem_budget: number
  ordem: number
}

const emptyForm = (): KpiForm => ({
  nome: '', unidade: '', descricao: '', cor: '#6366f1',
  departamento: '', tem_budget: 0, ordem: 999,
})

function formatDeptLabel(d: string) {
  return d === '' ? 'Global (todos os departamentos)' : d
}

export default function KpisPage() {
  const [kpis,        setKpis]        = useState<KpiManual[]>([])
  const [departamentos, setDepts]     = useState<string[]>([])
  const [editing,     setEditing]     = useState<number | null>(null) // null = closed, -1 = new, N = id
  const [form,        setForm]        = useState<KpiForm>(emptyForm())
  const [loading,     setLoading]     = useState(false)
  const [deptFilter,  setDeptFilter]  = useState<string>('__all__')

  useEffect(() => {
    loadAll()
    fetch('/api/dre?type=distinct&col=nome_departamento')
      .then(r => r.json())
      .then(d => setDepts(['', ...(Array.isArray(d) ? d.filter(Boolean) : [])]))
  }, [])

  const loadAll = () =>
    fetch('/api/kpis').then(r => r.json()).then(d => setKpis(Array.isArray(d) ? d : []))

  const openNew = () => {
    setForm(emptyForm())
    setEditing(-1)
    // scroll to top of form
    setTimeout(() => document.getElementById('kpi-form')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const openEdit = (kpi: KpiManual) => {
    setForm({
      nome:         kpi.nome,
      unidade:      kpi.unidade,
      descricao:    kpi.descricao,
      cor:          kpi.cor,
      departamento: kpi.departamento,
      tem_budget:   kpi.tem_budget,
      ordem:        kpi.ordem,
    })
    setEditing(kpi.id)
    setTimeout(() => document.getElementById('kpi-form')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const cancel = () => { setEditing(null); setForm(emptyForm()) }

  const save = async () => {
    if (!form.nome.trim()) return
    setLoading(true)
    const isNew = editing === -1
    await fetch('/api/kpis', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isNew ? form : { id: editing, ...form }),
    })
    setLoading(false)
    cancel()
    loadAll()
  }

  const remove = async (id: number, nome: string) => {
    if (!confirm(`Excluir KPI "${nome}"? Esta ação não pode ser desfeita.`)) return
    await fetch(`/api/kpis?id=${id}`, { method: 'DELETE' })
    if (editing === id) cancel()
    loadAll()
  }

  // Group KPIs by department for display
  const filtered = deptFilter === '__all__' ? kpis : kpis.filter(k => k.departamento === deptFilter)

  const groups: Array<{ dept: string; items: KpiManual[] }> = []
  for (const kpi of filtered) {
    const g = groups.find(g => g.dept === kpi.departamento)
    if (g) g.items.push(kpi)
    else groups.push({ dept: kpi.departamento, items: [kpi] })
  }
  groups.sort((a, b) => a.dept.localeCompare(b.dept))

  const allDepts = [...new Set(kpis.map(k => k.departamento))].sort()

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title text-2xl md:text-3xl">KPIs Manuais</h1>
          <p className="text-sm mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#B8924A", opacity: 0.55, letterSpacing: "0.04em" }}>
            Configure os KPIs que aparecem nos dashboards de departamento · {kpis.length} KPI{kpis.length !== 1 ? 's' : ''} cadastrados
          </p>
        </div>
        <Button onClick={openNew}><Plus size={14} /> Novo KPI</Button>
      </div>

      {/* Form */}
      {editing !== null && (
        <Card id="kpi-form" className="ring-1 ring-gray-100">
          <CardHeader>
            <CardTitle>{editing === -1 ? 'Novo KPI' : 'Editar KPI'}</CardTitle>
            <CardDescription>
              KPIs globais (sem departamento) aparecem em todos os dashboards.
              KPIs de departamento aparecem apenas no dashboard daquele departamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Nome + cor */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Nome *</label>
                <input
                  autoFocus
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && save()}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="Ex: NPS, Churn Rate, Taxa de Conversão…"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Cor</label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, cor: c }))}
                      className={cn('w-6 h-6 rounded-full transition-transform',
                        form.cor === c && 'ring-2 ring-offset-1 ring-gray-400 scale-110')}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Unidade + departamento + ordem */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Unidade</label>
                <input
                  value={form.unidade}
                  onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  placeholder="R$, %, pts, x…"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Departamento</label>
                <select
                  value={form.departamento}
                  onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white">
                  <option value="">Global (todos)</option>
                  {departamentos.filter(Boolean).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Ordem</label>
                <input
                  type="number"
                  value={form.ordem}
                  onChange={e => setForm(f => ({ ...f, ordem: parseInt(e.target.value) || 999 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Descrição</label>
              <textarea
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                placeholder="Descrição ou metodologia de cálculo deste KPI…"
              />
            </div>

            {/* Tem meta (budget) */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                <input
                  type="checkbox"
                  checked={form.tem_budget === 1}
                  onChange={e => setForm(f => ({ ...f, tem_budget: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4 accent-gray-800"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Possui meta (budget)</p>
                  <p className="text-xs text-gray-500">Habilita o campo de meta no editor de valores e exibe a comparação no card do KPI</p>
                </div>
              </label>
              {form.tem_budget === 1 && (
                <Badge className="bg-gray-100 text-gray-700 border-gray-200">com meta</Badge>
              )}
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-200">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: form.cor }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{form.nome || 'Nome do KPI'}</p>
                <p className="text-xs text-gray-400">{form.descricao || 'Sem descrição'}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {form.unidade && <Badge variant="outline">{form.unidade}</Badge>}
                <Badge variant="secondary">{form.departamento || 'Global'}</Badge>
                {form.tem_budget === 1 && <Badge className="bg-gray-50 text-gray-700 border-gray-100">com meta</Badge>}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={cancel}>Cancelar</Button>
              <Button onClick={save} disabled={loading || !form.nome.trim()} className="flex-1">
                {loading ? 'Salvando…' : <><Check size={14} /> Salvar KPI</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter bar */}
      {kpis.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Filtrar:</span>
          {(['__all__', '', ...allDepts.filter(Boolean)] as string[]).map(d => (
            <button key={d}
              onClick={() => setDeptFilter(d)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors',
                deptFilter === d
                  ? 'bg-gray-900 text-white border-gray-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-500 hover:text-gray-700'
              )}>
              {d === '__all__' && <><Target size={10} /> Todos ({kpis.length})</>}
              {d === '' && <><Globe size={10} /> Global ({kpis.filter(k => k.departamento === '').length})</>}
              {d !== '__all__' && d !== '' && <><Building2 size={10} /> {d} ({kpis.filter(k => k.departamento === d).length})</>}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {kpis.length === 0 && editing === null && (
        <Card>
          <CardContent className="p-14 text-center">
            <Target size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="font-semibold text-gray-700">Nenhum KPI configurado</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">
              Crie KPIs manuais como NPS, Churn Rate, Headcount, Taxa de Conversão, etc.<br />
              Os valores são inseridos manualmente no Dashboard por Departamento.
            </p>
            <Button onClick={openNew}><Plus size={14} /> Criar primeiro KPI</Button>
          </CardContent>
        </Card>
      )}

      {/* KPI list grouped by department */}
      {groups.map(({ dept, items }) => (
        <div key={dept}>
          <div className="flex items-center gap-2 mb-2">
            {dept === '' ? (
              <Globe size={13} className="text-gray-400" />
            ) : (
              <Building2 size={13} className="text-gray-400" />
            )}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {dept === '' ? 'Global — todos os departamentos' : dept}
            </p>
            <span className="text-xs text-gray-400">({items.length})</span>
          </div>

          <div className="space-y-2">
            {items.map(kpi => (
              <Card key={kpi.id}
                className={cn('hover:shadow-sm transition-shadow',
                  editing === kpi.id && 'ring-2 ring-gray-300')}>
                <CardContent className="p-4 flex items-center gap-4">
                  {/* Color bar */}
                  <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: kpi.cor }} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{kpi.nome}</p>
                      {kpi.unidade && (
                        <Badge variant="outline" className="font-mono text-xs">{kpi.unidade}</Badge>
                      )}
                      {kpi.tem_budget === 1 && (
                        <Badge className="bg-gray-50 text-gray-700 border-gray-200 text-xs">com meta</Badge>
                      )}
                      <span className="text-xs text-gray-400">ordem {kpi.ordem}</span>
                    </div>
                    {kpi.descricao && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-lg">{kpi.descricao}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(kpi)}>
                      <Edit2 size={12} />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(kpi.id, kpi.nome)}>
                      <Trash2 size={12} className="text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
