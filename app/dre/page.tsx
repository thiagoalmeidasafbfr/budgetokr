'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, ChevronDown, Filter, X, Download, RefreshCw, ExternalLink, ArrowUpDown, Columns3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Export helper ──────────────────────────────────────────────────────────────
function exportDetalhamento(rows: DetalhamentoLinha[], title: string) {
  const header = ['Data', 'Tipo', 'Centro de Custo', 'DRE', 'Agrupamento', 'Conta Contábil', 'Valor', 'Conta Contrapartida', 'Observação']
  const csvRows = rows.map(r => [
    r.data_lancamento,
    r.tipo,
    `${r.centro_custo}${r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}`,
    r.dre,
    r.agrupamento_arvore,
    `${r.numero_conta_contabil} — ${r.nome_conta_contabil}`,
    r.debito_credito,
    r.nome_conta_contrapartida,
    r.observacao,
  ])
  const csv = [header, ...csvRows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `dre-lancamentos-${Date.now()}.csv`; a.click()
}

// ── Context menu + Drill-down modal ──────────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  node: TreeNode
  periodo?: string        // se direito-clicou numa célula de período específico
  tipo: 'budget' | 'razao' | 'ambos'
  departamentos?: string[] // filtros ativos da DRE principal
  periodos?: string[]      // filtros ativos da DRE principal
  centros?: string[]       // subfiltro de centros de custo
}

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

// Column definitions for the detalhamento table
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

function colValue(r: DetalhamentoLinha, key: DetColKey): string | number {
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

function DetalhamentoModal({
  ctx,
  onClose,
}: {
  ctx: ContextMenuState
  onClose: () => void
}) {
  const [rows,       setRows]       = useState<DetalhamentoLinha[]>([])
  const [loading,    setLoading]    = useState(true)
  const [textFilter, setTextFilter] = useState('')
  const [sortCol,    setSortCol]    = useState<DetColKey>('data')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc')
  const [visibleCols, setVisibleCols] = useState<Set<DetColKey>>(new Set(DET_COLS.map(c => c.key)))
  const [showCols,   setShowCols]   = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showCols) return
    const handler = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setShowCols(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [showCols])

  useEffect(() => {
    const p = new URLSearchParams()
    if (ctx.node.dre)         p.set('dre',           ctx.node.dre)
    if (ctx.node.agrupamento) p.set('agrupamento',   ctx.node.agrupamento)
    if (ctx.periodo)          p.set('periodo',        ctx.periodo)
    if (ctx.tipo !== 'ambos') p.set('tipo',           ctx.tipo)
    // Pass active main-page filters
    if (ctx.departamentos?.length) p.set('departamentos', ctx.departamentos.join(','))
    if (ctx.periodos?.length && !ctx.periodo) p.set('periodos', ctx.periodos.join(','))
    if (ctx.centros?.length)       p.set('centros',       ctx.centros.join(','))
    fetch(`/api/dre/detalhamento?${p}`)
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false) })
  }, [ctx])

  const title = [
    ctx.node.dre,
    ctx.node.agrupamento !== ctx.node.dre ? ctx.node.agrupamento : null,
    ctx.periodo ? `· ${formatPeriodo(ctx.periodo)}` : null,
    ctx.tipo !== 'ambos' ? `· ${ctx.tipo === 'budget' ? 'Budget' : 'Realizado'}` : null,
  ].filter(Boolean).join(' › ')

  // Apply text filter then sort
  const displayed = rows
    .filter(r => {
      if (!textFilter) return true
      const q = textFilter.toLowerCase()
      return DET_COLS.some(c => String(colValue(r, c.key)).toLowerCase().includes(q))
    })
    .sort((a, b) => {
      const va = colValue(a, sortCol)
      const vb = colValue(b, sortCol)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const total = displayed.reduce((s, r) => s + r.debito_credito, 0)

  const toggleSort = (key: DetColKey) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }

  const visibleDefs = DET_COLS.filter(c => visibleCols.has(c.key))

  // Count active filters coming from the main page
  const activeFiltersCount = (ctx.departamentos?.length ?? 0) + (ctx.periodos?.length ?? 0) + (ctx.centros?.length ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6 px-4 overflow-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">DRE — Lançamentos</p>
            <h2 className="text-base font-bold text-gray-900 mt-0.5">{title}</h2>
            {activeFiltersCount > 0 && (
              <p className="text-xs text-indigo-600 mt-0.5">
                {[
                  ctx.departamentos?.length ? `${ctx.departamentos.length} dept.` : null,
                  ctx.periodos?.length && !ctx.periodo ? `${ctx.periodos.length} período(s)` : null,
                  ctx.centros?.length ? `${ctx.centros.length} CC(s)` : null,
                ].filter(Boolean).join(' · ')} filtrado(s) da DRE
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!loading && rows.length > 0 && (
              <button onClick={() => exportDetalhamento(rows, title)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 transition-colors font-medium">
                <Download size={13} /> Exportar CSV
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        {!loading && (
          <div className="flex items-center gap-2 px-5 py-2 border-b bg-gray-50">
            <input
              type="text"
              value={textFilter}
              onChange={e => setTextFilter(e.target.value)}
              placeholder="Buscar em todos os campos…"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            />
            {/* Column visibility */}
            <div className="relative" ref={colsRef}>
              <button
                onClick={() => setShowCols(v => !v)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-indigo-400 hover:text-indigo-700 text-gray-600 transition-colors">
                <Columns3 size={13} /> Colunas
              </button>
              {showCols && (
                <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[180px] space-y-1">
                  {DET_COLS.map(c => (
                    <label key={c.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox"
                        checked={visibleCols.has(c.key)}
                        onChange={e => setVisibleCols(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(c.key) : next.delete(c.key)
                          return next
                        })}
                        className="w-3 h-3 accent-indigo-600"
                      />
                      <span className="text-xs text-gray-700">{c.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {displayed.length} de {rows.length} lançamentos
            </span>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-700 text-white">
                <tr>
                  {visibleDefs.map(c => (
                    <th key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:bg-gray-600 transition-colors',
                        c.align === 'right' ? 'text-right' : 'text-left'
                      )}>
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
                    {visibleCols.has('tipo')          && <td className="px-3 py-1.5">
                      <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
                        r.tipo === 'budget' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')}>
                        {r.tipo === 'budget' ? 'Budget' : 'Real'}
                      </span>
                    </td>}
                    {visibleCols.has('centro')        && <td className="px-3 py-1.5 whitespace-nowrap">{r.centro_custo}{r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}</td>}
                    {visibleCols.has('dre')           && <td className="px-3 py-1.5 whitespace-nowrap">{r.dre}</td>}
                    {visibleCols.has('agrupamento')   && <td className="px-3 py-1.5 whitespace-nowrap">{r.agrupamento_arvore}</td>}
                    {visibleCols.has('conta')         && <td className="px-3 py-1.5 whitespace-nowrap">{r.numero_conta_contabil} — {r.nome_conta_contabil}</td>}
                    {visibleCols.has('valor')         && <td className={cn('px-3 py-1.5 text-right whitespace-nowrap font-semibold', r.debito_credito < 0 ? 'text-red-600' : 'text-gray-800')}>
                      {formatCurrency(r.debito_credito)}
                    </td>}
                    {visibleCols.has('contrapartida') && <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{r.nome_conta_contrapartida}</td>}
                    {visibleCols.has('obs')           && <td className="px-3 py-1.5 max-w-xs truncate text-gray-500">{r.observacao}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-800 text-white font-bold">
                <tr>
                  <td colSpan={visibleDefs.filter(c => c.key !== 'valor').length} className="px-3 py-2 text-right">
                    Total ({displayed.length} lançamentos)
                  </td>
                  <td className={cn('px-3 py-2 text-right', total < 0 ? 'text-red-300' : 'text-emerald-300')}>
                    {visibleCols.has('valor') ? formatCurrency(total) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

interface DRERow {
  dre: string
  agrupamento_arvore: string
  ordem_dre: number
  periodo: string
  budget: number
  razao: number
}

interface TreeNode {
  name: string
  isGroup: boolean
  isSubtotal?: boolean   // linha calculada (subtotal), não clicável para drill-down
  isSeparator?: boolean  // linha com borda superior extra
  isBold?: boolean       // negrito forçado (independente de isGroup)
  depth: number
  ordem: number
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
  children: TreeNode[]
  byPeriod: Record<string, { budget: number; razao: number }>
  // for drill-down
  dre?: string
  agrupamento?: string
}

interface DRELinha {
  id: number; ordem: number; nome: string; tipo: 'grupo' | 'subtotal'
  sinal: number; formula_grupos: string; formula_sinais: string
  negrito: number; separador: number
}

// ── Waterfall helpers ─────────────────────────────────────────────────────────

interface WaterfallEntry {
  name: string
  shortName: string
  offset: number
  bar: number
  isPositive: boolean
  isSubtotal: boolean
  rawValue: number
}

function buildWaterfallData(tree: TreeNode[], dreLinhas: DRELinha[], tipo: 'budget' | 'razao'): WaterfallEntry[] {
  const result: WaterfallEntry[] = []
  let running = 0
  for (const linha of dreLinhas) {
    const node = tree.find(n => n.name === linha.nome)
    if (!node) continue
    const value = tipo === 'budget' ? node.budget : node.razao
    if (linha.tipo === 'grupo') {
      const isPositive = value >= 0
      result.push({
        name: linha.nome,
        shortName: linha.nome.length > 18 ? linha.nome.substring(0, 16) + '…' : linha.nome,
        offset: isPositive ? running : running + value,
        bar: Math.abs(value),
        isPositive,
        isSubtotal: false,
        rawValue: value,
      })
      running += value
    } else {
      const isPositive = value >= 0
      result.push({
        name: linha.nome,
        shortName: linha.nome.length > 18 ? linha.nome.substring(0, 16) + '…' : linha.nome,
        offset: isPositive ? 0 : value,
        bar: Math.abs(value),
        isPositive,
        isSubtotal: true,
        rawValue: value,
      })
    }
  }
  return result
}

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WaterfallEntry }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800 mb-1">{d.name}</p>
      <p className={d.isPositive ? 'text-emerald-600' : 'text-red-500'}>{formatCurrency(d.rawValue)}</p>
    </div>
  )
}

function WaterfallChart({ tree, dreLinhas }: { tree: TreeNode[]; dreLinhas: DRELinha[] }) {
  const budgetData  = buildWaterfallData(tree, dreLinhas, 'budget')
  const razaoData   = buildWaterfallData(tree, dreLinhas, 'razao')

  const renderChart = (data: WaterfallEntry[], title: string, color: string) => (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">{title}</p>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 10, bottom: 80 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="shortName"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            angle={-40}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => {
              if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`
              if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
              return String(v)
            }}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            width={56}
          />
          <Tooltip content={<WaterfallTooltip />} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          {/* invisible offset to float the bars */}
          <Bar dataKey="offset" stackId="wf" fill="transparent" isAnimationActive={false} />
          {/* visible bar */}
          <Bar dataKey="bar" stackId="wf" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.isSubtotal
                    ? color
                    : entry.isPositive
                      ? '#22c55e'
                      : '#ef4444'
                }
                opacity={entry.isSubtotal ? 1 : 0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex gap-6">
          {renderChart(budgetData,  'Orçado (Budget)',   '#6366f1')}
          {renderChart(razaoData,   'Realizado',         '#0ea5e9')}
        </div>
        <div className="flex items-center gap-4 mt-3 justify-center flex-wrap">
          {[
            { color: '#22c55e', label: 'Positivo (receita / ganho)' },
            { color: '#ef4444', label: 'Negativo (custo / dedução)' },
            { color: '#6366f1', label: 'Subtotal Budget' },
            { color: '#0ea5e9', label: 'Subtotal Realizado' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: l.color }} />
              <span className="text-xs text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DREPage() {
  const [rawData,       setRawData]       = useState<DRERow[]>([])
  const [hierarchy,     setHierarchy]     = useState<Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>>([])
  const [dreLinhas,     setDreLinhas]     = useState<DRELinha[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [selDepts,      setSelDepts]      = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  const [selCentros,    setSelCentros]    = useState<string[]>([])
  const [centrosDisp,   setCentrosDisp]   = useState<Array<{ cc: string; nome: string }>>([])
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const [loading,       setLoading]       = useState(false)
  const [viewMode,      setViewMode]      = useState<'total' | 'periodo' | 'cascata'>('total')
  const [periodView,    setPeriodView]    = useState<'compact' | 'full'>('compact')
  const [ctxMenu,       setCtxMenu]       = useState<ContextMenuState | null>(null)
  const [detModal,      setDetModal]      = useState<ContextMenuState | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  // Fecha context menu ao clicar fora
  useEffect(() => {
    if (!ctxMenu) return
    const handler = () => setCtxMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [ctxMenu])

  // Carrega centros de custo disponíveis quando departamentos selecionados mudam
  useEffect(() => {
    if (!selDepts.length) { setCentrosDisp([]); setSelCentros([]); return }
    const p = new URLSearchParams({ type: 'centros', departamentos: selDepts.join(',') })
    fetch(`/api/dre?${p}`).then(r => r.json()).then(data => {
      setCentrosDisp(Array.isArray(data) ? data : [])
      // Remove centros que não pertencem mais ao departamento selecionado
      setSelCentros(prev => prev.filter(c => (data as Array<{cc:string}>).some(d => d.cc === c)))
    })
  }, [selDepts])

  const openCtxMenu = (e: React.MouseEvent, node: TreeNode, periodo?: string, tipo: 'budget' | 'razao' | 'ambos' = 'ambos') => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: e.clientX, y: e.clientY, node, periodo, tipo,
      departamentos: selDepts.length ? selDepts : undefined,
      periodos:      selPeriods.length ? selPeriods : undefined,
      centros:       selCentros.length ? selCentros : undefined,
    })
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/dre?type=hierarchy').then(r => r.json()),
      fetch('/api/dre?type=linhas').then(r => r.json()),
      fetch('/api/dre?type=distinct&col=nome_departamento').then(r => r.json()),
      fetch('/api/dre?type=distinct&col=data_lancamento').then(r => r.json()),
    ]).then(([hier, linhas, depts, dates]) => {
      setHierarchy(Array.isArray(hier) ? hier : [])
      setDreLinhas(Array.isArray(linhas) ? linhas : [])
      setDepartamentos(Array.isArray(depts) ? depts : [])
      const uniquePeriods = [...new Set(
        (Array.isArray(dates) ? dates : [])
          .map((d: string) => d?.substring(0, 7))
          .filter(Boolean)
      )].sort() as string[]
      setPeriodos(uniquePeriods)
    })
    loadData([], [], [])
  }, [])

  const loadData = useCallback(async (depts: string[], prds: string[], centros: string[]) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depts.length)   params.set('departamentos', depts.join(','))
    if (prds.length)    params.set('periodos', prds.join(','))
    if (centros.length) params.set('centros', centros.join(','))
    const res = await fetch(`/api/dre?${params}`)
    if (res.ok) setRawData(await res.json())
    setLoading(false)
  }, [])

  const applyFilters = () => loadData(selDepts, selPeriods, selCentros)

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const expandAll = () => {
    const groups = new Set(hierarchy.map(h => h.dre).filter(Boolean))
    setExpanded(groups)
  }
  const collapseAll = () => setExpanded(new Set())

  // Build tree from raw data
  // Se há estrutura dre_linhas cadastrada, usa ela para definir ordem, subtotais e sinais
  const tree = dreLinhas.length > 0
    ? buildTreeFromLinhas(rawData, hierarchy, dreLinhas)
    : buildTree(rawData, hierarchy)

  // Get all periods from data
  const dataPeriods = [...new Set(rawData.map(r => r.periodo).filter(Boolean))].sort()

  // Flatten tree for table rendering
  const flatRows = flattenTree(tree, expanded)

  // Totals — only real groups (não subtotais calculados que já somam os grupos)
  const totals = tree
    .filter(r => r.isGroup && !r.isSubtotal)
    .reduce((acc, r) => ({
      budget: acc.budget + r.budget,
      razao:  acc.razao  + r.razao,
    }), { budget: 0, razao: 0 })

  const exportCSV = () => {
    const header = viewMode === 'total'
      ? ['Linha DRE', 'Budget', 'Razão', 'Variação', '%']
      : ['Linha DRE', ...dataPeriods.flatMap(p => [`Budget ${formatPeriodo(p)}`, `Razão ${formatPeriodo(p)}`])]
    const rows = flatRows.map(r => {
      if (viewMode === 'total') {
        return [
          '  '.repeat(r.depth) + r.name,
          r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2),
        ]
      }
      return [
        '  '.repeat(r.depth) + r.name,
        ...dataPeriods.flatMap(p => [r.byPeriod[p]?.budget ?? 0, r.byPeriod[p]?.razao ?? 0]),
      ]
    })
    const csv = [header, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'dre.csv'; a.click()
  }

  return (
    <div className="space-y-4">
      {/* Context menu (botão direito) */}
      {ctxMenu && (
        <div ref={ctxRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={e => e.stopPropagation()}>
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
            onClick={() => { setDetModal(ctxMenu); setCtxMenu(null) }}>
            <ExternalLink size={13} /> Abrir detalhamento
          </button>
          {ctxMenu.tipo !== 'ambos' && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2"
              onClick={() => { setDetModal({ ...ctxMenu, tipo: 'ambos' }); setCtxMenu(null) }}>
              <ExternalLink size={13} /> Detalhamento (Budget + Real)
            </button>
          )}
        </div>
      )}

      {/* Modal de detalhamento */}
      {detModal && <DetalhamentoModal ctx={detModal} onClose={() => setDetModal(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DRE — Demonstrativo de Resultados</h1>
          <p className="text-gray-500 text-sm mt-0.5">P&L por linha contábil · Budget vs Razão · Clique direito para detalhamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download size={13} /> CSV</Button>
      </div>

      <div className="flex gap-4">
        {/* Sidebar filters */}
        <div className="w-52 flex-shrink-0 space-y-3">
          <Card>
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Filter size={11} /> Filtros
              </p>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Departamentos</p>
                <div className="space-y-0.5 max-h-36 overflow-y-auto">
                  {departamentos.map(d => (
                    <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selDepts.includes(d)}
                        onChange={e => setSelDepts(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600 truncate">{d || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Centro de Custo sub-filter — só aparece quando há departamentos selecionados */}
              {selDepts.length > 0 && centrosDisp.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-indigo-600 mb-1 flex items-center gap-1">
                    <ChevronRight size={10} /> Centros de Custo
                  </p>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto pl-2 border-l-2 border-indigo-100">
                    {centrosDisp.map(c => (
                      <label key={c.cc} className="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={selCentros.includes(c.cc)}
                          onChange={e => setSelCentros(prev => e.target.checked ? [...prev, c.cc] : prev.filter(x => x !== c.cc))}
                          className="w-3 h-3 accent-indigo-600" />
                        <span className="text-xs text-gray-600 truncate" title={c.nome}>{c.nome || c.cc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Períodos</p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {periodos.map(p => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selPeriods.includes(p)}
                        onChange={e => setSelPeriods(prev => e.target.checked ? [...prev, p] : prev.filter(x => x !== p))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600">{formatPeriodo(p)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={applyFilters} className="flex-1 text-xs h-7"><RefreshCw size={10} /> Filtrar</Button>
                {(selDepts.length > 0 || selPeriods.length > 0 || selCentros.length > 0) && (
                  <Button size="sm" variant="outline" onClick={() => {
                    setSelDepts([]); setSelPeriods([]); setSelCentros([])
                    loadData([], [], [])
                  }} className="h-7 px-2"><X size={10} /></Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visualização</p>
              <div className="flex flex-col gap-1">
                <button onClick={expandAll} className="text-xs text-indigo-600 hover:text-indigo-800 text-left px-1">Expandir todos</button>
                <button onClick={collapseAll} className="text-xs text-indigo-600 hover:text-indigo-800 text-left px-1">Recolher todos</button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* View toggle */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
              {([['total', 'Consolidado'], ['periodo', 'Por Período'], ['cascata', 'Cascata']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  {label}
                </button>
              ))}
            </div>

            {/* Active filter badges */}
            {(selDepts.length > 0 || selPeriods.length > 0 || selCentros.length > 0) && (
              <div className="flex flex-wrap gap-1 ml-2">
                {selDepts.map(d => <Badge key={d} variant="secondary" className="gap-1">{d}<button onClick={() => setSelDepts(p => p.filter(x => x !== d))}><X size={9} /></button></Badge>)}
                {selCentros.map(c => {
                  const nome = centrosDisp.find(x => x.cc === c)?.nome ?? c
                  return <Badge key={c} variant="secondary" className="gap-1 bg-indigo-50 text-indigo-700 border-indigo-200">{nome}<button onClick={() => setSelCentros(p => p.filter(x => x !== c))}><X size={9} /></button></Badge>
                })}
                {selPeriods.map(p => <Badge key={p} variant="outline" className="gap-1">{formatPeriodo(p)}<button onClick={() => setSelPeriods(prev => prev.filter(x => x !== p))}><X size={9} /></button></Badge>)}
              </div>
            )}
          </div>

          {loading && <div className="flex items-center justify-center h-40"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>}

          {!loading && viewMode === 'total' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Demonstrativo Gerencial</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Vlr. Orçado</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Vlr. Realizado</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Var. Orçado x Real</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">% Var.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row, i) => (
                      <tr key={i}
                        onContextMenu={e => openCtxMenu(e, row, undefined, 'ambos')}
                        className={cn(
                          'border-b transition-colors cursor-context-menu',
                          row.isGroup
                            ? 'bg-gray-50/80 hover:bg-gray-100/80'
                            : 'border-gray-50 hover:bg-gray-50',
                        )}>
                        <td className={cn('px-5 py-2.5', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-800' : 'text-gray-700')}
                          style={{ paddingLeft: `${20 + row.depth * 24}px` }}>
                          <div className="flex items-center gap-1.5">
                            {row.isGroup && !row.isSubtotal ? (
                              <button onClick={() => toggleExpand(row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                {expanded.has(row.name)
                                  ? <ChevronDown size={14} className="text-gray-400" />
                                  : <ChevronRight size={14} className="text-gray-400" />}
                              </button>
                            ) : (
                              <span className="w-5" />
                            )}
                            {row.name}
                          </div>
                        </td>
                        <td onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openCtxMenu(e, row, undefined, 'budget') }}
                          className={cn('px-5 py-2.5 text-right', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-800' : 'text-gray-600')}>
                          {formatCurrency(row.budget)}
                        </td>
                        <td onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openCtxMenu(e, row, undefined, 'razao') }}
                          className={cn('px-5 py-2.5 text-right', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-800' : 'text-gray-600')}>
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
            </Card>
          )}

          {!loading && viewMode === 'periodo' && (
            <Card>
              {/* Compact/Full toggle */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100">
                <p className="text-xs text-gray-400">{dataPeriods.length} período(s)</p>
                <div className="flex bg-gray-100 rounded-md p-0.5 gap-0.5">
                  {([['compact', 'Compacto'], ['full', 'Completo']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setPeriodView(v)}
                      className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors',
                        periodView === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                {periodView === 'compact' ? (
                  /* ── COMPACT: Linha | [Var% pill per period] | totais ── */
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[220px]">
                          Demonstrativo
                        </th>
                        {dataPeriods.map(p => (
                          <th key={p} className="text-center px-1.5 py-2 font-medium text-gray-400 text-xs border-l border-gray-100 min-w-[68px]">
                            {formatPeriodo(p).replace(' ', '\u00a0')}
                          </th>
                        ))}
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs border-l border-gray-200 bg-gray-50">Orçado</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">Realizado</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">Var.</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatRows.map((row, i) => {
                        const rowTotBudget = dataPeriods.reduce((s, p) => s + (row.byPeriod[p]?.budget ?? 0), 0)
                        const rowTotRazao  = dataPeriods.reduce((s, p) => s + (row.byPeriod[p]?.razao  ?? 0), 0)
                        const rowTotVar    = rowTotRazao - rowTotBudget
                        const rowTotPct    = rowTotBudget ? (rowTotVar / Math.abs(rowTotBudget)) * 100 : 0
                        return (
                          <tr key={i}
                            onContextMenu={e => openCtxMenu(e, row, undefined, 'ambos')}
                            className={cn(
                              'border-b transition-colors cursor-context-menu',
                              row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50',
                            )}>
                            <td className={cn('px-4 py-2 sticky left-0 bg-white z-10',
                              row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80'
                                : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80'
                                : 'text-gray-700')}
                              style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                              <div className="flex items-center gap-1">
                                {row.isGroup && !row.isSubtotal ? (
                                  <button onClick={() => toggleExpand(row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                    {expanded.has(row.name)
                                      ? <ChevronDown size={13} className="text-gray-400" />
                                      : <ChevronRight size={13} className="text-gray-400" />}
                                  </button>
                                ) : <span className="w-4" />}
                                <span className="truncate">{row.name}</span>
                              </div>
                            </td>
                            {dataPeriods.map(p => {
                              const cell = row.byPeriod[p] ?? { budget: 0, razao: 0 }
                              const v    = cell.razao - cell.budget
                              const pct  = cell.budget ? (v / Math.abs(cell.budget)) * 100 : 0
                              const hasData = cell.budget !== 0 || cell.razao !== 0
                              return (
                                <td key={p}
                                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openCtxMenu(e, row, p, 'ambos') }}
                                  className="px-1 py-2 text-center border-l border-gray-100 group/cell">
                                  {hasData ? (
                                    <span title={`Orç: ${formatCurrency(cell.budget)}\nReal: ${formatCurrency(cell.razao)}\nVar: ${formatCurrency(v)}`}
                                      className={cn(
                                        'inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[52px] text-center',
                                        bgColorForVariance(v),
                                        colorForVariance(v),
                                      )}>
                                      {formatPct(pct)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-200 text-xs">—</span>
                                  )}
                                </td>
                              )
                            })}
                            {/* Totais consolidados */}
                            <td className={cn('px-3 py-2 text-right text-xs border-l border-gray-200',
                              row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                              {formatCurrency(rowTotBudget)}
                            </td>
                            <td className={cn('px-3 py-2 text-right text-xs',
                              row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                              {formatCurrency(rowTotRazao)}
                            </td>
                            <td className={cn('px-3 py-2 text-right text-xs font-semibold', colorForVariance(rowTotVar))}>
                              {formatCurrency(rowTotVar)}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">
                              <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', bgColorForVariance(rowTotVar))}>
                                {formatPct(rowTotPct)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  /* ── FULL: 3 colunas por período (comportamento original) ── */
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[240px]">
                          Demonstrativo Gerencial
                        </th>
                        {dataPeriods.map(p => (
                          <th key={p} colSpan={3} className="text-center px-1 py-2 font-medium text-gray-600 border-l-2 border-gray-300 bg-gray-50">
                            {formatPeriodo(p)}
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b bg-gray-50/50">
                        <th className="sticky left-0 bg-gray-50/50 z-10" />
                        {dataPeriods.map(p => (
                          <React.Fragment key={p}>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-gray-300">Orçado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Var.</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {flatRows.map((row, i) => (
                        <tr key={i}
                          onContextMenu={e => openCtxMenu(e, row, undefined, 'ambos')}
                          className={cn(
                            'border-b transition-colors cursor-context-menu',
                            row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50',
                          )}>
                          <td className={cn('px-4 py-2 sticky left-0 bg-white z-10',
                            row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80'
                              : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80'
                              : 'text-gray-700')}
                            style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                            <div className="flex items-center gap-1">
                              {row.isGroup && !row.isSubtotal ? (
                                <button onClick={() => toggleExpand(row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                  {expanded.has(row.name)
                                    ? <ChevronDown size={13} className="text-gray-400" />
                                    : <ChevronRight size={13} className="text-gray-400" />}
                                </button>
                              ) : <span className="w-4" />}
                              <span className="truncate">{row.name}</span>
                            </div>
                          </td>
                          {dataPeriods.map(p => {
                            const cell = row.byPeriod[p] ?? { budget: 0, razao: 0 }
                            const v = cell.razao - cell.budget
                            return (
                              <React.Fragment key={p}>
                                <td onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openCtxMenu(e, row, p, 'budget') }}
                                  className={cn('px-2 py-2 text-right text-xs border-l-2 border-gray-300', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                  {formatCurrency(cell.budget)}
                                </td>
                                <td onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openCtxMenu(e, row, p, 'razao') }}
                                  className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                  {formatCurrency(cell.razao)}
                                </td>
                                <td className={cn('px-2 py-2 text-right text-xs font-semibold border-l border-gray-200', colorForVariance(v))}>
                                  {formatCurrency(v)}
                                </td>
                              </React.Fragment>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          )}

          {!loading && viewMode === 'cascata' && dreLinhas.length > 0 && (
            <WaterfallChart tree={tree} dreLinhas={dreLinhas} />
          )}

          {!loading && viewMode === 'cascata' && dreLinhas.length === 0 && (
            <Card>
              <CardContent className="p-10 text-center text-gray-400 text-sm">
                Importe a estrutura da DRE (CSV) para visualizar o gráfico de cascata.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tree building com estrutura dre_linhas ─────────────────────────────────

function buildTreeFromLinhas(
  data: DRERow[],
  hierarchy: Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>,
  dreLinhas: DRELinha[]
): TreeNode[] {
  // 1. Agregar dados por (dre, agrupamento_arvore) igual ao buildTree normal
  const lineAgg = new Map<string, {
    budget: number; razao: number
    byPeriod: Record<string, { budget: number; razao: number }>
  }>()
  for (const row of data) {
    const key = `${row.dre}||${row.agrupamento_arvore}`
    if (!lineAgg.has(key)) lineAgg.set(key, { budget: 0, razao: 0, byPeriod: {} })
    const agg = lineAgg.get(key)!
    agg.budget += row.budget
    agg.razao  += row.razao
    if (row.periodo) {
      if (!agg.byPeriod[row.periodo]) agg.byPeriod[row.periodo] = { budget: 0, razao: 0 }
      agg.byPeriod[row.periodo].budget += row.budget
      agg.byPeriod[row.periodo].razao  += row.razao
    }
  }

  // 2. Agregar por dre (grupo pai)
  const dreAgg = new Map<string, {
    budget: number; razao: number
    byPeriod: Record<string, { budget: number; razao: number }>
    children: Array<{ agrupamento: string; budget: number; razao: number; byPeriod: Record<string, { budget: number; razao: number }> }>
  }>()
  for (const [key, agg] of lineAgg) {
    const [dre, agrup] = key.split('||')
    if (!dreAgg.has(dre)) dreAgg.set(dre, { budget: 0, razao: 0, byPeriod: {}, children: [] })
    const g = dreAgg.get(dre)!
    g.budget += agg.budget
    g.razao  += agg.razao
    for (const [p, v] of Object.entries(agg.byPeriod)) {
      if (!g.byPeriod[p]) g.byPeriod[p] = { budget: 0, razao: 0 }
      g.byPeriod[p].budget += v.budget
      g.byPeriod[p].razao  += v.razao
    }
    if (agrup) {
      g.children.push({ agrupamento: agrup, budget: agg.budget, razao: agg.razao, byPeriod: agg.byPeriod })
    }
  }

  // 3. Mapa de filhos por dre (para expand/collapse)
  const hierMap = new Map<string, Set<string>>()
  for (const h of hierarchy) {
    if (!h.dre) continue
    if (!hierMap.has(h.dre)) hierMap.set(h.dre, new Set())
    if (h.agrupamento_arvore) hierMap.get(h.dre)!.add(h.agrupamento_arvore)
  }

  // 4. Percorrer dre_linhas em ordem e construir a lista flat de nós
  const result: TreeNode[] = []
  for (const linha of dreLinhas) {
    if (linha.tipo === 'subtotal') {
      // Calcular subtotal somando todos os grupos com ordem < ordem deste subtotal
      let subBudget = 0, subRazao = 0
      const subByPeriod: Record<string, { budget: number; razao: number }> = {}

      for (const prevLinha of dreLinhas) {
        if (prevLinha.tipo !== 'grupo' || prevLinha.ordem >= linha.ordem) continue
        const agg = dreAgg.get(prevLinha.nome)
        if (!agg) continue
        const sinal = prevLinha.sinal ?? 1
        subBudget += agg.budget * sinal
        subRazao  += agg.razao  * sinal
        for (const [p, v] of Object.entries(agg.byPeriod)) {
          if (!subByPeriod[p]) subByPeriod[p] = { budget: 0, razao: 0 }
          subByPeriod[p].budget += v.budget * sinal
          subByPeriod[p].razao  += v.razao  * sinal
        }
      }

      // Aplicar sinal da linha (para apresentação)
      subBudget *= linha.sinal
      subRazao  *= linha.sinal
      for (const p of Object.keys(subByPeriod)) {
        subByPeriod[p].budget *= linha.sinal
        subByPeriod[p].razao  *= linha.sinal
      }

      const var_ = subRazao - subBudget
      result.push({
        name: linha.nome,
        isGroup: true,
        isSubtotal: true,
        isBold: true,
        isSeparator: linha.separador === 1,
        depth: 0,
        ordem: linha.ordem,
        budget: subBudget,
        razao: subRazao,
        variacao: var_,
        variacao_pct: subBudget ? (var_ / Math.abs(subBudget)) * 100 : 0,
        children: [],
        byPeriod: subByPeriod,
      })
    } else {
      // Linha de grupo normal
      const agg = dreAgg.get(linha.nome)
      const budget = (agg?.budget ?? 0) * linha.sinal
      const razao  = (agg?.razao  ?? 0) * linha.sinal
      const byPeriod: Record<string, { budget: number; razao: number }> = {}
      if (agg) {
        for (const [p, v] of Object.entries(agg.byPeriod)) {
          byPeriod[p] = { budget: v.budget * linha.sinal, razao: v.razao * linha.sinal }
        }
      }

      // Filhos (agrupamentos) a partir da hierarquia
      const childSet = hierMap.get(linha.nome) ?? new Set<string>()
      const children: TreeNode[] = []
      for (const child of childSet) {
        const cAgg = lineAgg.get(`${linha.nome}||${child}`)
        if (!cAgg) continue
        const cb = cAgg.budget * linha.sinal
        const cr = cAgg.razao  * linha.sinal
        const cByP: Record<string, { budget: number; razao: number }> = {}
        for (const [p, v] of Object.entries(cAgg.byPeriod)) {
          cByP[p] = { budget: v.budget * linha.sinal, razao: v.razao * linha.sinal }
        }
        const cv = cr - cb
        children.push({
          name: child, isGroup: false, depth: 1, ordem: 999,
          budget: cb, razao: cr, variacao: cv,
          variacao_pct: cb ? (cv / Math.abs(cb)) * 100 : 0,
          children: [], byPeriod: cByP, dre: linha.nome, agrupamento: child,
        })
      }

      const var_ = razao - budget
      result.push({
        name: linha.nome,
        isGroup: true,
        isBold: linha.negrito === 1,
        isSeparator: linha.separador === 1,
        depth: 0,
        ordem: linha.ordem,
        budget,
        razao,
        variacao: var_,
        variacao_pct: budget ? (var_ / Math.abs(budget)) * 100 : 0,
        children: children.sort((a, b) => a.name.localeCompare(b.name)),
        byPeriod,
        dre: linha.nome,
      })
    }
  }

  return result
}

// ── Tree building (fallback sem dre_linhas) ───────────────────────────────────

function buildTree(
  data: DRERow[],
  hierarchy: Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>
): TreeNode[] {
  // Hierarchy: dre = parent group, agrupamento_arvore = child
  // Map: dre → { ordem, children: Set<agrupamento_arvore> }
  const groupMap = new Map<string, { ordem: number; children: Set<string> }>()
  for (const h of hierarchy) {
    const parent = h.dre || ''
    if (!parent) continue
    if (!groupMap.has(parent)) groupMap.set(parent, { ordem: h.ordem_dre ?? 999, children: new Set() })
    else if ((h.ordem_dre ?? 999) < groupMap.get(parent)!.ordem) {
      groupMap.get(parent)!.ordem = h.ordem_dre ?? 999
    }
    if (h.agrupamento_arvore) groupMap.get(parent)!.children.add(h.agrupamento_arvore)
  }

  // Aggregate data by (dre + agrupamento_arvore)
  const lineAgg = new Map<string, {
    budget: number; razao: number; ordem_dre: number
    byPeriod: Record<string, { budget: number; razao: number }>
  }>()
  for (const row of data) {
    const key = `${row.dre}||${row.agrupamento_arvore}`
    if (!lineAgg.has(key)) lineAgg.set(key, { budget: 0, razao: 0, ordem_dre: row.ordem_dre ?? 999, byPeriod: {} })
    const agg = lineAgg.get(key)!
    agg.budget += row.budget
    agg.razao += row.razao
    if (row.periodo) {
      if (!agg.byPeriod[row.periodo]) agg.byPeriod[row.periodo] = { budget: 0, razao: 0 }
      agg.byPeriod[row.periodo].budget += row.budget
      agg.byPeriod[row.periodo].razao += row.razao
    }
  }

  const tree: TreeNode[] = []
  const usedKeys = new Set<string>()

  for (const [parent, { ordem: groupOrdem, children: childSet }] of groupMap) {
    const children: TreeNode[] = []
    let groupBudget = 0
    let groupRazao = 0
    const groupByPeriod: Record<string, { budget: number; razao: number }> = {}

    for (const child of childSet) {
      const key = `${parent}||${child}`
      usedKeys.add(key)
      const agg = lineAgg.get(key) ?? { budget: 0, razao: 0, ordem_dre: 999, byPeriod: {} }
      groupBudget += agg.budget
      groupRazao += agg.razao
      for (const [p, vals] of Object.entries(agg.byPeriod)) {
        if (!groupByPeriod[p]) groupByPeriod[p] = { budget: 0, razao: 0 }
        groupByPeriod[p].budget += vals.budget
        groupByPeriod[p].razao += vals.razao
      }
      const variacao = agg.razao - agg.budget
      children.push({
        name: child,
        isGroup: false,
        depth: 1,
        ordem: agg.ordem_dre,
        budget: agg.budget,
        razao: agg.razao,
        variacao,
        variacao_pct: agg.budget ? (variacao / Math.abs(agg.budget)) * 100 : 0,
        children: [],
        byPeriod: agg.byPeriod,
        dre: parent,
        agrupamento: child,
      })
    }

    // rows where agrupamento_arvore is empty
    const bareKey = `${parent}||`
    if (lineAgg.has(bareKey)) {
      usedKeys.add(bareKey)
      const agg = lineAgg.get(bareKey)!
      groupBudget += agg.budget
      groupRazao += agg.razao
      for (const [p, vals] of Object.entries(agg.byPeriod)) {
        if (!groupByPeriod[p]) groupByPeriod[p] = { budget: 0, razao: 0 }
        groupByPeriod[p].budget += vals.budget
        groupByPeriod[p].razao += vals.razao
      }
    }

    const variacao = groupRazao - groupBudget
    tree.push({
      name: parent,
      isGroup: true,
      depth: 0,
      ordem: groupOrdem,
      budget: groupBudget,
      razao: groupRazao,
      variacao,
      variacao_pct: groupBudget ? (variacao / Math.abs(groupBudget)) * 100 : 0,
      children: children.sort((a, b) => (a.ordem - b.ordem) || a.name.localeCompare(b.name)),
      byPeriod: groupByPeriod,
      dre: parent,
    })
  }

  // Unassigned lines
  for (const [key, agg] of lineAgg) {
    if (usedKeys.has(key)) continue
    const [dre, agrup] = key.split('||')
    const name = agrup || dre || 'Sem classificação'
    const variacao = agg.razao - agg.budget
    tree.push({
      name,
      isGroup: false,
      depth: 0,
      ordem: agg.ordem_dre,
      budget: agg.budget,
      razao: agg.razao,
      variacao,
      variacao_pct: agg.budget ? (variacao / Math.abs(agg.budget)) * 100 : 0,
      children: [],
      byPeriod: agg.byPeriod,
      dre,
      agrupamento: agrup,
    })
  }

  return tree.sort((a, b) => (a.ordem - b.ordem) || a.name.localeCompare(b.name))
}

function flattenTree(tree: TreeNode[], expanded: Set<string>): TreeNode[] {
  const result: TreeNode[] = []
  for (const node of tree) {
    result.push(node)
    if (node.isGroup && expanded.has(node.name)) {
      for (const child of node.children) {
        result.push(child)
      }
    }
  }
  return result
}


