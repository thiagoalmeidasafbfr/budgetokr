'use client'
import React, { useState, useEffect, useRef } from 'react'
import { X, Download, ArrowUpDown, Columns3 } from 'lucide-react'
import { formatCurrency, formatPeriodo, cn } from '@/lib/utils'
import type { TreeNode } from '@/lib/dre-utils'

export interface ContextMenuState {
  x: number
  y: number
  node: TreeNode
  periodo?: string
  tipo: 'budget' | 'razao' | 'ambos'
  departamentos?: string[]
  periodos?: string[]
  centros?: string[]
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

export default function DetalhamentoModal({ ctx, onClose }: { ctx: ContextMenuState; onClose: () => void }) {
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

  const displayed = rows
    .filter(r => {
      if (!textFilter) return true
      const q = textFilter.toLowerCase()
      return DET_COLS.some(c => String(colValue(r, c.key)).toLowerCase().includes(q))
    })
    .sort((a, b) => {
      const va = colValue(a, sortCol)
      const vb = colValue(b, sortCol)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })

  const total = displayed.reduce((s, r) => s + r.debito_credito, 0)

  const toggleSort = (key: DetColKey) => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('asc') }
  }

  const visibleDefs = DET_COLS.filter(c => visibleCols.has(c.key))
  const activeFiltersCount = (ctx.departamentos?.length ?? 0) + (ctx.periodos?.length ?? 0) + (ctx.centros?.length ?? 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6 px-4 overflow-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[94vh] flex flex-col">
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
          </div>
        )}

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
