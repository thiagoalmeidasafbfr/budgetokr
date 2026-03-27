'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, Settings2, Eye, EyeOff, RotateCcw, Save, Trash2, X, Check, Filter } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, cn } from '@/lib/utils'
import { buildTreeFromLinhas } from '@/lib/dre-utils'
import type { DRERow, DREAccountRow, DRELinha, TreeNode } from '@/lib/dre-utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Hierarchy {
  agrupamento_arvore: string
  dre: string
  ordem_dre: number
}

/** Chave de exclusão: "dre:NOME", "agrup:DRE||AGRUP", "conta:NUM_CONTA" */
type ExclusionKey = string

interface SavedView {
  name: string
  exclusions: ExclusionKey[]
  createdAt: string
}

const STORAGE_KEY = 'dre_gerencial_views'
const ACTIVE_VIEW_KEY = 'dre_gerencial_active'

// ─── Helper: apply exclusions to raw data ─────────────────────────────────────

function applyExclusions(
  rawData: DRERow[],
  accountData: DREAccountRow[],
  exclusions: Set<ExclusionKey>
): { rows: DRERow[]; accounts: DREAccountRow[] } {
  if (exclusions.size === 0) return { rows: rawData, accounts: accountData }

  // Contas excluídas individualmente
  const excludedContas = new Set<string>()
  for (const key of exclusions) {
    if (key.startsWith('conta:')) excludedContas.add(key.slice(6))
  }

  // Agrupamentos excluídos individualmente
  const excludedAgrup = new Set<string>() // "DRE||AGRUP"
  for (const key of exclusions) {
    if (key.startsWith('agrup:')) excludedAgrup.add(key.slice(6))
  }

  // Linhas DRE excluídas inteiras
  const excludedDre = new Set<string>()
  for (const key of exclusions) {
    if (key.startsWith('dre:')) excludedDre.add(key.slice(4))
  }

  // Filtrar accounts
  const filteredAccounts = accountData.filter(acc => {
    if (excludedDre.has(acc.dre)) return false
    if (excludedAgrup.has(`${acc.dre}||${acc.agrupamento_arvore}`)) return false
    if (excludedContas.has(acc.numero_conta_contabil)) return false
    return true
  })

  // Calcular delta de cada (dre, agrupamento) causado por contas excluídas individualmente
  const deltaMap = new Map<string, { budget: number; razao: number }>()
  for (const acc of accountData) {
    if (!excludedContas.has(acc.numero_conta_contabil)) continue
    // Só aplica delta se o agrupamento pai não estiver totalmente excluído
    if (excludedAgrup.has(`${acc.dre}||${acc.agrupamento_arvore}`)) continue
    if (excludedDre.has(acc.dre)) continue
    const mapKey = `${acc.dre}||${acc.agrupamento_arvore}||${acc.periodo}`
    if (!deltaMap.has(mapKey)) deltaMap.set(mapKey, { budget: 0, razao: 0 })
    const d = deltaMap.get(mapKey)!
    d.budget += acc.budget
    d.razao  += acc.razao
  }

  // Filtrar e ajustar rows
  const filteredRows: DRERow[] = []
  for (const row of rawData) {
    if (excludedDre.has(row.dre)) continue
    if (excludedAgrup.has(`${row.dre}||${row.agrupamento_arvore}`)) continue

    const deltaKey = `${row.dre}||${row.agrupamento_arvore}||${row.periodo}`
    const delta = deltaMap.get(deltaKey)
    if (delta) {
      filteredRows.push({
        ...row,
        budget: row.budget - delta.budget,
        razao:  row.razao  - delta.razao,
      })
    } else {
      filteredRows.push(row)
    }
  }

  return { rows: filteredRows, accounts: filteredAccounts }
}

// ─── DRE Tree Row ─────────────────────────────────────────────────────────────

function DreRow({
  node,
  expanded,
  onToggle,
}: {
  node: TreeNode
  expanded: Set<string>
  onToggle: (name: string) => void
}) {
  const isOpen = expanded.has(node.name)
  const hasChildren = node.children.length > 0
  const pct = node.variacao_pct

  return (
    <>
      <tr
        className={cn(
          'border-b border-gray-100',
          node.isSubtotal && 'bg-gray-50',
          node.isSeparator && 'border-t-2 border-gray-300'
        )}
      >
        <td className={cn(
          'py-2 px-3 text-sm',
          node.depth === 0 && 'pl-4',
          node.depth === 1 && 'pl-8',
          node.depth === 2 && 'pl-12',
          node.isSubtotal || node.isBold ? 'font-semibold text-gray-900' : 'text-gray-700'
        )}>
          <div className="flex items-center gap-1.5">
            {hasChildren && (
              <button onClick={() => onToggle(node.name)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            )}
            {!hasChildren && node.depth > 0 && <span className="w-4 flex-shrink-0" />}
            <span className={node.isAccount ? 'text-gray-500 text-xs' : ''}>{node.name}</span>
          </div>
        </td>
        <td className={cn('py-2 px-3 text-right text-sm tabular-nums', node.isBold || node.isSubtotal ? 'font-semibold' : '')}>
          {formatCurrency(node.budget)}
        </td>
        <td className={cn('py-2 px-3 text-right text-sm tabular-nums', node.isBold || node.isSubtotal ? 'font-semibold' : '')}>
          {formatCurrency(node.razao)}
        </td>
        <td className={cn('py-2 px-3 text-right text-sm tabular-nums', node.variacao >= 0 ? 'text-green-600' : 'text-red-500')}>
          {formatCurrency(node.variacao)}
        </td>
        <td className={cn('py-2 px-3 text-right text-sm tabular-nums', pct >= 0 ? 'text-green-600' : 'text-red-500')}>
          {formatPct(pct)}
        </td>
      </tr>
      {isOpen && node.children.map(child => (
        <DreRow key={child.name} node={child} expanded={expanded} onToggle={onToggle} />
      ))}
    </>
  )
}

// ─── Exclusion Panel ──────────────────────────────────────────────────────────

function ExclusionPanel({
  dreLinhas,
  hierarchy,
  accountData,
  exclusions,
  onToggle,
}: {
  dreLinhas: DRELinha[]
  hierarchy: Hierarchy[]
  accountData: DREAccountRow[]
  exclusions: Set<ExclusionKey>
  onToggle: (key: ExclusionKey) => void
}) {
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set())
  const [expandedAgrup, setExpandedAgrup] = useState<Set<string>>(new Set())

  // Build agrupamentos per dre line
  const agrupMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const h of hierarchy) {
      if (!h.dre || !h.agrupamento_arvore) continue
      if (!m.has(h.dre)) m.set(h.dre, [])
      if (!m.get(h.dre)!.includes(h.agrupamento_arvore))
        m.get(h.dre)!.push(h.agrupamento_arvore)
    }
    return m
  }, [hierarchy])

  // Build contas per (dre, agrupamento)
  const contaMap = useMemo(() => {
    const m = new Map<string, DREAccountRow[]>()
    for (const acc of accountData) {
      if (!acc.numero_conta_contabil) continue
      const key = `${acc.dre}||${acc.agrupamento_arvore}`
      if (!m.has(key)) m.set(key, [])
      // deduplicate by conta number
      if (!m.get(key)!.some(a => a.numero_conta_contabil === acc.numero_conta_contabil))
        m.get(key)!.push(acc)
    }
    return m
  }, [accountData])

  const grupos = dreLinhas.filter(l => l.tipo === 'grupo')
  const excluded = (key: ExclusionKey) => exclusions.has(key)

  function toggleLine(line: string) {
    setExpandedLines(prev => {
      const next = new Set(prev)
      next.has(line) ? next.delete(line) : next.add(line)
      return next
    })
  }

  function toggleAgrupExpand(key: string) {
    setExpandedAgrup(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="text-sm">
      <p className="text-xs text-gray-400 mb-3 px-1">
        Marque itens para <strong>excluir</strong> do cálculo. Pode excluir linhas inteiras, agrupamentos ou contas individuais.
      </p>
      <div className="space-y-0.5">
        {grupos.map(linha => {
          const dreKey = `dre:${linha.nome}`
          const isDreExcluded = excluded(dreKey)
          const agrupamentos = agrupMap.get(linha.nome) ?? []
          const isOpen = expandedLines.has(linha.nome)

          return (
            <div key={linha.nome} className="rounded-md overflow-hidden">
              {/* DRE Line */}
              <div className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md group cursor-pointer select-none',
                isDreExcluded ? 'bg-red-50 text-red-400' : 'hover:bg-gray-50 text-gray-800'
              )}>
                <button
                  onClick={() => agrupamentos.length > 0 && toggleLine(linha.nome)}
                  className="text-gray-300 hover:text-gray-500 flex-shrink-0 w-4"
                >
                  {agrupamentos.length > 0
                    ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
                    : <span />
                  }
                </button>
                <button
                  onClick={() => onToggle(dreKey)}
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                    isDreExcluded
                      ? 'bg-red-500 border-red-500 text-white'
                      : 'border-gray-300 hover:border-gray-400'
                  )}
                >
                  {isDreExcluded && <X size={10} />}
                </button>
                <span
                  className={cn('font-semibold text-xs flex-1', isDreExcluded && 'line-through')}
                  onClick={() => onToggle(dreKey)}
                >
                  {linha.nome}
                </span>
              </div>

              {/* Agrupamentos */}
              {isOpen && !isDreExcluded && agrupamentos.map(agrup => {
                const agrupKey = `agrup:${linha.nome}||${agrup}`
                const isAgrupExcluded = excluded(agrupKey)
                const contas = contaMap.get(`${linha.nome}||${agrup}`) ?? []
                const agrupExpandKey = `${linha.nome}||${agrup}`
                const isAgrupOpen = expandedAgrup.has(agrupExpandKey)

                return (
                  <div key={agrup} className="ml-6">
                    <div className={cn(
                      'flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer select-none',
                      isAgrupExcluded ? 'bg-orange-50 text-orange-400' : 'hover:bg-gray-50 text-gray-700'
                    )}>
                      <button
                        onClick={() => contas.length > 0 && toggleAgrupExpand(agrupExpandKey)}
                        className="text-gray-300 hover:text-gray-500 flex-shrink-0 w-4"
                      >
                        {contas.length > 0
                          ? (isAgrupOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
                          : <span />
                        }
                      </button>
                      <button
                        onClick={() => onToggle(agrupKey)}
                        className={cn(
                          'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                          isAgrupExcluded
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'border-gray-300 hover:border-gray-400'
                        )}
                      >
                        {isAgrupExcluded && <X size={9} />}
                      </button>
                      <span
                        className={cn('text-xs flex-1', isAgrupExcluded && 'line-through')}
                        onClick={() => onToggle(agrupKey)}
                      >
                        {agrup}
                      </span>
                    </div>

                    {/* Contas */}
                    {isAgrupOpen && !isAgrupExcluded && contas.map(acc => {
                      const contaKey = `conta:${acc.numero_conta_contabil}`
                      const isContaExcluded = excluded(contaKey)
                      return (
                        <div
                          key={acc.numero_conta_contabil}
                          className={cn(
                            'ml-6 flex items-center gap-2 px-2 py-0.5 rounded cursor-pointer select-none',
                            isContaExcluded ? 'bg-red-50/60 text-red-400' : 'hover:bg-gray-50 text-gray-500'
                          )}
                          onClick={() => onToggle(contaKey)}
                        >
                          <button
                            className={cn(
                              'w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                              isContaExcluded
                                ? 'bg-red-500 border-red-500 text-white'
                                : 'border-gray-200 hover:border-gray-400'
                            )}
                          >
                            {isContaExcluded && <X size={8} />}
                          </button>
                          <span className={cn('text-[11px] flex-1 truncate', isContaExcluded && 'line-through')}>
                            {acc.numero_conta_contabil} — {acc.nome_conta_contabil}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DreGerencialPage() {
  const [rawData,     setRawData]     = useState<DRERow[]>([])
  const [accountData, setAccountData] = useState<DREAccountRow[]>([])
  const [hierarchy,   setHierarchy]   = useState<Hierarchy[]>([])
  const [dreLinhas,   setDreLinhas]   = useState<DRELinha[]>([])
  const [selYear,     setSelYear]     = useState<string | null>('2026')
  const [selDepts,    setSelDepts]    = useState<string[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [loading,     setLoading]     = useState(false)
  const [panelOpen,   setPanelOpen]   = useState(true)
  const [exclusions,  setExclusions]  = useState<Set<ExclusionKey>>(new Set())
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [savedViews,  setSavedViews]  = useState<SavedView[]>([])
  const [activeView,  setActiveView]  = useState<string>('')
  const [saveName,    setSaveName]    = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)

  // ── Load saved views from localStorage ─────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSavedViews(JSON.parse(raw))
      const active = localStorage.getItem(ACTIVE_VIEW_KEY)
      if (active) setActiveView(active)
    } catch { /* ignore */ }
  }, [])

  // ── Fetch static structure ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/dre?type=linhas').then(r => r.json()),
      fetch('/api/dre?type=hierarchy').then(r => r.json()),
      fetch('/api/dre?type=distinct&col=departamento').then(r => r.json()),
    ]).then(([linhas, hier, depts]) => {
      setDreLinhas(Array.isArray(linhas) ? linhas : [])
      setHierarchy(Array.isArray(hier) ? hier : [])
      setDepartamentos(Array.isArray(depts) ? depts : [])
    }).catch(console.error)
  }, [])

  // ── Fetch DRE data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selYear) params.set('periodos', Array.from({ length: 12 }, (_, i) => `${selYear}-${String(i + 1).padStart(2, '0')}`).join(','))
      if (selDepts.length) params.set('departamentos', selDepts.join(','))

      const [dreData, acctData] = await Promise.all([
        fetch(`/api/dre?${params}`).then(r => r.json()),
        fetch(`/api/dre?type=accounts&${params}`).then(r => r.json()),
      ])

      setRawData(Array.isArray(dreData) ? dreData : [])
      setAccountData(Array.isArray(acctData) ? acctData : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selYear, selDepts])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Build tree with exclusions applied ─────────────────────────────────────
  const tree = useMemo((): TreeNode[] => {
    if (!rawData.length || !dreLinhas.length) return []
    const { rows, accounts } = applyExclusions(rawData, accountData, exclusions)
    return buildTreeFromLinhas(rows, hierarchy, dreLinhas, accounts)
  }, [rawData, accountData, hierarchy, dreLinhas, exclusions])

  // ── Exclusion toggle ────────────────────────────────────────────────────────
  function toggleExclusion(key: ExclusionKey) {
    setExclusions(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setActiveView('')
  }

  // ── Tree expand ─────────────────────────────────────────────────────────────
  function toggleExpand(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  // ── Save view ───────────────────────────────────────────────────────────────
  function saveView() {
    if (!saveName.trim()) return
    const view: SavedView = {
      name: saveName.trim(),
      exclusions: [...exclusions],
      createdAt: new Date().toISOString(),
    }
    const next = [...savedViews.filter(v => v.name !== view.name), view]
    setSavedViews(next)
    setActiveView(view.name)
    setShowSaveModal(false)
    setSaveName('')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      localStorage.setItem(ACTIVE_VIEW_KEY, view.name)
    } catch { /* ignore */ }
  }

  function loadView(view: SavedView) {
    setExclusions(new Set(view.exclusions))
    setActiveView(view.name)
    try { localStorage.setItem(ACTIVE_VIEW_KEY, view.name) } catch { /* ignore */ }
  }

  function deleteView(name: string) {
    const next = savedViews.filter(v => v.name !== name)
    setSavedViews(next)
    if (activeView === name) setActiveView('')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      localStorage.removeItem(ACTIVE_VIEW_KEY)
    } catch { /* ignore */ }
  }

  function clearExclusions() {
    setExclusions(new Set())
    setActiveView('')
    try { localStorage.removeItem(ACTIVE_VIEW_KEY) } catch { /* ignore */ }
  }

  const exclusionCount = exclusions.size

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">DRE Gerencial</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Visão personalizada — exclua linhas, agrupamentos ou contas do cálculo
          </p>
        </div>

        {/* Saved views */}
        <div className="flex items-center gap-2 flex-wrap">
          {savedViews.map(v => (
            <div key={v.name} className="flex items-center">
              <button
                onClick={() => loadView(v)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-l-md border transition-colors',
                  activeView === v.name
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {v.name}
              </button>
              <button
                onClick={() => deleteView(v.name)}
                className={cn(
                  'px-1.5 py-1.5 border-t border-b border-r rounded-r-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors',
                  activeView === v.name ? 'border-gray-900 bg-gray-900 text-gray-400 hover:border-gray-700 hover:bg-gray-700' : 'border-gray-200'
                )}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          {exclusionCount > 0 && (
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-gray-300 rounded-md text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
            >
              <Save size={12} />
              Salvar visão
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <YearFilter value={selYear} onChange={setSelYear} />
          <button
            onClick={() => setPanelOpen(v => !v)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
              panelOpen
                ? 'bg-gray-100 border-gray-300 text-gray-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            )}
          >
            <Settings2 size={13} />
            Configurar exclusões
            {exclusionCount > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0">
                {exclusionCount}
              </Badge>
            )}
          </button>
          {exclusionCount > 0 && (
            <button
              onClick={clearExclusions}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
              title="Limpar exclusões"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Exclusion Panel */}
        {panelOpen && (
          <aside className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-700">Configurar Exclusões</h2>
              <button onClick={() => setPanelOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
            {exclusionCount > 0 && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between">
                <span className="text-xs text-red-600 font-medium">
                  {exclusionCount} {exclusionCount === 1 ? 'item excluído' : 'itens excluídos'}
                </span>
                <button onClick={clearExclusions} className="text-xs text-red-500 hover:text-red-700 underline">
                  Limpar
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3">
              {dreLinhas.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-8">Carregando estrutura...</div>
              ) : (
                <ExclusionPanel
                  dreLinhas={dreLinhas}
                  hierarchy={hierarchy}
                  accountData={accountData}
                  exclusions={exclusions}
                  onToggle={toggleExclusion}
                />
              )}
            </div>
          </aside>
        )}

        {/* DRE Table */}
        <main className="flex-1 overflow-auto p-6">
          {exclusionCount > 0 && (
            <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
              <EyeOff size={13} className="flex-shrink-0" />
              <span>
                Visão gerencial ativa — {exclusionCount} {exclusionCount === 1 ? 'item excluído' : 'itens excluídos'} do cálculo.
                {activeView && <strong className="ml-1">Visão: &quot;{activeView}&quot;</strong>}
              </span>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 space-y-3">
                  {[1,2,3,4,5,6,7].map(i => (
                    <div key={i} className="h-8 bg-gray-100 rounded-md animate-pulse" style={{ width: `${85 - i * 5}%` }} />
                  ))}
                </div>
              ) : tree.length === 0 ? (
                <div className="p-12 text-center text-gray-400 text-sm">
                  Nenhum dado disponível para o período selecionado.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Linha DRE
                        </th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Orçado
                        </th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Realizado
                        </th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Variação
                        </th>
                        <th className="text-right py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          %
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {tree.map(node => (
                        <DreRow key={node.name} node={node} expanded={expanded} onToggle={toggleExpand} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-1">Salvar visão gerencial</h3>
            <p className="text-xs text-gray-500 mb-4">
              Salva as exclusões atuais ({exclusionCount} {exclusionCount === 1 ? 'item' : 'itens'}) com um nome para reutilizar depois.
            </p>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveView()}
              placeholder="Ex: Visão Operacional, Sem IFRS..."
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <Button
                onClick={saveView}
                disabled={!saveName.trim()}
                className="bg-gray-900 text-white hover:bg-gray-700 text-sm px-4 py-2"
              >
                <Check size={13} className="mr-1.5" />
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
