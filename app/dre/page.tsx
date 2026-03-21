'use client'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ChevronRight, ChevronDown, Filter, X, Download, RefreshCw, ExternalLink, MessageSquare, TrendingUp, Printer } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'
import { toQuarterLabel, groupByQuarter, sortQuarterLabels, buildTree, buildTreeFromLinhas, flattenTree } from '@/lib/dre-utils'
import type { DRERow, DREAccountRow, TreeNode, DRELinha } from '@/lib/dre-utils'
import dynamic from 'next/dynamic'
import type { ContextMenuState } from '@/components/DreDetalhamentoModal'

const DetalhamentoModal = dynamic(() => import('@/components/DreDetalhamentoModal'), { ssr: false })
const WaterfallChart = dynamic(() => import('@/components/DreWaterfallChart'), {
  ssr: false,
  loading: () => <Card><CardContent className="p-5"><div className="h-[420px] bg-gray-50 rounded-lg animate-pulse" /></CardContent></Card>,
})
const TrendChartModal = dynamic(() => import('@/components/TrendChart'), { ssr: false })

interface DREComment {
  id: number; dre_linha: string; agrupamento?: string; conta?: string
  periodo?: string; texto: string; usuario?: string; user_role?: string
  departamento?: string; created_at: string
}

export default function DREPage() {
  const [rawData,       setRawData]       = useState<DRERow[]>([])
  const [accountData,   setAccountData]   = useState<DREAccountRow[]>([])
  const [hierarchy,     setHierarchy]     = useState<Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>>([])
  const [dreLinhas,     setDreLinhas]     = useState<DRELinha[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [selDepts,      setSelDepts]      = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  const [selCentros,    setSelCentros]    = useState<string[]>([])
  const [selYear,       setSelYear]       = useState<string | null>('2026')
  const [centrosDisp,   setCentrosDisp]   = useState<Array<{ cc: string; nome: string }>>([])
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const [loading,       setLoading]       = useState(false)
  const [viewMode,      setViewMode]      = useState<'total' | 'periodo' | 'trimestre' | 'cascata' | 'comparativo'>('total')
  const [compMode,      setCompMode]      = useState<'mes' | 'trimestre' | 'ano'>('trimestre')
  const [compA,         setCompA]         = useState<string>('')
  const [compB,         setCompB]         = useState<string>('')
  const [periodView,    setPeriodView]    = useState<'compact' | 'full'>('compact')
  const [ctxMenu,       setCtxMenu]       = useState<ContextMenuState | null>(null)
  const [detModal,      setDetModal]      = useState<ContextMenuState | null>(null)
  const [deptUser,      setDeptUser]      = useState<{ department: string } | null>(null)
  const [comments,      setComments]      = useState<DREComment[]>([])
  const [commentEdit,   setCommentEdit]   = useState<{ dre_linha: string; agrupamento?: string; conta?: string; periodo?: string } | null>(null)
  const [commentText,   setCommentText]   = useState('')
  const [trendTarget,   setTrendTarget]   = useState<{ title: string; conta?: string; agrupamento?: string; dre?: string } | null>(null)
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
    async function init() {
      const me = await fetch('/api/me').then(r => r.ok ? r.json() : null).catch(() => null)
      const isDept = me?.role === 'dept' && me.department
      if (isDept) { setDeptUser({ department: me.department }); setSelDepts([me.department]) }

      // Support ?dept=X URL param (e.g. from comments log page)
      const urlDept = new URLSearchParams(window.location.search).get('dept')

      const [hier, linhas, depts, dates] = await Promise.all([
        fetch('/api/dre?type=hierarchy').then(r => r.json()),
        fetch('/api/dre?type=linhas').then(r => r.json()),
        fetch('/api/dre?type=distinct&col=nome_departamento').then(r => r.json()),
        fetch('/api/dre?type=distinct&col=data_lancamento').then(r => r.json()),
      ])
      setHierarchy(Array.isArray(hier) ? hier : [])
      setDreLinhas(Array.isArray(linhas) ? linhas : [])
      setDepartamentos(Array.isArray(depts) ? depts : [])
      const allPeriods = ([...new Set(
        (Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean)
      )].sort() as string[])
      setPeriodos(allPeriods)
      const now = new Date()
      const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const defaultDepts = isDept ? [me.department] : urlDept ? [urlDept] : []
      if (urlDept && !isDept) setSelDepts([urlDept])
      const ytd2026 = allPeriods.filter(p => p.startsWith('2026') && p <= curMonth)
      const defaultPeriods = ytd2026.length > 0 ? ytd2026 : allPeriods.filter(p => p.startsWith('2026'))
      if (defaultPeriods.length > 0) {
        setSelPeriods(defaultPeriods)
        loadData(defaultDepts, defaultPeriods, [])
      } else {
        loadData(defaultDepts, [], [])
      }
    }
    init()
  }, [])

  const loadData = useCallback(async (depts: string[], prds: string[], centros: string[]) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depts.length)   params.set('departamentos', depts.join(','))
    if (prds.length)    params.set('periodos', prds.join(','))
    if (centros.length) params.set('centros', centros.join(','))
    const acctParams = new URLSearchParams(params)
    acctParams.set('type', 'accounts')
    const [res, acctRes] = await Promise.all([
      fetch(`/api/dre?${params}`),
      fetch(`/api/dre?${acctParams}`),
    ])
    if (res.ok) setRawData(await res.json())
    if (acctRes.ok) setAccountData(await acctRes.json())
    setLoading(false)
  }, [])

  // Load comments for current periods
  const loadComments = useCallback(async (prds: string[]) => {
    const p = new URLSearchParams()
    if (prds.length) p.set('periodos', prds.join(','))
    const res = await fetch(`/api/dre/comments?${p}`)
    if (res.ok) setComments(await res.json())
  }, [])

  useEffect(() => { if (selPeriods.length > 0) loadComments(selPeriods) }, [selPeriods, loadComments])

  // Comment helpers — track which roles have commented on each line
  const commentKey = (dre_linha: string) => dre_linha
  // commentRoleMap: key=dre_linha → { hasMaster, hasDept, comments }
  const commentRoleMap = useMemo(() => {
    const map = new Map<string, { hasMaster: boolean; hasDept: boolean; comments: DREComment[] }>()
    for (const c of comments) {
      const k = c.dre_linha
      const entry = map.get(k) ?? { hasMaster: false, hasDept: false, comments: [] }
      if (c.user_role === 'master') entry.hasMaster = true
      else entry.hasDept = true
      entry.comments.push(c)
      map.set(k, entry)
    }
    return map
  }, [comments])

  const saveComment = async () => {
    if (!commentEdit || !commentText.trim()) return
    const res = await fetch('/api/dre/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...commentEdit, texto: commentText.trim() }),
    })
    if (!res.ok) return // silently keep dialog open on error
    setCommentText('')
    setCommentEdit(null)
    loadComments(selPeriods)
  }

  const deleteComment = async (id: number) => {
    await fetch(`/api/dre/comments?id=${id}`, { method: 'DELETE' })
    loadComments(selPeriods)
  }

  // Print / PDF
  const handlePrint = () => {
    window.print()
  }

  const applyFilters = () => loadData(selDepts, selPeriods, selCentros)

  // When year changes, default to YTD (≤ current month) and auto-apply
  const handleYearChange = (year: string | null) => {
    setSelYear(year)
    if (!year) {
      setSelPeriods([])
      loadData(selDepts, [], selCentros)
      return
    }
    const now = new Date()
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const ytd = periodos.filter(p => p.startsWith(year) && p <= curMonth)
    const newPeriods = ytd.length > 0 ? ytd : periodos.filter(p => p.startsWith(year))
    setSelPeriods(newPeriods)
    loadData(selDepts, newPeriods, selCentros)
  }

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const expandAll = () => {
    const groups = new Set<string>()
    // Add DRE group names (level 1)
    for (const h of hierarchy) if (h.dre) groups.add(h.dre)
    // Add agrupamento names (level 2) for 3rd level expansion
    for (const h of hierarchy) if (h.agrupamento_arvore) groups.add(h.agrupamento_arvore)
    setExpanded(groups)
  }
  const collapseAll = () => setExpanded(new Set())

  // Build tree from raw data — memoized: only recomputes when data changes
  const tree = useMemo(() => dreLinhas.length > 0
    ? buildTreeFromLinhas(rawData, hierarchy, dreLinhas, accountData)
    : buildTree(rawData, hierarchy, accountData),
  [rawData, hierarchy, dreLinhas, accountData])

  // Get all periods from data
  const dataPeriods = useMemo(
    () => [...new Set(rawData.map(r => r.periodo).filter(Boolean))].sort(),
    [rawData]
  )

  // Flatten tree for table rendering — recomputes only when tree or expanded changes
  const flatRows = useMemo(() => flattenTree(tree, expanded), [tree, expanded])

  // Totals — only real groups (não subtotais calculados que já somam os grupos)
  const totals = useMemo(() => tree
    .filter(r => r.isGroup && !r.isSubtotal)
    .reduce((acc, r) => ({
      budget: acc.budget + r.budget,
      razao:  acc.razao  + r.razao,
    }), { budget: 0, razao: 0 }),
  [tree])

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
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2"
            onClick={() => {
              setTrendTarget({
                title: ctxMenu.node.name,
                conta: ctxMenu.node.conta,
                agrupamento: ctxMenu.node.agrupamento,
                dre: ctxMenu.node.dre,
              })
              setCtxMenu(null)
            }}>
            <TrendingUp size={13} /> Gráfico de Tendência
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2"
            onClick={() => {
              setCommentEdit({
                dre_linha: ctxMenu.node.name,
                agrupamento: ctxMenu.node.agrupamento,
                conta: ctxMenu.node.conta,
                periodo: ctxMenu.periodo,
              })
              setCtxMenu(null)
            }}>
            <MessageSquare size={13} /> Comentar
          </button>
        </div>
      )}

      {/* Modal de detalhamento */}
      {detModal && <DetalhamentoModal ctx={detModal} onClose={() => setDetModal(null)} />}

      {/* Modal de tendência */}
      {trendTarget && (
        <TrendChartModal
          title={trendTarget.title}
          conta={trendTarget.conta}
          agrupamento={trendTarget.agrupamento}
          dre={trendTarget.dre}
          departamentos={selDepts.length ? selDepts : undefined}
          onClose={() => setTrendTarget(null)}
        />
      )}

      {/* Modal de comentário */}
      {commentEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={e => { if (e.target === e.currentTarget) setCommentEdit(null) }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare size={14} className="text-indigo-500" /> Comentário
            </h3>
            <p className="text-xs text-gray-500">{commentEdit.dre_linha}{commentEdit.periodo ? ` · ${commentEdit.periodo}` : ''}</p>

            {/* Existing comments */}
            {(commentRoleMap.get(commentKey(commentEdit.dre_linha))?.comments ?? []).map(c => (
              <div key={c.id} className={cn(
                'rounded-lg p-2.5 text-xs text-gray-700 flex items-start gap-2',
                c.user_role === 'dept' ? 'bg-orange-50 border border-orange-100' : 'bg-purple-50 border border-purple-100'
              )}>
                <span className={cn('w-2 h-2 rounded-full mt-0.5 flex-shrink-0', c.user_role === 'dept' ? 'bg-orange-400' : 'bg-purple-500')} />
                <div className="flex-1">
                  <p>{c.texto}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {c.usuario ?? (c.user_role === 'dept' ? c.departamento : 'master')} · {new Date(c.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <button onClick={() => deleteComment(c.id)} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={12} /></button>
              </div>
            ))}

            <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
              placeholder="Adicionar comentário…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 h-20 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCommentEdit(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancelar</button>
              <button onClick={saveComment} disabled={!commentText.trim()}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">Salvar</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DRE — Demonstrativo de Resultados</h1>
          <p className="text-gray-500 text-sm mt-0.5">P&L por linha contábil · Budget vs Razão · Clique direito para detalhamento</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <YearFilter periodos={periodos} selYear={selYear} onChange={handleYearChange} />
          <Button variant="outline" size="sm" onClick={exportCSV}><Download size={13} /> CSV</Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="no-print"><Printer size={13} /> PDF</Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar filters */}
        <div className="w-52 flex-shrink-0 space-y-3">
          <Card>
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Filter size={11} /> Filtros
              </p>
              {deptUser ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Departamento</p>
                  <p className="text-xs text-indigo-700 font-semibold px-1 py-0.5 bg-indigo-50 rounded">{deptUser.department}</p>
                </div>
              ) : (
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
              )}

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
              {([['total', 'Consolidado'], ['periodo', 'Por Período'], ['trimestre', 'Trimestral'], ['comparativo', 'Comparativo'], ['cascata', 'Cascata']] as const).map(([v, label]) => (
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
                        <td className={cn('px-5 py-2.5',
                          row.isSubtotal ? 'font-bold text-gray-900'
                            : row.isGroup ? 'font-medium text-gray-800'
                            : row.isAccount ? 'text-gray-500 text-xs'
                            : 'text-gray-700')}
                          style={{ paddingLeft: `${20 + row.depth * 24}px` }}>
                          <div className="flex items-center gap-1.5">
                            {row.isGroup && !row.isSubtotal ? (
                              <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                {expanded.has(row.agrupamento || row.name)
                                  ? <ChevronDown size={14} className="text-gray-400" />
                                  : <ChevronRight size={14} className="text-gray-400" />}
                              </button>
                            ) : (
                              <span className="w-5" />
                            )}
                            {row.name}
                            {commentRoleMap.has(commentKey(row.name)) && (() => {
                              const e = commentRoleMap.get(commentKey(row.name))!
                              return (
                                <span className="flex items-center gap-0.5 ml-1 flex-shrink-0">
                                  {e.hasDept  && <span className="w-2 h-2 rounded-full bg-orange-400" title="Comentário do departamento" />}
                                  {e.hasMaster && <span className="w-2 h-2 rounded-full bg-purple-500" title="Comentário do master" />}
                                </span>
                              )
                            })()}
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
                          <th key={p} className="text-center px-1.5 py-2 font-medium text-gray-400 text-xs border-l-2 border-black min-w-[68px]">
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
                                  <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                    {expanded.has(row.agrupamento || row.name)
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
                                  className="px-1 py-2 text-center border-l-2 border-black group/cell">
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
                          <th key={p} colSpan={3} className="text-center px-1 py-2 font-medium text-gray-600 border-l-2 border-black bg-gray-50">
                            {formatPeriodo(p)}
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b bg-gray-50/50">
                        <th className="sticky left-0 bg-gray-50/50 z-10" />
                        {dataPeriods.map(p => (
                          <React.Fragment key={p}>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-black">Orçado</th>
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
                                <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                  {expanded.has(row.agrupamento || row.name)
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
                                  className={cn('px-2 py-2 text-right text-xs border-l-2 border-black', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
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

          {!loading && viewMode === 'trimestre' && (() => {
            // Compute quarter columns from existing data
            const allQuarters = sortQuarterLabels([...new Set(
              dataPeriods.map(p => toQuarterLabel(p))
            )])
            return (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[220px]">
                          Demonstrativo Gerencial
                        </th>
                        {allQuarters.map(q => (
                          <th key={q} colSpan={3} className="text-center px-1 py-2 font-medium text-gray-600 border-l-2 border-black bg-gray-50">
                            {q}
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b bg-gray-50/50">
                        <th className="sticky left-0 bg-gray-50/50 z-10" />
                        {allQuarters.map(q => (
                          <React.Fragment key={q}>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-black">Orçado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Var.</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {flatRows.map((row, i) => {
                        const byQ = groupByQuarter(row.byPeriod)
                        return (
                          <tr key={i}
                            onContextMenu={e => openCtxMenu(e, row, undefined, 'ambos')}
                            className={cn('border-b transition-colors cursor-context-menu',
                              row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50')}>
                            <td className={cn('px-4 py-2 sticky left-0 bg-white z-10',
                              row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80'
                                : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80'
                                : 'text-gray-700')}
                              style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                              <div className="flex items-center gap-1">
                                {row.isGroup && !row.isSubtotal ? (
                                  <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                    {expanded.has(row.agrupamento || row.name)
                                      ? <ChevronDown size={13} className="text-gray-400" />
                                      : <ChevronRight size={13} className="text-gray-400" />}
                                  </button>
                                ) : <span className="w-4" />}
                                <span className="truncate">{row.name}</span>
                              </div>
                            </td>
                            {allQuarters.map(q => {
                              const cell = byQ[q] ?? { budget: 0, razao: 0 }
                              const v = cell.razao - cell.budget
                              return (
                                <React.Fragment key={q}>
                                  <td className={cn('px-2 py-2 text-right text-xs border-l-2 border-black', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                    {formatCurrency(cell.budget)}
                                  </td>
                                  <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                    {formatCurrency(cell.razao)}
                                  </td>
                                  <td className={cn('px-2 py-2 text-right text-xs font-semibold border-l border-gray-200', colorForVariance(v))}>
                                    {formatCurrency(v)}
                                  </td>
                                </React.Fragment>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          })()}

          {!loading && viewMode === 'comparativo' && (() => {
            // Build comparison period options based on compMode
            const monthOptions = dataPeriods
            const quarterOptions = sortQuarterLabels([...new Set(dataPeriods.map(p => toQuarterLabel(p)))])
            const yearOptions = [...new Set(dataPeriods.map(p => p.split('-')[0]))].sort()

            const options = compMode === 'mes' ? monthOptions
              : compMode === 'trimestre' ? quarterOptions
              : yearOptions

            const formatOption = (o: string) =>
              compMode === 'mes' ? formatPeriodo(o)
              : o // quarters already formatted like 1T24, years like 2024

            // Get data for each comparison side
            const getNodeValues = (node: TreeNode, key: string): { budget: number; razao: number } => {
              if (compMode === 'mes') {
                return node.byPeriod[key] ?? { budget: 0, razao: 0 }
              } else if (compMode === 'trimestre') {
                const byQ = groupByQuarter(node.byPeriod)
                return byQ[key] ?? { budget: 0, razao: 0 }
              } else {
                // year: sum all months in that year
                let budget = 0, razao = 0
                for (const [p, v] of Object.entries(node.byPeriod)) {
                  if (p.startsWith(key + '-')) {
                    budget += v.budget
                    razao += v.razao
                  }
                }
                return { budget, razao }
              }
            }

            const hasSelection = compA && compB && compA !== compB

            return (
              <div className="space-y-3">
                {/* Comparison controls */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex bg-gray-100 rounded-md p-0.5 gap-0.5">
                        {([['mes', 'Mês'], ['trimestre', 'Trimestre'], ['ano', 'Ano']] as const).map(([v, l]) => (
                          <button key={v} onClick={() => { setCompMode(v); setCompA(''); setCompB('') }}
                            className={cn('px-3 py-1.5 rounded text-xs font-medium transition-colors',
                              compMode === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                            {l}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <select value={compA} onChange={e => setCompA(e.target.value)}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                          <option value="">Período A</option>
                          {options.map(o => <option key={o} value={o}>{formatOption(o)}</option>)}
                        </select>

                        <span className="text-sm font-medium text-gray-400">vs</span>

                        <select value={compB} onChange={e => setCompB(e.target.value)}
                          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">
                          <option value="">Período B</option>
                          {options.map(o => <option key={o} value={o}>{formatOption(o)}</option>)}
                        </select>
                      </div>

                      {/* Quick YoY / MoM buttons */}
                      <div className="flex items-center gap-1 border-l border-gray-200 pl-3 ml-1">
                        <span className="text-xs text-gray-400 mr-1">Rápido:</span>
                        {compMode === 'mes' && monthOptions.length >= 2 && (
                          <button onClick={() => {
                            setCompA(monthOptions[monthOptions.length - 1])
                            setCompB(monthOptions[monthOptions.length - 2])
                          }} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                            MoM
                          </button>
                        )}
                        {compMode === 'mes' && (() => {
                          const last = monthOptions[monthOptions.length - 1]
                          if (!last) return null
                          const [y, m] = last.split('-')
                          const yoy = `${parseInt(y) - 1}-${m}`
                          if (monthOptions.includes(yoy)) {
                            return (
                              <button onClick={() => { setCompA(last); setCompB(yoy) }}
                                className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium">
                                YoY
                              </button>
                            )
                          }
                          return null
                        })()}
                        {compMode === 'trimestre' && quarterOptions.length >= 2 && (
                          <button onClick={() => {
                            setCompA(quarterOptions[quarterOptions.length - 1])
                            setCompB(quarterOptions[quarterOptions.length - 2])
                          }} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium">
                            QoQ
                          </button>
                        )}
                        {compMode === 'ano' && yearOptions.length >= 2 && (
                          <button onClick={() => {
                            setCompA(yearOptions[yearOptions.length - 1])
                            setCompB(yearOptions[yearOptions.length - 2])
                          }} className="text-xs px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium">
                            YoY
                          </button>
                        )}
                      </div>

                      {hasSelection && (
                        <Badge variant="secondary" className="text-xs">
                          {formatOption(compA)} vs {formatOption(compB)}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Comparison table */}
                {hasSelection ? (
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[220px]">
                              Demonstrativo Gerencial
                            </th>
                            <th colSpan={2} className="text-center px-2 py-2 font-medium text-indigo-600 border-l-2 border-indigo-200 bg-indigo-50/50">
                              {formatOption(compA)}
                            </th>
                            <th colSpan={2} className="text-center px-2 py-2 font-medium text-emerald-600 border-l-2 border-emerald-200 bg-emerald-50/50">
                              {formatOption(compB)}
                            </th>
                            <th colSpan={2} className="text-center px-2 py-2 font-medium text-gray-600 border-l-2 border-black bg-gray-100/50">
                              Variação (A vs B)
                            </th>
                          </tr>
                          <tr className="border-b bg-gray-50/50">
                            <th className="sticky left-0 bg-gray-50/50 z-10" />
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-indigo-200">Orçado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-emerald-200">Orçado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-black">Δ Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">% Var.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flatRows.map((row, i) => {
                            const vA = getNodeValues(row, compA)
                            const vB = getNodeValues(row, compB)
                            const deltaRazao = vA.razao - vB.razao
                            const deltaPct = vB.razao ? ((deltaRazao) / Math.abs(vB.razao)) * 100 : 0
                            return (
                              <tr key={i}
                                onContextMenu={e => openCtxMenu(e, row, undefined, 'ambos')}
                                className={cn('border-b transition-colors cursor-context-menu',
                                  row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50')}>
                                <td className={cn('px-4 py-2 sticky left-0 bg-white z-10',
                                  row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80'
                                    : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80'
                                    : 'text-gray-700')}
                                  style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                                  <div className="flex items-center gap-1">
                                    {row.isGroup && !row.isSubtotal ? (
                                      <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                        {expanded.has(row.agrupamento || row.name)
                                          ? <ChevronDown size={13} className="text-gray-400" />
                                          : <ChevronRight size={13} className="text-gray-400" />}
                                      </button>
                                    ) : <span className="w-4" />}
                                    <span className="truncate">{row.name}</span>
                                  </div>
                                </td>
                                {/* Period A */}
                                <td className={cn('px-2 py-2 text-right text-xs border-l-2 border-indigo-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                  {formatCurrency(vA.budget)}
                                </td>
                                <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                  {formatCurrency(vA.razao)}
                                </td>
                                {/* Period B */}
                                <td className={cn('px-2 py-2 text-right text-xs border-l-2 border-emerald-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                  {formatCurrency(vB.budget)}
                                </td>
                                <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>
                                  {formatCurrency(vB.razao)}
                                </td>
                                {/* Delta */}
                                <td className={cn('px-2 py-2 text-right text-xs font-semibold border-l-2 border-black', colorForVariance(deltaRazao))}>
                                  {formatCurrency(deltaRazao)}
                                </td>
                                <td className="px-2 py-2 text-right border-l border-gray-200">
                                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', bgColorForVariance(deltaRazao))}>
                                    {formatPct(deltaPct)}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-10 text-center text-gray-400 text-sm">
                      Selecione dois períodos diferentes para comparar.
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })()}

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

