'use client'
import React, {
  useState, useEffect, useRef, useMemo, useCallback, useDeferredValue
} from 'react'
import { X, Download, ArrowUpDown, Columns3, Filter, ChevronDown, MessageSquare } from 'lucide-react'
import { formatCurrency, formatPeriodo, cn } from '@/lib/utils'
import type { TreeNode } from '@/lib/dre-utils'

export interface ContextMenuState {
  x: number; y: number
  node: TreeNode
  periodo?: string
  tipo: 'budget' | 'razao' | 'ambos'
  departamentos?: string[]
  periodos?: string[]
  centros?: string[]
}

interface DetalhamentoLinha {
  id: number; tipo: string; data_lancamento: string
  numero_conta_contabil: string; nome_conta_contabil: string
  centro_custo: string; nome_centro_custo: string
  agrupamento_arvore: string; dre: string
  nome_conta_contrapartida: string; debito_credito: number
  observacao: string; fonte: string; num_transacao: string
}

type DetColKey = 'data' | 'tipo' | 'num_transacao' | 'centro' | 'dre' | 'agrupamento' | 'conta' | 'valor' | 'contrapartida' | 'obs'
const DET_COLS: { key: DetColKey; label: string; align?: 'right' }[] = [
  { key: 'data',          label: 'Data Lançamento' },
  { key: 'tipo',          label: 'Tipo' },
  { key: 'num_transacao', label: 'Nº Transação' },
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
    case 'num_transacao': return r.num_transacao ?? ''
    case 'centro':        return `${r.centro_custo}${r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}`
    case 'dre':           return r.dre
    case 'agrupamento':   return r.agrupamento_arvore
    case 'conta':         return `${r.numero_conta_contabil} — ${r.nome_conta_contabil}`
    case 'valor':         return r.debito_credito
    case 'contrapartida': return r.nome_conta_contrapartida
    case 'obs':           return r.observacao ?? ''
  }
}

function exportDetalhamento(rows: DetalhamentoLinha[], title: string) {
  const header = ['Data', 'Tipo', 'Nº Transação', 'Centro de Custo', 'DRE', 'Agrupamento', 'Conta Contábil', 'Valor', 'Conta Contrapartida', 'Observação']
  const csvRows = rows.map(r => [
    r.data_lancamento, r.tipo, r.num_transacao ?? '',
    `${r.centro_custo}${r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}`,
    r.dre, r.agrupamento_arvore,
    `${r.numero_conta_contabil} — ${r.nome_conta_contabil}`,
    r.debito_credito, r.nome_conta_contrapartida, r.observacao,
  ])
  const csv = [header, ...csvRows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `dre-lancamentos-${Date.now()}.csv`; a.click()
}

// ── Generic multi-select filter dropdown ─────────────────────────────────────
interface MultiFilterProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}
function MultiFilter({ label, options, selected, onChange }: MultiFilterProps) {
  const [open, setOpen]   = useState(false)
  const [q, setQ]         = useState('')
  const ref               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(v => !v); setQ('') }}
        className={cn(
          'flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors',
          selected.length
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
            : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-400 hover:text-indigo-700'
        )}>
        {label}
        {selected.length > 0
          ? <span className="bg-indigo-600 text-white rounded-full px-1.5 text-[10px] font-bold">{selected.length}</span>
          : <ChevronDown size={10} className="text-gray-400" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-64">
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder={`Buscar ${label.toLowerCase()}…`}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 mb-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus />
          {selected.length > 0 && (
            <button onClick={() => onChange([])}
              className="w-full text-left text-xs text-indigo-600 hover:text-indigo-800 px-1 py-0.5 mb-1">
              Limpar ({selected.length})
            </button>
          )}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filtered.map(o => (
              <label key={o.value} className="flex items-center gap-2 cursor-pointer hover:bg-indigo-50 rounded px-1.5 py-1">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)}
                  className="w-3 h-3 accent-indigo-600 flex-shrink-0" />
                <span className="text-xs text-gray-700 leading-tight truncate">{o.label}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="text-xs text-gray-400 px-1 py-2 text-center">Sem resultados</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Virtual scroll constants ──────────────────────────────────────────────────
const ROW_H   = 28
const OVERSCAN = 8

// ── Main modal ────────────────────────────────────────────────────────────────
export default function DetalhamentoModal({ ctx, onClose, highlightLancamentoId, onCommentSaved }: {
  ctx: ContextMenuState
  onClose: () => void
  highlightLancamentoId?: number
  onCommentSaved?: () => void
}) {
  const [rows,          setRows]          = useState<DetalhamentoLinha[]>([])
  const [truncated,     setTruncated]     = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [textInput,     setTextInput]     = useState('')
  const [filterTipo,    setFilterTipo]    = useState<'all' | 'budget' | 'razao'>('all')
  const [filterPeriodo, setFilterPeriodo] = useState('')
  // Generic column multi-filters: key → selected values
  const [colFilters, setColFilters] = useState<Partial<Record<string, string[]>>>({})
  const [sortCol,       setSortCol]       = useState<DetColKey>('data')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc')
  const [visibleCols,   setVisibleCols]   = useState<Set<DetColKey>>(new Set(DET_COLS.map(c => c.key)))
  const [showCols,      setShowCols]      = useState(false)
  const [scrollTop,     setScrollTop]     = useState(0)
  const [containerH,    setContainerH]    = useState(600)

  const [commentingRow,  setCommentingRow]  = useState<DetalhamentoLinha | null>(null)
  const [commentText,    setCommentText]    = useState('')
  const [commentSaving,  setCommentSaving]  = useState(false)
  const [commentError,   setCommentError]   = useState<string | null>(null)

  const deferredText = useDeferredValue(textInput)

  const colsRef   = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setShowCols(false)
    }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setContainerH(el.clientHeight))
    obs.observe(el)
    setContainerH(el.clientHeight)
    return () => obs.disconnect()
  }, [loading])

  useEffect(() => {
    setRows([]); setLoading(true)
    const p = new URLSearchParams()
    if (ctx.node.dre)         p.set('dre',           ctx.node.dre)
    if (ctx.node.agrupamento) p.set('agrupamento',   ctx.node.agrupamento)
    if (ctx.node.conta)       p.set('conta',          ctx.node.conta)
    if (ctx.periodo)          p.set('periodo',        ctx.periodo)
    if (ctx.tipo !== 'ambos') p.set('tipo',           ctx.tipo)
    if (ctx.departamentos?.length) p.set('departamentos', ctx.departamentos.join(','))
    if (ctx.periodos?.length && !ctx.periodo) p.set('periodos', ctx.periodos.join(','))
    if (ctx.centros?.length)       p.set('centros',       ctx.centros.join(','))
    fetch(`/api/dre/detalhamento?${p}`)
      .then(r => r.json())
      .then(data => { setRows(data.rows ?? data); setTruncated(data.truncated ?? false); setLoading(false) })
  }, [ctx])

  // Pre-compute search strings (once per fetch)
  const rowSearchStrings = useMemo(() =>
    rows.map(r => DET_COLS.map(c => String(colValue(r, c.key))).join('\n').toLowerCase()),
    [rows]
  )

  // Distinct options for each filterable column
  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort()
    const ccMap = new Map<string, string>()
    const contaMap = new Map<string, string>()
    for (const r of rows) {
      ccMap.set(r.centro_custo, r.nome_centro_custo)
      contaMap.set(r.numero_conta_contabil, r.nome_conta_contabil)
    }
    return {
      centro:      [...ccMap.entries()].map(([v, n]) => ({ value: v, label: n ? `${v} — ${n}` : v })).sort((a, b) => a.label.localeCompare(b.label)),
      dre:         uniq(rows.map(r => r.dre)).map(v => ({ value: v, label: v })),
      agrupamento: uniq(rows.map(r => r.agrupamento_arvore)).map(v => ({ value: v, label: v })),
      conta:       [...contaMap.entries()].map(([v, n]) => ({ value: v, label: n ? `${v} — ${n}` : v })).sort((a, b) => a.label.localeCompare(b.label)),
      contrapartida: uniq(rows.map(r => r.nome_conta_contrapartida)).map(v => ({ value: v, label: v })),
    }
  }, [rows])

  const periodoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) { const p = r.data_lancamento?.substring(0, 7); if (p) s.add(p) }
    return [...s].sort()
  }, [rows])

  const setColFilter = useCallback((key: string, vals: string[]) =>
    setColFilters(prev => ({ ...prev, [key]: vals })), [])

  // Main filter + sort
  const displayed = useMemo(() => {
    const q = deferredText.toLowerCase()
    const centroSet = new Set(colFilters['centro'] ?? [])
    const dreSet    = new Set(colFilters['dre'] ?? [])
    const agrupSet  = new Set(colFilters['agrupamento'] ?? [])
    const contaSet  = new Set(colFilters['conta'] ?? [])
    const cpSet     = new Set(colFilters['contrapartida'] ?? [])

    const filtered = rows.filter((r, i) => {
      if (filterTipo !== 'all' && r.tipo !== filterTipo) return false
      if (filterPeriodo && r.data_lancamento?.substring(0, 7) !== filterPeriodo) return false
      if (centroSet.size > 0 && !centroSet.has(r.centro_custo)) return false
      if (dreSet.size > 0    && !dreSet.has(r.dre)) return false
      if (agrupSet.size > 0  && !agrupSet.has(r.agrupamento_arvore)) return false
      if (contaSet.size > 0  && !contaSet.has(r.numero_conta_contabil)) return false
      if (cpSet.size > 0     && !cpSet.has(r.nome_conta_contrapartida)) return false
      if (q && !rowSearchStrings[i].includes(q)) return false
      return true
    })

    return filtered.sort((a, b) => {
      const va = colValue(a, sortCol)
      const vb = colValue(b, sortCol)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, rowSearchStrings, filterTipo, filterPeriodo, colFilters, deferredText, sortCol, sortDir])

  const total = useMemo(() => displayed.reduce((s, r) => s + r.debito_credito, 0), [displayed])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setScrollTop(0)
  }, [filterTipo, filterPeriodo, colFilters, deferredText, sortCol, sortDir])

  // Auto-scroll to highlighted lancamento once data loads
  useEffect(() => {
    if (!highlightLancamentoId || loading || !scrollRef.current) return
    const idx = displayed.findIndex(r => r.id === highlightLancamentoId)
    if (idx === -1) return
    const pos = Math.max(0, idx * ROW_H - containerH / 2)
    setTimeout(() => scrollRef.current?.scrollTo({ top: pos, behavior: 'smooth' }), 150)
  // Run only once after initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop)
  }, [])

  const startIdx      = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const endIdx        = Math.min(displayed.length, Math.ceil((scrollTop + containerH) / ROW_H) + OVERSCAN)
  const visibleRows   = displayed.slice(startIdx, endIdx)
  const paddingTop    = startIdx * ROW_H
  const paddingBottom = Math.max(0, (displayed.length - endIdx) * ROW_H)

  const toggleSort = (key: DetColKey) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }

  const saveRowComment = async () => {
    if (!commentingRow || !commentText.trim()) return
    setCommentSaving(true)
    setCommentError(null)
    const periodo   = commentingRow.data_lancamento?.substring(0, 7) ?? null
    const dreLinhaVal = commentingRow.dre || ctx.node.dre || ctx.node.name || commentingRow.agrupamento_arvore || 'Sem classificação'
    try {
      const res = await fetch('/api/dre/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lancamento_id: commentingRow.id,
          dre_linha:    dreLinhaVal,
          agrupamento:  commentingRow.agrupamento_arvore || ctx.node.agrupamento,
          conta:        commentingRow.numero_conta_contabil,
          periodo,
          tipo_valor:   commentingRow.tipo === 'budget' ? 'budget' : 'realizado',
          texto:        commentText.trim(),
          filter_state: {
            depts:   ctx.departamentos ?? [],
            periods: ctx.periodos     ?? [],
            centros: ctx.centros      ?? [],
            openDetalhamento:      true,
            detNode: {
              dre:         commentingRow.dre,
              agrupamento: commentingRow.agrupamento_arvore,
              conta:       commentingRow.numero_conta_contabil,
            },
            highlightLancamentoId: commentingRow.id,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCommentError(json?.error ?? `Erro ${res.status}`)
        setCommentSaving(false)
        return
      }
      setCommentText('')
      setCommentingRow(null)
      onCommentSaved?.()
    } catch (e) {
      setCommentError(String(e))
    } finally {
      setCommentSaving(false)
    }
  }

  const activeFiltersCount = (ctx.departamentos?.length ?? 0) + (ctx.periodos?.length ?? 0) + (ctx.centros?.length ?? 0)
  const localFiltersActive = filterTipo !== 'all' || !!filterPeriodo || Object.values(colFilters).some(v => v?.length)
  const visibleDefs = DET_COLS.filter(c => visibleCols.has(c.key))

  const clearAll = () => { setFilterTipo('all'); setFilterPeriodo(''); setColFilters({}) }

  const title = [
    ctx.node.dre,
    ctx.node.agrupamento !== ctx.node.dre ? ctx.node.agrupamento : null,
    ctx.node.conta ? ctx.node.name : null,
    ctx.periodo ? `· ${formatPeriodo(ctx.periodo)}` : null,
    ctx.tipo !== 'ambos' ? `· ${ctx.tipo === 'budget' ? 'Budget' : 'Realizado'}` : null,
  ].filter(Boolean).join(' › ')

  // Shared cell style: one line, truncated, with full text on hover via title
  const cellCls = 'px-3 overflow-hidden whitespace-nowrap text-ellipsis'

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
              <button onClick={() => exportDetalhamento(displayed, title)}
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
          <div className="border-b bg-gray-50 px-5 py-2 space-y-2">
            {/* Search + cols + count */}
            <div className="flex items-center gap-2">
              <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
                placeholder="Buscar em todos os campos…"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
              <div className="relative" ref={colsRef}>
                <button onClick={() => setShowCols(v => !v)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-indigo-400 hover:text-indigo-700 text-gray-600 transition-colors">
                  <Columns3 size={13} /> Colunas
                </button>
                {showCols && (
                  <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[180px] space-y-1">
                    {DET_COLS.map(c => (
                      <label key={c.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={visibleCols.has(c.key)}
                          onChange={e => setVisibleCols(prev => {
                            const next = new Set(prev)
                            e.target.checked ? next.add(c.key) : next.delete(c.key)
                            return next
                          })} className="w-3 h-3 accent-indigo-600" />
                        <span className="text-xs text-gray-700">{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{displayed.length} de {rows.length} lançamentos</span>
              {truncated && <span className="text-xs text-amber-600 font-medium whitespace-nowrap">⚠ Limite de 50 000 atingido</span>}
            </div>

            {/* Column filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0"><Filter size={11} /> Filtrar:</span>

              {/* Tipo toggle */}
              <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-xs flex-shrink-0">
                {(['all', 'budget', 'razao'] as const).map(v => (
                  <button key={v} onClick={() => setFilterTipo(v)}
                    className={cn('px-2.5 py-1 transition-colors',
                      filterTipo === v ? 'bg-indigo-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50')}>
                    {v === 'all' ? 'Todos' : v === 'budget' ? 'Budget' : 'Real'}
                  </button>
                ))}
              </div>

              {/* Período */}
              {periodoOptions.length > 1 && (
                <select value={filterPeriodo} onChange={e => setFilterPeriodo(e.target.value)}
                  className={cn('text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors flex-shrink-0',
                    filterPeriodo ? 'border-indigo-500 text-indigo-700' : 'border-gray-200 text-gray-600')}>
                  <option value="">Todos os períodos</option>
                  {periodoOptions.map(p => <option key={p} value={p}>{formatPeriodo(p)}</option>)}
                </select>
              )}

              <MultiFilter label="Centro de Custo" options={filterOptions.centro}
                selected={colFilters['centro'] ?? []}
                onChange={v => setColFilter('centro', v)} />

              <MultiFilter label="DRE" options={filterOptions.dre}
                selected={colFilters['dre'] ?? []}
                onChange={v => setColFilter('dre', v)} />

              <MultiFilter label="Agrupamento" options={filterOptions.agrupamento}
                selected={colFilters['agrupamento'] ?? []}
                onChange={v => setColFilter('agrupamento', v)} />

              <MultiFilter label="Conta" options={filterOptions.conta}
                selected={colFilters['conta'] ?? []}
                onChange={v => setColFilter('conta', v)} />

              <MultiFilter label="Contrapartida" options={filterOptions.contrapartida}
                selected={colFilters['contrapartida'] ?? []}
                onChange={v => setColFilter('contrapartida', v)} />

              {localFiltersActive && (
                <button onClick={clearAll}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1.5 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0">
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
            <table className="w-full text-xs" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <thead className="sticky top-0 bg-gray-700 text-white z-10">
                <tr style={{ height: ROW_H }}>
                  <th style={{ width: 28, minWidth: 28 }} />
                  {visibleDefs.map(c => (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      className={cn('px-3 font-medium whitespace-nowrap cursor-pointer select-none hover:bg-gray-600 transition-colors overflow-hidden text-ellipsis',
                        c.align === 'right' ? 'text-right' : 'text-left')}>
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
                {paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={visibleDefs.length + 1} /></tr>}

                {visibleRows.map((r, li) => {
                  const ccLabel = `${r.centro_custo}${r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}`
                  const contaLabel = `${r.numero_conta_contabil} — ${r.nome_conta_contabil}`
                  const isHighlighted = highlightLancamentoId === r.id
                  return (
                    <tr key={r.id} style={{ height: ROW_H }}
                      className={cn('border-b border-gray-100',
                        isHighlighted ? 'bg-amber-50 ring-1 ring-inset ring-amber-300'
                        : (startIdx + li) % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                      )}>
                      <td style={{ width: 28, minWidth: 28 }} className="px-1 text-center">
                        <button
                          onClick={() => { setCommentingRow(r); setCommentText('') }}
                          title="Comentar neste lançamento"
                          className={cn('p-0.5 rounded transition-colors',
                            commentingRow?.id === r.id
                              ? 'text-indigo-600 bg-indigo-100'
                              : 'text-gray-300 hover:text-indigo-500 hover:bg-indigo-50'
                          )}>
                          <MessageSquare size={11} />
                        </button>
                      </td>
                      {visibleCols.has('data')          && <td className={cellCls} title={r.data_lancamento} style={{ fontVariantNumeric: 'tabular-nums' }}>{r.data_lancamento}</td>}
                      {visibleCols.has('tipo')          && <td className={cellCls}>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
                          r.tipo === 'budget' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')}>
                          {r.tipo === 'budget' ? 'Budget' : 'Real'}
                        </span>
                      </td>}
                      {visibleCols.has('centro')        && <td className={cellCls} title={ccLabel}>{ccLabel}</td>}
                      {visibleCols.has('dre')           && <td className={cellCls} title={r.dre}>{r.dre}</td>}
                      {visibleCols.has('agrupamento')   && <td className={cellCls} title={r.agrupamento_arvore}>{r.agrupamento_arvore}</td>}
                      {visibleCols.has('conta')         && <td className={cellCls} title={contaLabel}>{contaLabel}</td>}
                      {visibleCols.has('valor')         && <td className={cn(cellCls, 'text-right font-semibold', r.debito_credito < 0 ? 'text-red-600' : 'text-gray-800')}>
                        {formatCurrency(r.debito_credito)}
                      </td>}
                      {visibleCols.has('contrapartida') && <td className={cn(cellCls, 'text-gray-500')} title={r.nome_conta_contrapartida}>{r.nome_conta_contrapartida}</td>}
                      {visibleCols.has('obs')           && <td className={cn(cellCls, 'text-gray-500')} title={r.observacao ?? ''}>{r.observacao}</td>}
                    </tr>
                  )
                })}

                {paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td colSpan={visibleDefs.length + 1} /></tr>}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-800 text-white font-bold z-10">
                <tr style={{ height: ROW_H }}>
                  {/* +1 for the action column */}
                  <td colSpan={visibleDefs.filter(c => c.key !== 'valor').length + 1} className="px-3 text-right whitespace-nowrap">
                    Total ({displayed.length} lançamentos)
                  </td>
                  <td className={cn('px-3 text-right whitespace-nowrap', total < 0 ? 'text-red-300' : 'text-emerald-300')}>
                    {visibleCols.has('valor') ? formatCurrency(total) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── Painel de comentário de lançamento ─────────────────────────── */}
        {commentingRow && (
          <div className="border-t bg-indigo-50 px-5 py-3 flex-shrink-0">
            <p className="text-xs font-semibold text-indigo-700 mb-2">
              Comentar lançamento:&nbsp;
              <span className="font-normal">{commentingRow.numero_conta_contabil} — {commentingRow.nome_conta_contabil}</span>
              <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium">
                {commentingRow.data_lancamento?.substring(0, 7)}
              </span>
              <span className={cn('ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                commentingRow.tipo === 'budget' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700')}>
                {commentingRow.tipo === 'budget' ? 'Budget' : 'Realizado'}
              </span>
            </p>
            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveRowComment() }}
                placeholder="Seu comentário sobre este lançamento… (Ctrl+Enter para salvar)"
                rows={2}
                autoFocus
                className="flex-1 text-xs border border-indigo-200 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={saveRowComment}
                  disabled={!commentText.trim() || commentSaving}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {commentSaving ? '…' : 'Salvar'}
                </button>
                <button
                  onClick={() => { setCommentingRow(null); setCommentText(''); setCommentError(null) }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
              </div>
            </div>
            {commentError && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5">
                Erro ao salvar: {commentError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
