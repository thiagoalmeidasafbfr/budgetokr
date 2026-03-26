'use client'
import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { ChevronRight, ChevronDown, RefreshCw, Download, X, Filter, Calendar } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import type { ContextMenuState } from '@/components/DreDetalhamentoModal'

const DetalhamentoModal = dynamic(() => import('@/components/DreDetalhamentoModal'), { ssr: false })

// ─── Types ───────────────────────────────────────────────────────────────────

interface PorUnidadeRow {
  unidade: string
  dre: string
  agrupamento: string
  conta: string
  nome_conta: string
  ordem_dre: number
  budget: number
  razao: number
}

type NodeLevel = 'unit' | 'dre' | 'agrupamento' | 'conta'

interface TreeNode {
  key: string
  label: string
  level: NodeLevel
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
  children: TreeNode[]
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(rows: PorUnidadeRow[]): TreeNode[] {
  type ContaBucket  = { budget: number; razao: number; nome: string }
  type AgrupBucket  = { budget: number; razao: number; contas: Map<string, ContaBucket> }
  type DREBucket    = { budget: number; razao: number; ordem_dre: number; agrupamentos: Map<string, AgrupBucket> }
  type UnitBucket   = { budget: number; razao: number; dres: Map<string, DREBucket> }

  const unitMap = new Map<string, UnitBucket>()

  for (const r of rows) {
    if (!unitMap.has(r.unidade)) unitMap.set(r.unidade, { budget: 0, razao: 0, dres: new Map() })
    const u = unitMap.get(r.unidade)!
    u.budget += r.budget
    u.razao  += r.razao

    if (!u.dres.has(r.dre)) u.dres.set(r.dre, { budget: 0, razao: 0, ordem_dre: r.ordem_dre, agrupamentos: new Map() })
    const d = u.dres.get(r.dre)!
    d.budget += r.budget
    d.razao  += r.razao
    if (r.ordem_dre < d.ordem_dre) d.ordem_dre = r.ordem_dre

    const agrupKey = r.agrupamento || '(sem agrupamento)'
    if (!d.agrupamentos.has(agrupKey)) d.agrupamentos.set(agrupKey, { budget: 0, razao: 0, contas: new Map() })
    const a = d.agrupamentos.get(agrupKey)!
    a.budget += r.budget
    a.razao  += r.razao

    if (!a.contas.has(r.conta)) a.contas.set(r.conta, { budget: 0, razao: 0, nome: r.nome_conta || r.conta })
    const c = a.contas.get(r.conta)!
    c.budget += r.budget
    c.razao  += r.razao
  }

  const makeNode = (label: string, level: NodeLevel, key: string, budget: number, razao: number, children: TreeNode[]): TreeNode => {
    const variacao     = razao - budget
    const variacao_pct = budget ? (variacao / Math.abs(budget)) * 100 : 0
    return { key, label, level, budget, razao, variacao, variacao_pct, children }
  }

  return [...unitMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([unitKey, u]) =>
      makeNode(unitKey, 'unit', `u:${unitKey}`, u.budget, u.razao,
        [...u.dres.entries()]
          .sort((a, b) => a[1].ordem_dre - b[1].ordem_dre || a[0].localeCompare(b[0]))
          .map(([dreKey, d]) =>
            makeNode(dreKey, 'dre', `u:${unitKey}|d:${dreKey}`, d.budget, d.razao,
              [...d.agrupamentos.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([agrupKey, a]) =>
                  makeNode(agrupKey, 'agrupamento', `u:${unitKey}|d:${dreKey}|a:${agrupKey}`, a.budget, a.razao,
                    [...a.contas.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([conta, c]) =>
                        makeNode(c.nome, 'conta', `u:${unitKey}|d:${dreKey}|a:${agrupKey}|c:${conta}`, c.budget, c.razao, [])
                      )
                  )
                )
            )
          )
      )
    )
}

// ─── Flatten visible rows ─────────────────────────────────────────────────────

function flattenVisible(
  nodes: TreeNode[],
  depth: number,
  expanded: Set<string>
): Array<TreeNode & { depth: number; isExpanded: boolean }> {
  const result: Array<TreeNode & { depth: number; isExpanded: boolean }> = []
  for (const node of nodes) {
    const isExpanded = expanded.has(node.key)
    result.push({ ...node, depth, isExpanded })
    if (isExpanded && node.children.length > 0) {
      result.push(...flattenVisible(node.children, depth + 1, expanded))
    }
  }
  return result
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PorUnidadePage() {
  const [allRows,     setAllRows]     = useState<PorUnidadeRow[]>([])
  const [tree,        setTree]        = useState<TreeNode[]>([])
  const [unidades,    setUnidades]    = useState<string[]>([])
  const [periodos,    setPeriodos]    = useState<string[]>([])
  const [selUnidades, setSelUnidades] = useState<string[]>([])
  const [selPeriods,  setSelPeriods]  = useState<string[]>([])
  const [selYear,     setSelYear]     = useState<string | null>('2026')
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [loading,     setLoading]     = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [detModal,    setDetModal]    = useState<ContextMenuState | null>(null)

  // ── Init: fetch distinct unidades + periods ──────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/por-unidade?type=distinct', { cache: 'no-store' })
        if (res.ok) {
          const d = await res.json()
          setUnidades(Array.isArray(d.unidades) ? d.unidades : [])
          setPeriodos(Array.isArray(d.periodos) ? d.periodos : [])
        }
      } finally {
        setInitialized(true)
      }
    }
    init()
  }, [])

  // ── Default periods: YTD for selected year ───────────────────────────────
  useEffect(() => {
    if (!initialized || periodos.length === 0) return
    if (selYear) {
      const now      = new Date()
      const prev     = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const curMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
      const ytd      = periodos.filter(p => p.startsWith(selYear) && p <= curMonth)
      setSelPeriods(ytd.length > 0 ? ytd : periodos.filter(p => p.startsWith(selYear)))
    } else {
      // "Todos" — select all periods
      setSelPeriods([...periodos])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selYear, initialized])

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (units: string[], prds: string[]) => {
    if (prds.length === 0) {
      setAllRows([])
      setTree([])
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('periodos', prds.join(','))
      if (units.length > 0) params.set('unidades', units.join(','))
      const res = await fetch(`/api/por-unidade?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        const data: PorUnidadeRow[] = json.rows ?? []
        setAllRows(data)
        setTree(buildTree(data))
        setExpanded(new Set()) // collapse all on new data
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initialized) return
    loadData(selUnidades, selPeriods)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selUnidades, selPeriods, initialized])

  // ── Toggle expand ─────────────────────────────────────────────────────────
  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // ── Open detalhamento modal for a row ─────────────────────────────────────
  const openDetalhamento = useCallback((row: TreeNode & { depth: number }) => {
    // Parse key: u:unit|d:dre|a:agrup|c:conta
    const parts: Record<string, string> = {}
    for (const part of row.key.split('|')) {
      const idx = part.indexOf(':')
      if (idx !== -1) parts[part.slice(0, idx)] = part.slice(idx + 1)
    }
    const dreVal   = parts['d'] ?? undefined
    const agrupVal = parts['a'] ?? undefined
    const contaVal = parts['c'] ?? undefined
    const unidVal  = parts['u'] ?? undefined

    setDetModal({
      x: 0, y: 0,
      tipo: 'ambos',
      periodos: selPeriods,
      unidades: unidVal ? [unidVal] : selUnidades.length > 0 ? selUnidades : undefined,
      node: {
        name:        row.label,
        isGroup:     row.level !== 'conta',
        isAccount:   row.level === 'conta',
        depth:       row.depth,
        ordem:       0,
        budget:      row.budget,
        razao:       row.razao,
        variacao:    row.variacao,
        variacao_pct: row.variacao_pct,
        children:    [],
        byPeriod:    {},
        dre:         dreVal,
        agrupamento: agrupVal,
        conta:       contaVal,
      },
    })
  }, [selPeriods, selUnidades])

  // ── Derived data ──────────────────────────────────────────────────────────
  const visibleRows = flattenVisible(tree, 0, expanded)

  const totals = tree.reduce(
    (a, n) => ({ budget: a.budget + n.budget, razao: a.razao + n.razao }),
    { budget: 0, razao: 0 }
  )
  const totalVariacao = totals.razao - totals.budget
  const totalPct      = totals.budget ? (totalVariacao / Math.abs(totals.budget)) * 100 : 0

  const years = [...new Set(periodos.map(p => p.substring(0, 4)).filter(Boolean))].sort()
  const visiblePeriods = selYear ? periodos.filter(p => p.startsWith(selYear)) : periodos

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const header = ['Unidade', 'DRE', 'Agrupamento', 'Conta', 'VLR Orçado', 'VLR Realizado', 'Variação', '%']
    const dataRows = allRows.map(r => {
      const variacao = r.razao - r.budget
      const pct      = r.budget ? (variacao / Math.abs(r.budget)) * 100 : 0
      return [r.unidade, r.dre, r.agrupamento, r.nome_conta || r.conta, r.budget, r.razao, variacao, pct.toFixed(2)]
    })
    const csv  = [header, ...dataRows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'por-unidade.csv'; a.click()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Por Unidade de Negócio</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Budget vs Realizado · Expansível por DRE → Agrupamento → Conta
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData(selUnidades, selPeriods)} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={allRows.length === 0}>
            <Download size={13} /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="w-52 flex-shrink-0">
          <Card>
            <CardContent className="p-3 space-y-4">

              {/* ANO */}
              {years.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-2">
                    <Calendar size={11} /> Ano
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {years.length > 1 && (
                      <button
                        onClick={() => setSelYear(null)}
                        className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors',
                          selYear === null ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                      >
                        Todos
                      </button>
                    )}
                    {years.map(y => (
                      <button key={y} onClick={() => setSelYear(y)}
                        className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors',
                          selYear === y ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* UNIDADES */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1.5">
                  <Filter size={11} /> Unidades
                </p>
                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  {unidades.map(u => (
                    <label key={u} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={selUnidades.includes(u)}
                        onChange={e =>
                          setSelUnidades(prev =>
                            e.target.checked ? [...prev, u] : prev.filter(x => x !== u)
                          )
                        }
                        className="w-3 h-3 accent-indigo-600"
                      />
                      <span className="text-xs text-gray-600 truncate" title={u}>{u || '—'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* PERÍODOS */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Períodos</p>
                  {selPeriods.length > 0 && (
                    <button
                      onClick={() => setSelPeriods([])}
                      className="text-xs text-red-400 hover:text-red-600 flex items-center gap-0.5"
                    >
                      <X size={9} /> Limpar
                    </button>
                  )}
                </div>
                <div className="space-y-0.5 max-h-44 overflow-y-auto">
                  {visiblePeriods.map(p => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={selPeriods.includes(p)}
                        onChange={e =>
                          setSelPeriods(prev =>
                            e.target.checked ? [...prev, p] : prev.filter(x => x !== p)
                          )
                        }
                        className="w-3 h-3 accent-indigo-600"
                      />
                      <span className="text-xs text-gray-600">{formatPeriodo(p)}</span>
                    </label>
                  ))}
                </div>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* ── Main table ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Card>
              {selPeriods.length === 0 && !loading ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                  Selecione ao menos um período para ver os dados.
                </div>
              ) : tree.length === 0 && !loading ? (
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                  Nenhum dado encontrado para os filtros selecionados.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">
                          UNIDADE / DRE / AGRUPAMENTO / CONTA
                        </th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">
                          VLR. ORÇADO
                        </th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">
                          VLR. REALIZADO
                        </th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap">
                          VARIAÇÃO
                        </th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs uppercase tracking-wide">
                          %
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(row => {
                        const isUnit  = row.level === 'unit'
                        const isConta = row.level === 'conta'
                        const indent  = 16 + row.depth * 20

                        return (
                          <tr
                            key={row.key}
                            className={cn(
                              'border-b border-gray-50 transition-colors cursor-pointer',
                              isUnit ? 'hover:bg-indigo-50 font-semibold' : 'hover:bg-indigo-50'
                            )}
                            onClick={() => openDetalhamento(row)}
                          >
                            <td className="py-2 pr-4" style={{ paddingLeft: `${indent}px` }}>
                              <div className="flex items-center gap-1.5">
                                {!isConta && row.children.length > 0 ? (
                                  <button
                                    onClick={() => toggle(row.key)}
                                    className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 flex-shrink-0"
                                  >
                                    {row.isExpanded
                                      ? <ChevronDown size={13} />
                                      : <ChevronRight size={13} />}
                                  </button>
                                ) : (
                                  <div className="w-4 flex-shrink-0" />
                                )}
                                <span className={cn(
                                  'truncate',
                                  isUnit               && 'font-semibold text-gray-900',
                                  row.level === 'dre'  && 'text-gray-800',
                                  row.level === 'agrupamento' && 'text-gray-600 text-xs',
                                  isConta              && 'text-gray-500 text-xs',
                                )}>
                                  {row.label}
                                </span>
                              </div>
                            </td>

                            <td className="px-4 py-2 text-right text-gray-600 tabular-nums whitespace-nowrap">
                              {formatCurrency(row.budget)}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600 tabular-nums whitespace-nowrap">
                              {formatCurrency(row.razao)}
                            </td>
                            <td className={cn(
                              'px-4 py-2 text-right font-medium tabular-nums whitespace-nowrap',
                              colorForVariance(row.variacao)
                            )}>
                              {formatCurrency(row.variacao)}
                            </td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <span className={cn(
                                'text-xs px-1.5 py-0.5 rounded-full',
                                bgColorForVariance(row.variacao)
                              )}>
                                {formatPct(row.variacao_pct)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-900 text-white font-bold">
                        <td className="px-4 py-3 text-sm">Total Geral</td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                          {formatCurrency(totals.budget)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                          {formatCurrency(totals.razao)}
                        </td>
                        <td className={cn(
                          'px-4 py-3 text-right tabular-nums whitespace-nowrap',
                          totalVariacao >= 0 ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {formatCurrency(totalVariacao)}
                        </td>
                        <td className={cn(
                          'px-4 py-3 text-right text-sm whitespace-nowrap',
                          totalVariacao >= 0 ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {formatPct(totalPct)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>

    {detModal && (
      <DetalhamentoModal
        ctx={detModal}
        onClose={() => setDetModal(null)}
        showUnidadeCol={true}
      />
    )}
    </>
  )
}
