'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Settings, Edit2, Trash2, Save, X, BarChart3, TrendingUp, TrendingDown, Target, ExternalLink, Download, CheckSquare, Square, ArrowUpDown, Columns3, ChevronRight, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line, LabelList,
} from 'recharts'
import { buildTree, buildTreeFromLinhas, flattenTree, type DRERow, type DRELinha, type TreeNode } from '@/lib/dre-utils'
import type { KpiManual, KpiValor } from '@/lib/query'

const DEFAULT_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6']

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnaliseRow {
  departamento: string
  nome_departamento: string
  periodo: string
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
}

interface DreGrupo {
  dre: string
  budget: number
  razao: number
  ordem_dre?: number
}

interface MedidaInfo {
  id: number
  nome: string
  descricao?: string
  unidade?: string
  cor: string
  tipo_medida: string
  tipo_fonte: string
}

interface MedidaCard {
  medida: MedidaInfo
  isRatio: boolean
  byPeriodo: Record<string, {
    budget: number; razao: number
    num_razao: number; num_budget: number
    den_razao: number; den_budget: number
  }>
}

interface DashboardData {
  byPeriodo: AnaliseRow[]
  dreGrupos: DreGrupo[]
  medidaCards: MedidaCard[]
}

// ─── DRE Detalhamento Modal ────────────────────────────────────────────────────

interface DetalhamentoLinha {
  id: number
  tipo: string
  data_lancamento: string
  numero_conta_contabil: string
  nome_conta_contabil: string
  centro_custo: string
  nome_centro_custo: string
  agrupamento_arvore: string
  dre: string
  nome_conta_contrapartida: string
  debito_credito: number
  observacao: string
  fonte: string
}

interface DetModalState {
  dre: string
  agrupamento?: string
  departamento: string
  periodos: string[]
  tipo: 'budget' | 'razao' | 'ambos'
}

type DetColKey = 'data' | 'tipo' | 'centro' | 'dre' | 'agrupamento' | 'conta' | 'valor' | 'contrapartida' | 'obs'
const DET_COLS: { key: DetColKey; label: string; align?: 'right' }[] = [
  { key: 'data',          label: 'Data Lançamento' },
  { key: 'tipo',          label: 'Tipo' },
  { key: 'centro',        label: 'Centro de Custo' },
  { key: 'dre',           label: 'DRE Gerencial' },
  { key: 'agrupamento',   label: 'Agrupamento' },
  { key: 'conta',         label: 'Conta Contábil' },
  { key: 'valor',         label: 'Valor', align: 'right' },
  { key: 'contrapartida', label: 'Conta Contrapartida' },
  { key: 'obs',           label: 'Observação' },
]
function detColValue(r: DetalhamentoLinha, key: DetColKey): string | number {
  switch (key) {
    case 'data':          return r.data_lancamento
    case 'tipo':          return r.tipo
    case 'centro':        return `${r.centro_custo}${r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}`
    case 'dre':           return r.dre
    case 'agrupamento':   return r.agrupamento_arvore
    case 'conta':         return `${r.numero_conta_contabil} — ${r.nome_conta_contabil}`
    case 'valor':         return r.debito_credito
    case 'contrapartida': return r.nome_conta_contrapartida
    case 'obs':           return r.observacao ?? ''
  }
}

function DetalhamentoModal({ ctx, onClose }: { ctx: DetModalState; onClose: () => void }) {
  const [rows,        setRows]        = useState<DetalhamentoLinha[]>([])
  const [loading,     setLoading]     = useState(true)
  const [textFilter,  setTextFilter]  = useState('')
  const [sortCol,     setSortCol]     = useState<DetColKey>('data')
  const [sortDir,     setSortDir]     = useState<'asc' | 'desc'>('asc')
  const [visibleCols, setVisibleCols] = useState<Set<DetColKey>>(new Set(DET_COLS.map(c => c.key)))
  const [showCols,    setShowCols]    = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showCols) return
    const h = (e: MouseEvent) => { if (colsRef.current && !colsRef.current.contains(e.target as Node)) setShowCols(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [showCols])

  useEffect(() => {
    const p = new URLSearchParams()
    if (ctx.dre)              p.set('dre',          ctx.dre)
    if (ctx.agrupamento)      p.set('agrupamento',  ctx.agrupamento)
    if (ctx.departamento)     p.set('departamento', ctx.departamento)
    if (ctx.periodos.length)  p.set('periodos',     ctx.periodos.join(','))
    if (ctx.tipo !== 'ambos') p.set('tipo',         ctx.tipo)
    fetch(`/api/dre/detalhamento?${p}`)
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false) })
  }, [ctx])

  const title = [ctx.dre, ctx.agrupamento !== ctx.dre ? ctx.agrupamento : null,
    ctx.tipo !== 'ambos' ? `· ${ctx.tipo === 'budget' ? 'Budget' : 'Realizado'}` : null,
  ].filter(Boolean).join(' › ')

  const displayed = rows
    .filter(r => {
      if (!textFilter) return true
      const q = textFilter.toLowerCase()
      return DET_COLS.some(c => String(detColValue(r, c.key)).toLowerCase().includes(q))
    })
    .sort((a, b) => {
      const va = detColValue(a, sortCol), vb = detColValue(b, sortCol)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const total = displayed.reduce((s, r) => s + r.debito_credito, 0)
  const toggleSort = (key: DetColKey) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }
  const visibleDefs = DET_COLS.filter(c => visibleCols.has(c.key))

  const exportCSV = () => {
    const header = DET_COLS.map(c => c.label)
    const csvRows = rows.map(r => DET_COLS.map(c => String(detColValue(r, c.key) ?? '')))
    const csv = [header, ...csvRows].map(row => row.map(v => `"${v.replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `dre-lancamentos-${Date.now()}.csv`; a.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6 px-4 overflow-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">DRE — Lançamentos</p>
            <h2 className="text-base font-bold text-gray-900 mt-0.5">{title || ctx.dre}</h2>
          </div>
          <div className="flex items-center gap-2">
            {!loading && rows.length > 0 && (
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 transition-colors font-medium">
                <Download size={13} /> Exportar CSV
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>
        {!loading && (
          <div className="flex items-center gap-2 px-5 py-2 border-b bg-gray-50">
            <input type="text" value={textFilter} onChange={e => setTextFilter(e.target.value)}
              placeholder="Buscar em todos os campos…"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
            <div className="relative" ref={colsRef}>
              <button onClick={() => setShowCols(v => !v)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-indigo-400 hover:text-indigo-700 text-gray-600 transition-colors">
                <Columns3 size={13} /> Colunas
              </button>
              {showCols && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[180px] space-y-1">
                  {DET_COLS.map(c => (
                    <label key={c.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={visibleCols.has(c.key)}
                        onChange={e => setVisibleCols(prev => { const n = new Set(prev); e.target.checked ? n.add(c.key) : n.delete(c.key); return n })}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-700">{c.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{displayed.length} de {rows.length} lançamentos</span>
          </div>
        )}
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-10">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-700 text-white">
                <tr>
                  {visibleDefs.map(c => (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      className={cn('px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:bg-gray-600', c.align === 'right' ? 'text-right' : 'text-left')}>
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        <ArrowUpDown size={10} className={cn('opacity-40', sortCol === c.key && 'opacity-100 text-indigo-300')} />
                        {sortCol === c.key && <span className="text-indigo-300 text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((r, i) => (
                  <tr key={r.id} className={cn('border-b border-gray-100', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60')}>
                    {visibleCols.has('data')          && <td className="px-3 py-1.5 whitespace-nowrap font-mono">{r.data_lancamento}</td>}
                    {visibleCols.has('tipo')          && <td className="px-3 py-1.5"><span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', r.tipo === 'budget' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')}>{r.tipo === 'budget' ? 'Budget' : 'Real'}</span></td>}
                    {visibleCols.has('centro')        && <td className="px-3 py-1.5 whitespace-nowrap">{r.centro_custo}{r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}</td>}
                    {visibleCols.has('dre')           && <td className="px-3 py-1.5 whitespace-nowrap">{r.dre}</td>}
                    {visibleCols.has('agrupamento')   && <td className="px-3 py-1.5 whitespace-nowrap">{r.agrupamento_arvore}</td>}
                    {visibleCols.has('conta')         && <td className="px-3 py-1.5 whitespace-nowrap">{r.numero_conta_contabil} — {r.nome_conta_contabil}</td>}
                    {visibleCols.has('valor')         && <td className={cn('px-3 py-1.5 text-right whitespace-nowrap font-semibold', r.debito_credito < 0 ? 'text-red-600' : 'text-gray-800')}>{formatCurrency(r.debito_credito)}</td>}
                    {visibleCols.has('contrapartida') && <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{r.nome_conta_contrapartida}</td>}
                    {visibleCols.has('obs')           && <td className="px-3 py-1.5 max-w-xs truncate text-gray-500">{r.observacao}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-800 text-white font-bold">
                <tr>
                  <td colSpan={visibleDefs.filter(c => c.key !== 'valor').length} className="px-3 py-2 text-right">Total ({displayed.length} lançamentos)</td>
                  <td className={cn('px-3 py-2 text-right', total < 0 ? 'text-red-300' : 'text-emerald-300')}>{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DRE Completa (tree view) ────────────────────────────────────────────────

function DreFull({
  rawData, hierarchy, dreLinhas, expanded, onToggle, loading, onDetalhamento,
}: {
  rawData: DRERow[]
  hierarchy: Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>
  dreLinhas: DRELinha[]
  expanded: Set<string>
  onToggle: (name: string) => void
  loading: boolean
  onDetalhamento: (dre: string, agrupamento: string | undefined, tipo: 'budget' | 'razao' | 'ambos') => void
}) {
  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  const tree = dreLinhas.length > 0
    ? buildTreeFromLinhas(rawData, hierarchy, dreLinhas)
    : buildTree(rawData, hierarchy)
  const flat = flattenTree(tree, expanded)
  if (!flat.length) return <div className="px-5 py-8 text-center text-sm text-gray-400">Sem dados para o período selecionado.</div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-5 py-3 font-medium text-gray-500">Demonstrativo Gerencial</th>
            <th className="text-right px-5 py-3 font-medium text-gray-500 hover:text-indigo-600 cursor-pointer select-none">Orçado</th>
            <th className="text-right px-5 py-3 font-medium text-gray-500 hover:text-emerald-600 cursor-pointer select-none">Realizado</th>
            <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
            <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
          </tr>
        </thead>
        <tbody>
          {flat.map((row, i) => (
            <tr key={i} className={cn('border-b transition-colors group', row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50', row.isSeparator && 'border-t-2 border-gray-300')}>
              <td className={cn('px-5 py-2.5', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-800' : 'text-gray-700')}
                style={{ paddingLeft: `${20 + row.depth * 24}px` }}>
                <div className="flex items-center gap-1.5">
                  {row.children.length > 0 && !row.isSubtotal ? (
                    <button onClick={() => onToggle(row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                      {expanded.has(row.name) ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    </button>
                  ) : <span className="w-5" />}
                  <span onClick={() => !row.isSubtotal && onDetalhamento(row.dre ?? row.name, row.agrupamento, 'ambos')}
                    className={cn(!row.isSubtotal && 'cursor-pointer hover:text-indigo-700')}>
                    {row.name}
                  </span>
                </div>
              </td>
              <td className={cn('px-5 py-2.5 text-right cursor-pointer hover:text-indigo-700 hover:bg-indigo-50/60', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}
                onClick={() => !row.isSubtotal && onDetalhamento(row.dre ?? row.name, row.agrupamento, 'budget')}>
                {formatCurrency(row.budget)}
              </td>
              <td className={cn('px-5 py-2.5 text-right cursor-pointer hover:text-emerald-700 hover:bg-emerald-50/60', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}
                onClick={() => !row.isSubtotal && onDetalhamento(row.dre ?? row.name, row.agrupamento, 'razao')}>
                {formatCurrency(row.razao)}
              </td>
              <td className={cn('px-5 py-2.5 text-right font-semibold', colorForVariance(row.variacao))}>
                {formatCurrency(row.variacao)}
              </td>
              <td className="px-5 py-2.5 text-right">
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(row.variacao))}>
                  {formatPct(row.variacao_pct)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── KPI Edit Modal (create/edit definition) ──────────────────────────────────

interface KpiEditModalProps {
  kpi: KpiManual | null          // null = new
  departamento: string
  onSave: (kpi: Omit<KpiManual, 'id'> & { id?: number }) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onClose: () => void
}

function KpiEditModal({ kpi, departamento, onSave, onDelete, onClose }: KpiEditModalProps) {
  const [nome,       setNome]      = useState(kpi?.nome       ?? '')
  const [unidade,    setUnidade]   = useState(kpi?.unidade    ?? '')
  const [descricao,  setDescricao] = useState(kpi?.descricao  ?? '')
  const [cor,        setCor]       = useState(kpi?.cor        ?? '#6366f1')
  const [temBudget,  setTemBudget] = useState(kpi?.tem_budget ?? 0)
  const [saving,     setSaving]    = useState(false)
  const [deleting,   setDeleting]  = useState(false)

  const handleSave = async () => {
    if (!nome.trim()) return
    setSaving(true)
    await onSave({
      id: kpi?.id,
      nome: nome.trim(),
      unidade: unidade.trim(),
      descricao: descricao.trim(),
      departamento: kpi?.departamento ?? departamento,
      cor,
      ordem: kpi?.ordem ?? 999,
      tem_budget: temBudget,
    })
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!kpi) return
    if (!confirm(`Excluir KPI "${kpi.nome}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    await onDelete(kpi.id)
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900">{kpi ? 'Editar KPI' : 'Novo KPI'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Ex: NPS, Churn Rate, MRR..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidade</label>
              <input
                value={unidade}
                onChange={e => setUnidade(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="R$, %, un, x..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={cor}
                  onChange={e => setCor(e.target.value)}
                  className="w-10 h-9 border border-gray-200 rounded-lg cursor-pointer"
                />
                <div className="flex flex-wrap gap-1">
                  {DEFAULT_COLORS.slice(0, 4).map(c => (
                    <button
                      key={c}
                      onClick={() => setCor(c)}
                      className={cn('w-5 h-5 rounded-full border-2', cor === c ? 'border-gray-600' : 'border-transparent')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              placeholder="Descrição opcional..."
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={temBudget === 1}
                onChange={e => setTemBudget(e.target.checked ? 1 : 0)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-gray-700">Possui meta (budget)</span>
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <div>
            {kpi && (
              <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200">
                <Trash2 size={13} />{deleting ? 'Excluindo...' : 'Excluir'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !nome.trim()}>
              <Save size={13} />{saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── KPI Valores Modal ────────────────────────────────────────────────────────

interface KpiValoresModalProps {
  kpi: KpiManual
  periodos: string[]
  onClose: () => void
  onSaved: () => void
}

function KpiValoresModal({ kpi, periodos, onClose, onSaved }: KpiValoresModalProps) {
  // Use up to 12 most recent periods; if user has selected periods use those
  const targetPeriods = periodos.length > 0 ? periodos : []
  const displayPeriods = targetPeriods.length > 0
    ? [...targetPeriods].sort()
    : []

  const [rows, setRows] = useState<Array<{ periodo: string; valor: string; meta: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const fetchValores = async () => {
      setLoading(true)
      const params = new URLSearchParams({ kpiId: String(kpi.id) })
      if (displayPeriods.length > 0) params.set('periodos', displayPeriods.join(','))
      const res = await fetch(`/api/kpis/valores?${params}`, { cache: 'no-store' })
      const existing: KpiValor[] = res.ok ? await res.json() : []
      const byPeriodo: Record<string, KpiValor> = {}
      for (const v of existing) byPeriodo[v.periodo] = v

      const periodsToShow = displayPeriods.length > 0 ? displayPeriods : existing.map(v => v.periodo).sort()
      setRows(periodsToShow.map(p => ({
        periodo: p,
        valor:   byPeriodo[p] != null ? String(byPeriodo[p].valor) : '',
        meta:    byPeriodo[p]?.meta != null ? String(byPeriodo[p].meta) : '',
      })))
      setLoading(false)
    }
    fetchValores()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpi.id])

  const handleSave = async () => {
    setSaving(true)
    const valores = rows
      .filter(r => r.valor !== '')
      .map(r => ({
        periodo: r.periodo,
        valor:   parseFloat(r.valor) || 0,
        meta:    r.meta !== '' ? (parseFloat(r.meta) || 0) : null,
      }))
    await fetch('/api/kpis/valores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kpiId: kpi.id, valores }),
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  const updateRow = (idx: number, field: 'valor' | 'meta', val: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: kpi.cor }} />
            <h2 className="font-bold text-gray-900">{kpi.nome}</h2>
            {kpi.unidade && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{kpi.unidade}</span>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhum período selecionado. Selecione períodos na sidebar para editar valores.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-gray-500">Período</th>
                  <th className="text-right py-2 font-medium text-gray-500">Valor</th>
                  {kpi.tem_budget === 1 && (
                    <th className="text-right py-2 font-medium text-gray-500">Meta</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.periodo} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700 font-medium">{formatPeriodo(row.periodo)}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        value={row.valor}
                        onChange={e => updateRow(idx, 'valor', e.target.value)}
                        className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        placeholder="0"
                      />
                    </td>
                    {kpi.tem_budget === 1 && (
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          value={row.meta}
                          onChange={e => updateRow(idx, 'meta', e.target.value)}
                          className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          placeholder="—"
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || rows.length === 0}>
            <Save size={13} />{saving ? 'Salvando...' : 'Salvar valores'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── KPI Management Modal ─────────────────────────────────────────────────────

interface KpiManagementModalProps {
  departamento: string
  kpis: KpiManual[]
  onClose: () => void
  onRefresh: () => void
}

function KpiManagementModal({ departamento, kpis, onClose, onRefresh }: KpiManagementModalProps) {
  const [editingKpi, setEditingKpi] = useState<KpiManual | null | 'new'>(null)

  const handleSaveKpi = async (data: Omit<KpiManual, 'id'> & { id?: number }) => {
    const method = data.id ? 'PUT' : 'POST'
    await fetch('/api/kpis', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, departamento: data.departamento || departamento }),
    })
    setEditingKpi(null)
    onRefresh()
  }

  const handleDeleteKpi = async (id: number) => {
    await fetch(`/api/kpis?id=${id}`, { method: 'DELETE' })
    setEditingKpi(null)
    onRefresh()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
            <h2 className="font-bold text-gray-900">Configurar KPIs</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {kpis.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum KPI configurado para este departamento.</p>
            ) : (
              <div className="space-y-2">
                {kpis.map(kpi => (
                  <div key={kpi.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: kpi.cor }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{kpi.nome}</p>
                        <p className="text-xs text-gray-400">
                          {kpi.unidade && <span className="mr-2">{kpi.unidade}</span>}
                          {kpi.departamento === '' ? 'Global' : kpi.departamento}
                          {kpi.tem_budget === 1 && <span className="ml-2 text-indigo-500">com meta</span>}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditingKpi(kpi)}
                      className="flex-shrink-0 ml-2">
                      <Edit2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
            <Button size="sm" onClick={() => setEditingKpi('new')}>
              <Plus size={13} />Novo KPI
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>

      {editingKpi !== null && (
        <KpiEditModal
          kpi={editingKpi === 'new' ? null : editingKpi}
          departamento={departamento}
          onSave={handleSaveKpi}
          onDelete={handleDeleteKpi}
          onClose={() => setEditingKpi(null)}
        />
      )}
    </>
  )
}

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function shortPeriodo(p: string) {
  const [year, month] = p.split('-')
  return `${MONTHS_SHORT[parseInt(month) - 1]}/${year.slice(2)}`
}

// ─── Medida Pin Modal ─────────────────────────────────────────────────────────

interface MedidaPinModalProps {
  departamento: string
  onClose: () => void
  onRefresh: () => void
}

// Separate sub-component so each medida row manages its own unidade state independently
function MedidaRow({
  m, active, onToggle,
}: {
  m: MedidaInfo
  active: boolean
  onToggle: () => void
}) {
  const [unidade, setUnidade] = useState(m.unidade ?? '')
  const [saved,   setSaved]   = useState(false)

  // sync if parent reloads
  useEffect(() => { setUnidade(m.unidade ?? '') }, [m.unidade])

  const persistUnidade = async (val: string) => {
    await fetch('/api/medidas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id, unidade: val }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <div className={cn(
      'rounded-xl border transition-colors flex items-center gap-0',
      active ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100',
    )}>
      {/* Left: toggle area */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 flex-1 min-w-0 p-3 text-left hover:bg-black/5 rounded-l-xl transition-colors"
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.cor }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{m.nome}</p>
          {m.descricao && <p className="text-xs text-gray-400 truncate">{m.descricao}</p>}
        </div>
      </button>

      {/* Middle: unidade input — completely isolated from toggle */}
      <div className="flex-shrink-0 px-2">
        <input
          type="text"
          value={unidade}
          onChange={e => setUnidade(e.target.value)}
          onBlur={e => persistUnidade(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.currentTarget.blur() }
            if (e.key === 'Escape') { setUnidade(m.unidade ?? ''); e.currentTarget.blur() }
          }}
          placeholder="R$, %…"
          className={cn(
            'w-14 text-center text-xs border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors',
            saved ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'
          )}
        />
      </div>

      {/* Right: checkbox toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="flex-shrink-0 p-3 rounded-r-xl hover:bg-black/5 transition-colors"
      >
        {active
          ? <CheckSquare size={16} className="text-indigo-600" />
          : <Square size={16} className="text-gray-300" />}
      </button>
    </div>
  )
}

function MedidaPinModal({ departamento, onClose, onRefresh }: MedidaPinModalProps) {
  const [medidas,    setMedidas]    = useState<MedidaInfo[]>([])
  const [pinned,     setPinned]     = useState<Set<number>>(new Set())
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const reload = () =>
    fetch(`/api/dept-medidas?departamento=${encodeURIComponent(departamento)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(({ pinned: pinnedArr, medidas: all }: { pinned: { medida_id: number }[]; medidas: MedidaInfo[] }) => {
        setMedidas(all)
        setPinned(new Set(pinnedArr.map((p: { medida_id: number }) => p.medida_id)))
      })

  useEffect(() => { reload() }, [departamento]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (medidaId: number) => {
    if (togglingId !== null) return
    setTogglingId(medidaId)
    const isPinned = pinned.has(medidaId)
    setPinned(prev => {
      const next = new Set(prev)
      isPinned ? next.delete(medidaId) : next.add(medidaId)
      return next
    })
    try {
      await fetch('/api/dept-medidas', {
        method: isPinned ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departamento, medidaId }),
      })
      onRefresh()
    } catch {
      setPinned(prev => {
        const next = new Set(prev)
        isPinned ? next.add(medidaId) : next.delete(medidaId)
        return next
      })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Medidas Calculadas</h2>
            <p className="text-xs text-gray-400 mt-0.5">Clique na linha para selecionar · edite a unidade no campo</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {medidas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma medida cadastrada. Crie medidas em Análise → Medidas.
            </p>
          ) : (
            <div className="space-y-2">
              {medidas.map(m => (
                <MedidaRow
                  key={m.id}
                  m={m}
                  active={pinned.has(m.id)}
                  onToggle={() => toggle(m.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end px-6 py-4 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Medida Display Card ───────────────────────────────────────────────────────

function MedidaDisplayCard({ card }: { card: MedidaCard }) {
  const sorted = Object.entries(card.byPeriodo)
    .sort(([a], [b]) => a.localeCompare(b))
  const sparkDataFixed = sorted.slice(-6).map(([periodo, vals]) => ({
    label: shortPeriodo(periodo),
    razao: vals.razao,
    budget: vals.budget,
  }))

  const latestPeriodo = sorted[sorted.length - 1]?.[0]

  // YTD computation
  let ytdRazao: number
  let ytdBudget: number
  if (card.isRatio) {
    const totNumRazao  = sorted.reduce((s, [, v]) => s + v.num_razao,  0)
    const totNumBudget = sorted.reduce((s, [, v]) => s + v.num_budget, 0)
    const totDenRazao  = sorted.reduce((s, [, v]) => s + v.den_razao,  0)
    const totDenBudget = sorted.reduce((s, [, v]) => s + v.den_budget, 0)
    ytdRazao  = totDenRazao  ? totNumRazao  / Math.abs(totDenRazao)  * 100 : 0
    ytdBudget = totDenBudget ? totNumBudget / Math.abs(totDenBudget) * 100 : 0
  } else {
    ytdRazao  = sorted.reduce((s, [, v]) => s + v.razao,  0)
    ytdBudget = sorted.reduce((s, [, v]) => s + v.budget, 0)
  }

  const unidade = card.medida.unidade ?? ''
  const isPercent = unidade === '%'
  const formatPctVal = (v: number) =>
    `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

  const formatVal = (v: number) => {
    if (unidade === 'R$') return formatCurrency(v)
    if (isPercent)        return formatPctVal(v)
    if (unidade)          return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade}`
    return formatCurrency(v)
  }

  // Variation: realizado - budget (pp for %, absolute otherwise)
  const delta = ytdRazao - ytdBudget
  const deltaPositiveIsGood = true // configurable if needed
  const deltaGood = deltaPositiveIsGood ? delta >= 0 : delta <= 0
  const formatDelta = (v: number) => {
    const sign = v >= 0 ? '+' : ''
    if (isPercent) return `${sign}${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`
    if (unidade === 'R$') return `${sign}${formatCurrency(v)}`
    if (unidade) return `${sign}${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade}`
    return `${sign}${formatCurrency(v)}`
  }

  return (
    <Card className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-1.5 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: card.medida.cor }} />
          <p className="text-sm font-semibold text-gray-800 truncate">{card.medida.nome}</p>
          {unidade && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{unidade}</span>}
        </div>

        {sorted.length > 0 ? (
          <div className="space-y-1">
            {/* Delta — main number */}
            {ytdBudget !== 0 ? (
              <p className={cn('text-2xl font-bold', deltaGood ? 'text-emerald-600' : 'text-red-500')}>
                {formatDelta(delta)}
              </p>
            ) : (
              <p className="text-2xl font-bold text-gray-900">{formatVal(ytdRazao)}</p>
            )}

            {/* Realizado and Budget — smaller row */}
            {ytdBudget !== 0 && (
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Real: <span className="font-semibold text-gray-700">{formatVal(ytdRazao)}</span></span>
                <span>Orç: <span className="font-semibold text-gray-700">{formatVal(ytdBudget)}</span></span>
              </div>
            )}

            {/* Period label */}
            <p className="text-xs text-gray-400">YTD até {latestPeriodo ? shortPeriodo(latestPeriodo) : '—'}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Sem dados</p>
        )}

        {sparkDataFixed.length > 1 && (
          <div className="mt-auto">
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={sparkDataFixed} margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [formatVal(Number(v)), name === 'razao' ? 'Realizado' : 'Budget']}
                  contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                />
                <Line type="monotone" dataKey="razao" stroke={card.medida.cor} strokeWidth={2}
                  dot={{ r: 3, fill: card.medida.cor, strokeWidth: 0 }} isAnimationActive={false}>
                  <LabelList dataKey="razao" position="top" style={{ fontSize: 9, fill: '#6b7280' }}
                    formatter={(v: unknown) => formatVal(Number(v))} />
                </Line>
                <Line type="monotone" dataKey="budget" stroke="#d1d5db" strokeWidth={1}
                  strokeDasharray="3 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── KPI Card with sparkline ──────────────────────────────────────────────────

interface KpiCardProps {
  kpi: KpiManual
  valores: KpiValor[]
  onEditValores?: () => void
}

function KpiCard({ kpi, valores, onEditValores }: KpiCardProps) {
  const sorted = [...valores].sort((a, b) => a.periodo.localeCompare(b.periodo))
  const latest = sorted[sorted.length - 1]
  const sparkData = sorted.slice(-6).map(d => ({ ...d, label: shortPeriodo(d.periodo) }))

  const formatValue = (v: number) => {
    if (kpi.unidade === 'R$') return formatCurrency(v)
    if (kpi.unidade === '%') return `${v.toFixed(1)}%`
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${kpi.unidade ? ` ${kpi.unidade}` : ''}`
  }

  const hasMeta = kpi.tem_budget === 1 && latest?.meta != null
  const metaDiff = hasMeta ? (latest!.valor - latest!.meta!) : null

  return (
    <Card className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: kpi.cor }} />
            <p className="text-sm font-semibold text-gray-800 truncate">{kpi.nome}</p>
          </div>
          {onEditValores && (
            <button
              onClick={onEditValores}
              className="text-xs text-gray-400 hover:text-indigo-600 flex items-center gap-0.5 flex-shrink-0 ml-1"
            >
              <Edit2 size={11} />
            </button>
          )}
        </div>

        {latest != null ? (
          <div>
            <p className="text-2xl font-bold text-gray-900">{formatValue(latest.valor)}</p>
            {hasMeta && metaDiff !== null && (
              <p className={cn('text-xs font-medium', metaDiff >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                Meta: {formatValue(latest.meta!)}
                {' '}
                <span>({metaDiff >= 0 ? '+' : ''}{formatValue(metaDiff)})</span>
              </p>
            )}
            <p className="text-xs text-gray-400">{formatPeriodo(latest.periodo)}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Sem dados</p>
        )}

        {sparkData.length > 1 && (
          <div className="mt-auto">
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={sparkData} margin={{ top: 20, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: unknown) => [formatValue(Number(v)), kpi.nome]}
                  contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke={kpi.cor}
                  strokeWidth={2}
                  dot={{ r: 3, fill: kpi.cor, strokeWidth: 0 }}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="valor"
                    position="top"
                    style={{ fontSize: 9, fill: '#6b7280' }}
                    formatter={(v: unknown) => formatValue(Number(v))}
                  />
                </Line>
                {kpi.tem_budget === 1 && (
                  <Line
                    type="monotone"
                    dataKey="meta"
                    stroke="#d1d5db"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
          <Icon size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeptDashboardPage() {
  const [departamentos,    setDepartamentos]    = useState<string[]>([])
  const [allPeriodos,      setAllPeriodos]      = useState<string[]>([])
  const [selDept,          setSelDept]          = useState<string>('')
  const [selPeriods,       setSelPeriods]       = useState<string[]>([])
  const [dashData,         setDashData]         = useState<DashboardData | null>(null)
  const [loading,          setLoading]          = useState(false)
  const [kpis,             setKpis]             = useState<KpiManual[]>([])
  const [kpiValores,       setKpiValores]       = useState<Record<number, KpiValor[]>>({})
  const [showMgmtModal,    setShowMgmtModal]    = useState(false)
  const [showMedidaModal,  setShowMedidaModal]  = useState(false)
  const [editValoresKpi,   setEditValoresKpi]   = useState<KpiManual | null>(null)
  const [detModal,         setDetModal]         = useState<DetModalState | null>(null)
  const [userRole,         setUserRole]         = useState<'master' | 'dept' | null>(null)
  const [forcedDept,       setForcedDept]       = useState<string | null>(null)
  const [dreView,          setDreView]          = useState<'resumida' | 'completa'>('resumida')
  const [dreFullData,      setDreFullData]      = useState<DRERow[]>([])
  const [dreHierarchy,     setDreHierarchy]     = useState<Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>>([])
  const [dreLinhas,        setDreLinhas]        = useState<DRELinha[]>([])
  const [dreExpanded,      setDreExpanded]      = useState<Set<string>>(new Set())
  const [dreFullLoading,   setDreFullLoading]   = useState(false)

  // Carrega usuário logado
  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(u => {
      if (!u) return
      setUserRole(u.role)
      if (u.role === 'dept' && u.department) {
        setForcedDept(u.department)
        setSelDept(u.department)
      }
    }).catch(() => {})
  }, [])

  const isMaster = userRole === 'master'

  // Load department and period lists
  useEffect(() => {
    Promise.all([
      fetch('/api/analise?type=distinct&col=nome_departamento', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/analise?type=distinct&col=data_lancamento',   { cache: 'no-store' }).then(r => r.json()),
    ]).then(([depts, dates]) => {
      setDepartamentos(Array.isArray(depts) ? depts : [])
      const unique = [...new Set(
        (Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean)
      )].sort() as string[]
      setAllPeriodos(unique)
    })
  }, [])

  // Load dashboard data when dept/periods change
  const loadDashboard = useCallback(async (dept: string, periods: string[]) => {
    if (!dept) { setDashData(null); return }
    setLoading(true)
    const params = new URLSearchParams({ departamento: dept })
    if (periods.length) params.set('periodos', periods.join(','))
    const res = await fetch(`/api/dept-dashboard?${params}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      setDashData(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadDashboard(selDept, selPeriods)
  }, [selDept, selPeriods, loadDashboard])

  const loadDreCompleta = useCallback(async (dept: string, periods: string[]) => {
    if (!dept) return
    setDreFullLoading(true)
    const p = new URLSearchParams({ departamentos: dept })
    if (periods.length) p.set('periodos', periods.join(','))
    const [hier, linhas, data] = await Promise.all([
      fetch('/api/dre?type=hierarchy').then(r => r.json()),
      fetch('/api/dre?type=linhas').then(r => r.json()),
      fetch(`/api/dre?${p}`).then(r => r.json()),
    ])
    setDreHierarchy(Array.isArray(hier) ? hier : [])
    setDreLinhas(Array.isArray(linhas) ? linhas : [])
    setDreFullData(Array.isArray(data) ? data : [])
    setDreFullLoading(false)
  }, [])

  useEffect(() => {
    if (dreView === 'completa' && selDept) loadDreCompleta(selDept, selPeriods)
  }, [dreView, selDept, selPeriods, loadDreCompleta])

  // Load KPIs for selected department
  const loadKpis = useCallback(async (dept: string) => {
    if (!dept) { setKpis([]); return }
    const params = new URLSearchParams({ departamento: dept })
    const res = await fetch(`/api/kpis?${params}`, { cache: 'no-store' })
    if (res.ok) setKpis(await res.json())
  }, [])

  useEffect(() => {
    loadKpis(selDept)
  }, [selDept, loadKpis])

  // Load KPI valores whenever kpis change
  useEffect(() => {
    if (!kpis.length) { setKpiValores({}); return }
    const fetches = kpis.map(k =>
      fetch(`/api/kpis/valores?kpiId=${k.id}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((vals: KpiValor[]) => [k.id, vals] as [number, KpiValor[]])
    )
    Promise.all(fetches).then(pairs => {
      const map: Record<number, KpiValor[]> = {}
      for (const [id, vals] of pairs) map[id] = vals
      setKpiValores(map)
    })
  }, [kpis])

  // ── Aggregates ────────────────────────────────────────────────────────────

  const byPeriodo   = dashData?.byPeriodo   ?? []
  const dreGrupos   = dashData?.dreGrupos   ?? []
  const medidaCards = dashData?.medidaCards ?? []

  // Aggregate across selected periods for summary cards
  const totals = byPeriodo.reduce(
    (a, r) => ({ budget: a.budget + r.budget, razao: a.razao + r.razao }),
    { budget: 0, razao: 0 }
  )
  const totalVariacao = totals.razao - totals.budget
  const totalVariacaoPct = totals.budget ? (totalVariacao / Math.abs(totals.budget)) * 100 : 0

  // Chart data: budget vs razão per period
  const chartData = byPeriodo
    .reduce<Record<string, { periodo: string; budget: number; razao: number }>>((acc, r) => {
      if (!acc[r.periodo]) acc[r.periodo] = { periodo: r.periodo, budget: 0, razao: 0 }
      acc[r.periodo].budget += r.budget
      acc[r.periodo].razao  += r.razao
      return acc
    }, {})
  const chartRows = Object.values(chartData)
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map(r => ({ ...r, label: formatPeriodo(r.periodo) }))

  // DRE with variacao
  const dreRows = dreGrupos.map(g => ({
    ...g,
    variacao:     g.razao - g.budget,
    variacao_pct: g.budget ? ((g.razao - g.budget) / Math.abs(g.budget)) * 100 : 0,
  }))

  return (
    <div className="flex gap-0 min-h-screen">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 border-r border-gray-100 flex flex-col bg-white">
        {/* Períodos — sempre visível no topo quando há departamento selecionado */}
        {selDept && (
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Períodos</p>
            {/* Seletor de Ano */}
            {(() => {
              const anos = [...new Set(allPeriodos.map(p => p.split('-')[0]))].sort()
              if (anos.length <= 1) return null
              return (
                <div className="mb-2">
                  <div className="flex flex-wrap gap-1">
                    {anos.map(ano => {
                      const anoP = allPeriodos.filter(p => p.startsWith(ano + '-'))
                      const allSel = anoP.length > 0 && anoP.every(p => selPeriods.includes(p))
                      return (
                        <button key={ano} onClick={() => {
                          if (allSel) setSelPeriods(prev => prev.filter(p => !p.startsWith(ano + '-')))
                          else setSelPeriods(prev => [...new Set([...prev, ...anoP])])
                        }}
                          className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                            allSel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300')}>
                          {ano}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            <div className="space-y-0.5 max-h-48 overflow-y-auto">
              {allPeriodos.map(p => (
                <label key={p} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={selPeriods.includes(p)}
                    onChange={e => setSelPeriods(prev =>
                      e.target.checked ? [...prev, p] : prev.filter(x => x !== p))}
                    className="w-3 h-3 accent-indigo-600"
                  />
                  <span className="text-xs text-gray-600">{formatPeriodo(p)}</span>
                </label>
              ))}
            </div>
            {selPeriods.length > 0 && (
              <button
                onClick={() => setSelPeriods([])}
                className="mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X size={9} />Limpar
              </button>
            )}
          </div>
        )}

        {/* Configurar KPIs: apenas para master */}
        {selDept && isMaster && (
          <div className="p-3 border-b border-gray-100">
            <Button variant="outline" size="sm" className="w-full text-xs"
              onClick={() => setShowMgmtModal(true)}>
              <Settings size={12} />Configurar KPIs
            </Button>
          </div>
        )}

        {/* Seletor de departamento: visível apenas para master */}
        {isMaster && (
          <>
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Departamento</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {departamentos.map(d => (
                <button
                  key={d}
                  onClick={() => { setSelDept(d); setSelPeriods([]) }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    selDept === d
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  {d || '—'}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Para dept users: exibe o nome do departamento fixo */}
        {!isMaster && forcedDept && (
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Departamento</p>
            <p className="text-sm font-semibold text-indigo-700 px-1">{forcedDept}</p>
          </div>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 space-y-6 min-w-0 bg-gray-50/50">
        {!selDept ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BarChart3 size={40} className="text-gray-300 mb-3" />
            <p className="text-lg font-semibold text-gray-400">Selecione um departamento</p>
            <p className="text-sm text-gray-300">Escolha um departamento na sidebar para visualizar o dashboard</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{selDept}</h1>
                <p className="text-gray-500 text-sm mt-0.5">
                  {selPeriods.length > 0
                    ? `${selPeriods.length} período(s) selecionado(s)`
                    : 'Todos os períodos'}
                </p>
              </div>
              {loading && (
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {/* Section 1 — Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <SummaryCard
                label="Total Budget"
                value={formatCurrency(totals.budget)}
                icon={Target}
                color="bg-indigo-500"
              />
              <SummaryCard
                label="Total Realizado"
                value={formatCurrency(totals.razao)}
                icon={BarChart3}
                color="bg-emerald-500"
              />
              <SummaryCard
                label="Variação"
                value={formatCurrency(totalVariacao)}
                sub={totalVariacao >= 0 ? 'Acima do budget' : 'Abaixo do budget'}
                icon={totalVariacao >= 0 ? TrendingUp : TrendingDown}
                color={totalVariacao >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
              />
              <SummaryCard
                label="% Variação"
                value={formatPct(totalVariacaoPct)}
                sub={`Budget: ${formatCurrency(totals.budget)}`}
                icon={TrendingUp}
                color={totalVariacaoPct >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
              />
            </div>

            {/* Section 2 — KPIs + Medidas Calculadas */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">KPIs</h2>
                {isMaster && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowMedidaModal(true)}>
                      <Settings size={12} />Medidas
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowMgmtModal(true)}>
                      <Plus size={13} />Novo KPI
                    </Button>
                  </div>
                )}
              </div>
              {kpis.length === 0 && medidaCards.length === 0 ? (
                <Card>
                  <CardContent className="py-10 flex flex-col items-center gap-2">
                    <Target size={28} className="text-gray-300" />
                    <p className="text-sm text-gray-400">Nenhum KPI ou medida configurado.</p>
                    {isMaster && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setShowMgmtModal(true)}>
                          <Plus size={12} />Adicionar KPI
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowMedidaModal(true)}>
                          <Settings size={12} />Adicionar Medida
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {medidaCards.map((card, i) => (
                    <MedidaDisplayCard key={`m-${i}`} card={card} />
                  ))}
                  {kpis.map(kpi => (
                    <KpiCard
                      key={kpi.id}
                      kpi={kpi}
                      valores={kpiValores[kpi.id] ?? []}
                      onEditValores={isMaster ? () => setEditValoresKpi(kpi) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Section 3 — DRE */}
            {dreRows.length > 0 && (
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700">DRE por Departamento</CardTitle>
                  <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                    {(['resumida', 'completa'] as const).map(v => (
                      <button key={v} onClick={() => setDreView(v)}
                        className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
                          dreView === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                        {v === 'resumida' ? 'Resumida' : 'Completa'}
                      </button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {dreView === 'resumida' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left px-5 py-3 font-medium text-gray-500">DRE Gerencial</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-indigo-600">Budget</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-500 cursor-pointer select-none hover:text-indigo-600">Realizado</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-500">Variação</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-500">%</th>
                          <th className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {dreRows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-indigo-50/40 transition-colors group">
                            <td className="px-5 py-3 font-medium text-gray-900 cursor-pointer"
                              onClick={() => setDetModal({ dre: row.dre, departamento: selDept, periodos: selPeriods, tipo: 'ambos' })}>
                              {row.dre}
                            </td>
                            <td className="px-5 py-3 text-right text-gray-600 cursor-pointer hover:text-indigo-700 hover:bg-indigo-50/60"
                              onClick={() => setDetModal({ dre: row.dre, departamento: selDept, periodos: selPeriods, tipo: 'budget' })}>
                              {formatCurrency(row.budget)}
                            </td>
                            <td className="px-5 py-3 text-right text-gray-600 cursor-pointer hover:text-emerald-700 hover:bg-emerald-50/60"
                              onClick={() => setDetModal({ dre: row.dre, departamento: selDept, periodos: selPeriods, tipo: 'razao' })}>
                              {formatCurrency(row.razao)}
                            </td>
                            <td className={cn('px-5 py-3 text-right font-semibold', colorForVariance(row.variacao))}>
                              {formatCurrency(row.variacao)}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(row.variacao))}>
                                {formatPct(row.variacao_pct)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-gray-300 group-hover:text-indigo-400 cursor-pointer"
                              onClick={() => setDetModal({ dre: row.dre, departamento: selDept, periodos: selPeriods, tipo: 'ambos' })}>
                              <ExternalLink size={13} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                          <td className="px-5 py-3">Total</td>
                          <td className="px-5 py-3 text-right">{formatCurrency(dreRows.reduce((s, r) => s + r.budget, 0))}</td>
                          <td className="px-5 py-3 text-right">{formatCurrency(dreRows.reduce((s, r) => s + r.razao, 0))}</td>
                          <td className={cn('px-5 py-3 text-right', colorForVariance(totalVariacao))}>
                            {formatCurrency(totalVariacao)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(totalVariacao))}>
                              {formatPct(totalVariacaoPct)}
                            </span>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  ) : (
                    /* DRE Completa */
                    <DreFull
                      rawData={dreFullData}
                      hierarchy={dreHierarchy}
                      dreLinhas={dreLinhas}
                      expanded={dreExpanded}
                      onToggle={name => setDreExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })}
                      loading={dreFullLoading}
                      onDetalhamento={(dre, agrupamento, tipo) =>
                        setDetModal({ dre, agrupamento, departamento: selDept, periodos: selPeriods, tipo })}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Section 4 — Budget vs Realizado por Período */}
            {chartRows.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700">Budget vs Realizado por Período</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartRows} margin={{ top: 0, right: 0, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="label"
                        angle={-30}
                        textAnchor="end"
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <YAxis
                        tickFormatter={v => formatCurrency(Number(v)).replace('R$\u00a0', '')}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend />
                      <Bar dataKey="budget" name="Budget"    fill="#818cf8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="razao"  name="Realizado" fill="#34d399" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {detModal && <DetalhamentoModal ctx={detModal} onClose={() => setDetModal(null)} />}

      {showMgmtModal && (
        <KpiManagementModal
          departamento={selDept}
          kpis={kpis}
          onClose={() => setShowMgmtModal(false)}
          onRefresh={() => loadKpis(selDept)}
        />
      )}

      {showMedidaModal && (
        <MedidaPinModal
          departamento={selDept}
          onClose={() => setShowMedidaModal(false)}
          onRefresh={() => loadDashboard(selDept, selPeriods)}
        />
      )}

      {editValoresKpi && (
        <KpiValoresModal
          kpi={editValoresKpi}
          periodos={selPeriods.length > 0 ? selPeriods : allPeriodos.slice(-12)}
          onClose={() => setEditValoresKpi(null)}
          onSaved={() => loadKpis(selDept)}
        />
      )}
    </div>
  )
}
