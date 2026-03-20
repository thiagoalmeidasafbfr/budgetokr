'use client'
import React, {
  useState, useEffect, useRef, useMemo, useCallback, useDeferredValue
} from 'react'
import { X, Download, ArrowUpDown, Columns3, Filter } from 'lucide-react'
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
  observacao: string; fonte: string
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

function exportDetalhamento(rows: DetalhamentoLinha[], title: string) {
  const header = ['Data', 'Tipo', 'Centro de Custo', 'DRE', 'Agrupamento', 'Conta Contábil', 'Valor', 'Conta Contrapartida', 'Observação']
  const csvRows = rows.map(r => [
    r.data_lancamento, r.tipo,
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

const ROW_H  = 30   // px — altura fixa de cada linha da tabela
const OVERSCAN = 8  // linhas extras acima/abaixo da viewport

export default function DetalhamentoModal({ ctx, onClose }: { ctx: ContextMenuState; onClose: () => void }) {
  const [rows,          setRows]          = useState<DetalhamentoLinha[]>([])
  const [truncated,     setTruncated]     = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [textInput,     setTextInput]     = useState('')
  const [filterCentros, setFilterCentros] = useState<string[]>([])
  const [filterTipo,    setFilterTipo]    = useState<'all' | 'budget' | 'razao'>('all')
  const [filterPeriodo, setFilterPeriodo] = useState('')
  const [sortCol,       setSortCol]       = useState<DetColKey>('data')
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc')
  const [visibleCols,   setVisibleCols]   = useState<Set<DetColKey>>(new Set(DET_COLS.map(c => c.key)))
  const [showCols,      setShowCols]      = useState(false)
  const [showCCFilter,  setShowCCFilter]  = useState(false)
  const [ccSearch,      setCCSearch]      = useState('')
  const [scrollTop,     setScrollTop]     = useState(0)
  const [containerH,    setContainerH]    = useState(600)

  // Defers expensive filter until browser is idle — keeps input snappy
  const deferredText = useDeferredValue(textInput)

  const colsRef  = useRef<HTMLDivElement>(null)
  const ccRef    = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Click-outside handler for dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setShowCols(false)
      if (ccRef.current  && !ccRef.current.contains(e.target  as Node)) setShowCCFilter(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [])

  // Track container height for virtual scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const obs = new ResizeObserver(() => setContainerH(el.clientHeight))
    obs.observe(el)
    setContainerH(el.clientHeight)
    return () => obs.disconnect()
  }, [loading])

  // Fetch data
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

  // Pre-compute one lowercase search string per row (done once after fetch)
  const rowSearchStrings = useMemo(() =>
    rows.map(r => DET_COLS.map(c => String(colValue(r, c.key))).join('\n').toLowerCase()),
    [rows]
  )

  // Filter options derived from data
  const centroOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) map.set(r.centro_custo, r.nome_centro_custo)
    return [...map.entries()]
      .map(([cc, nome]) => ({ cc, label: nome ? `${cc} — ${nome}` : cc }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [rows])

  const periodoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) { const p = r.data_lancamento?.substring(0, 7); if (p) s.add(p) }
    return [...s].sort()
  }, [rows])

  // Main filter + sort — memoized, runs only when deps change
  const displayed = useMemo(() => {
    const centroSet = new Set(filterCentros)
    const q = deferredText.toLowerCase()
    const filtered = rows.filter((r, i) => {
      if (filterTipo !== 'all' && r.tipo !== filterTipo) return false
      if (filterPeriodo && r.data_lancamento?.substring(0, 7) !== filterPeriodo) return false
      if (centroSet.size > 0 && !centroSet.has(r.centro_custo)) return false
      if (q && !rowSearchStrings[i].includes(q)) return false
      return true
    })
    return filtered.sort((a, b) => {
      const va = colValue(a, sortCol)
      const vb = colValue(b, sortCol)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, rowSearchStrings, filterTipo, filterPeriodo, filterCentros, deferredText, sortCol, sortDir])

  const total = useMemo(() => displayed.reduce((s, r) => s + r.debito_credito, 0), [displayed])

  // Reset scroll when filters change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setScrollTop(0)
  }, [filterTipo, filterPeriodo, filterCentros, deferredText, sortCol, sortDir])

  // Virtual scroll handler
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop)
  }, [])

  // Virtual window calculation
  const startIdx     = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const endIdx       = Math.min(displayed.length, Math.ceil((scrollTop + containerH) / ROW_H) + OVERSCAN)
  const visibleRows  = displayed.slice(startIdx, endIdx)
  const paddingTop   = startIdx * ROW_H
  const paddingBottom = Math.max(0, (displayed.length - endIdx) * ROW_H)

  const toggleSort = (key: DetColKey) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }
  const toggleCentro = (cc: string) =>
    setFilterCentros(prev => prev.includes(cc) ? prev.filter(x => x !== cc) : [...prev, cc])

  const activeFiltersCount = (ctx.departamentos?.length ?? 0) + (ctx.periodos?.length ?? 0) + (ctx.centros?.length ?? 0)
  const localFiltersActive = filterCentros.length > 0 || filterTipo !== 'all' || !!filterPeriodo
  const visibleDefs = DET_COLS.filter(c => visibleCols.has(c.key))
  const filteredCCOptions = ccSearch
    ? centroOptions.filter(o => o.label.toLowerCase().includes(ccSearch.toLowerCase()))
    : centroOptions

  const title = [
    ctx.node.dre,
    ctx.node.agrupamento !== ctx.node.dre ? ctx.node.agrupamento : null,
    ctx.node.conta ? ctx.node.name : null,
    ctx.periodo ? `· ${formatPeriodo(ctx.periodo)}` : null,
    ctx.tipo !== 'ambos' ? `· ${ctx.tipo === 'budget' ? 'Budget' : 'Realizado'}` : null,
  ].filter(Boolean).join(' › ')

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
            {/* Row 1: search + cols + count */}
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
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[180px] space-y-1">
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
              {truncated && (
                <span className="text-xs text-amber-600 font-medium whitespace-nowrap">⚠ Limite de 50 000 atingido</span>
              )}
            </div>

            {/* Row 2: column filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 flex items-center gap-1"><Filter size={11} /> Filtrar:</span>

              {/* Centro de Custo multi-select */}
              <div className="relative" ref={ccRef}>
                <button onClick={() => setShowCCFilter(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                    filterCentros.length > 0
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-400 hover:text-indigo-700'
                  )}>
                  Centro de Custo
                  {filterCentros.length > 0 && (
                    <span className="bg-indigo-600 text-white rounded-full px-1.5 text-[10px] font-bold">{filterCentros.length}</span>
                  )}
                </button>
                {showCCFilter && (
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-xl p-2 w-72">
                    <input type="text" value={ccSearch} onChange={e => setCCSearch(e.target.value)}
                      placeholder="Buscar centro…"
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      autoFocus />
                    {filterCentros.length > 0 && (
                      <button onClick={() => setFilterCentros([])}
                        className="w-full text-left text-xs text-indigo-600 hover:text-indigo-800 px-1 py-0.5 mb-1">
                        Limpar seleção ({filterCentros.length})
                      </button>
                    )}
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                      {filteredCCOptions.map(o => (
                        <label key={o.cc} className="flex items-center gap-2 cursor-pointer hover:bg-indigo-50 rounded px-1.5 py-1">
                          <input type="checkbox" checked={filterCentros.includes(o.cc)}
                            onChange={() => toggleCentro(o.cc)}
                            className="w-3 h-3 accent-indigo-600 flex-shrink-0" />
                          <span className="text-xs text-gray-700 leading-tight">{o.label}</span>
                        </label>
                      ))}
                      {filteredCCOptions.length === 0 && (
                        <p className="text-xs text-gray-400 px-1 py-2 text-center">Nenhum resultado</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tipo toggle */}
              <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-xs">
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
                  className={cn('text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors',
                    filterPeriodo ? 'border-indigo-500 text-indigo-700' : 'border-gray-200 text-gray-600')}>
                  <option value="">Todos os períodos</option>
                  {periodoOptions.map(p => <option key={p} value={p}>{formatPeriodo(p)}</option>)}
                </select>
              )}

              {localFiltersActive && (
                <button onClick={() => { setFilterCentros([]); setFilterTipo('all'); setFilterPeriodo('') }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1.5 py-1 rounded hover:bg-red-50 transition-colors">
                  <X size={11} /> Limpar filtros
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
          /* Virtual-scrolled table */
          <div ref={scrollRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
            <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
              <thead className="sticky top-0 bg-gray-700 text-white z-10">
                <tr>
                  {visibleDefs.map(c => (
                    <th key={c.key} onClick={() => toggleSort(c.key)}
                      className={cn('px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:bg-gray-600 transition-colors',
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
                {/* Top spacer */}
                {paddingTop > 0 && (
                  <tr style={{ height: paddingTop }}>
                    <td colSpan={visibleDefs.length} />
                  </tr>
                )}

                {visibleRows.map((r, localIdx) => {
                  const i = startIdx + localIdx
                  return (
                    <tr key={r.id} style={{ height: ROW_H }}
                      className={cn('border-b border-gray-100', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60')}>
                      {visibleCols.has('data')          && <td className="px-3 py-1.5 whitespace-nowrap font-mono overflow-hidden text-ellipsis">{r.data_lancamento}</td>}
                      {visibleCols.has('tipo')          && <td className="px-3 py-1.5">
                        <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
                          r.tipo === 'budget' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')}>
                          {r.tipo === 'budget' ? 'Budget' : 'Real'}
                        </span>
                      </td>}
                      {visibleCols.has('centro')        && <td className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{r.centro_custo}{r.nome_centro_custo ? ` — ${r.nome_centro_custo}` : ''}</td>}
                      {visibleCols.has('dre')           && <td className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{r.dre}</td>}
                      {visibleCols.has('agrupamento')   && <td className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{r.agrupamento_arvore}</td>}
                      {visibleCols.has('conta')         && <td className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">{r.numero_conta_contabil} — {r.nome_conta_contabil}</td>}
                      {visibleCols.has('valor')         && <td className={cn('px-3 py-1.5 text-right whitespace-nowrap font-semibold', r.debito_credito < 0 ? 'text-red-600' : 'text-gray-800')}>
                        {formatCurrency(r.debito_credito)}
                      </td>}
                      {visibleCols.has('contrapartida') && <td className="px-3 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis text-gray-500">{r.nome_conta_contrapartida}</td>}
                      {visibleCols.has('obs')           && <td className="px-3 py-1.5 overflow-hidden text-ellipsis text-gray-500 max-w-xs">{r.observacao}</td>}
                    </tr>
                  )
                })}

                {/* Bottom spacer */}
                {paddingBottom > 0 && (
                  <tr style={{ height: paddingBottom }}>
                    <td colSpan={visibleDefs.length} />
                  </tr>
                )}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-800 text-white font-bold z-10">
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
