'use client'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, ChevronDown, Settings2, EyeOff, RotateCcw, Save, Trash2, X, Check, Filter, Download, Plus, GripVertical, Calculator, Percent, Pencil } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn, safePct } from '@/lib/utils'
import { buildTreeFromLinhas, flattenTree, toQuarterLabel, groupByQuarter, sortQuarterLabels } from '@/lib/dre-utils'
import type { DRERow, DREAccountRow, DRELinha, TreeNode, FormulaGerencial } from '@/lib/dre-utils'
import dynamic from 'next/dynamic'

const WaterfallChart = dynamic(() => import('@/components/DreWaterfallChart'), {
  ssr: false,
  loading: () => <Card><CardContent className="p-5"><div className="h-[420px] bg-gray-50 rounded-lg animate-pulse" /></CardContent></Card>,
})

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
  selCentros?: string[]
  selDepts?: string[]
  customLinhas?: DRELinha[]
  linhaOrdem?: Array<{ id: number; ordem: number }>
  createdAt: string
}

const storageKey      = (userId: string) => `dre_gerencial_views_${userId}`
const activeKey       = (userId: string) => `dre_gerencial_active_${userId}`
const customLinhasKey = (userId: string) => `dre_gerencial_custom_linhas_${userId}`
const customOrderKey  = (userId: string) => `dre_gerencial_linha_ordem_${userId}`

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
  // ── Dados ────────────────────────────────────────────────────────────────────
  const [rawData,       setRawData]       = useState<DRERow[]>([])
  const [accountData,   setAccountData]   = useState<DREAccountRow[]>([])
  const [hierarchy,     setHierarchy]     = useState<Hierarchy[]>([])
  const [dreLinhas,     setDreLinhas]     = useState<DRELinha[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<string[]>([])
  const [loading,       setLoading]       = useState(false)
  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [filterMobileExpanded, setFilterMobileExpanded] = useState(false)
  const [selYear,       setSelYear]       = useState<string | null>('2026')
  const [selDepts,      setSelDepts]      = useState<string[]>([])
  const [selPeriods,    setSelPeriods]    = useState<string[]>([])
  const [selCentros,    setSelCentros]    = useState<string[]>([])
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set(['2026']))
  const [centrosDisp,   setCentrosDisp]   = useState<Array<{ cc: string; nome: string }>>([])
  const [deptUser,      setDeptUser]      = useState<{ department?: string; departments?: string[] } | null>(null)
  // ── Visualização ─────────────────────────────────────────────────────────────
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const [viewMode,      setViewMode]      = useState<'total' | 'periodo' | 'trimestre' | 'cascata' | 'comparativo'>('total')
  const [compMode,      setCompMode]      = useState<'mes' | 'trimestre' | 'ano'>('trimestre')
  const [compA,         setCompA]         = useState<string>('')
  const [compB,         setCompB]         = useState<string>('')
  const [periodView,    setPeriodView]    = useState<'compact' | 'full'>('full')
  // ── Exclusões ────────────────────────────────────────────────────────────────
  const [panelOpen,     setPanelOpen]     = useState(true)
  const [exclusions,    setExclusions]    = useState<Set<ExclusionKey>>(new Set())
  const [savedViews,    setSavedViews]    = useState<SavedView[]>([])
  const [activeView,    setActiveView]    = useState<string>('')
  const [saveName,      setSaveName]      = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const isFirstRef = useRef(true)
  // ── Linhas Gerenciais (calculadas + drag & drop) ──────────────────────────────
  const [showAddLineModal, setShowAddLineModal] = useState(false)
  const [orderChanged,     setOrderChanged]     = useState(false)
  const [savingOrder,      setSavingOrder]      = useState(false)
  const [isMaster,         setIsMaster]         = useState(false)
  // drag state (only for depth-0 rows)
  const dragItemRef = useRef<string | null>(null)
  const [dragOver,         setDragOver]         = useState<string | null>(null)
  // ── Add Line Modal ───────────────────────────────────────────────────────────
  const [editingLinhaId,       setEditingLinhaId]       = useState<number | null>(null)
  const [newLineName,          setNewLineName]          = useState('')
  const [newLineIsAnalise,     setNewLineIsAnalise]     = useState(false)
  const [newLineFormulaType,   setNewLineFormulaType]   = useState<'percent_of_line' | 'fixed' | 'divide_lines' | 'multiply_lines'>('percent_of_line')
  const [newLineRefNome,       setNewLineRefNome]       = useState('')
  const [newLinePercent,       setNewLinePercent]       = useState('-5')
  const [newLineValue,         setNewLineValue]         = useState('')
  const [newLineNumeradorNome, setNewLineNumeradorNome] = useState('')
  const [newLineDenomNome,     setNewLineDenomNome]     = useState('')
  const [newLineMultANome,     setNewLineMultANome]     = useState('')
  const [newLineMultBNome,     setNewLineMultBNome]     = useState('')
  const [addingLine,         setAddingLine]         = useState(false)

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const me = await fetch('/api/me').then(r => r.ok ? r.json() : null).catch(() => null)
        const userId: string = me?.userId ?? 'anon'
        setCurrentUserId(userId)
        const meDepts: string[] = me?.departments ?? (me?.department ? [me.department] : [])
        const isDept = me?.role === 'dept' && meDepts.length > 0
        if (isDept) setDeptUser({ department: meDepts[0], departments: meDepts })
        setIsMaster(!!me && me.role !== 'dept')

        const raw = localStorage.getItem(storageKey(userId))
        if (raw) setSavedViews(JSON.parse(raw))
        const active = localStorage.getItem(activeKey(userId))
        if (active) setActiveView(active)

        const [linhas, hier, depts, dates] = await Promise.all([
          fetch('/api/dre?type=linhas').then(r => r.json()),
          fetch('/api/dre?type=hierarchy').then(r => r.json()),
          fetch('/api/dre?type=distinct&col=nome_departamento').then(r => r.json()),
          fetch('/api/dre?type=distinct&col=data_lancamento').then(r => r.json()),
        ])
        const dbLinhas: DRELinha[] = Array.isArray(linhas) ? linhas : []
        // Merge DB lines with user-specific custom lines from localStorage
        let savedCustom: DRELinha[] = []
        try {
          const raw = localStorage.getItem(customLinhasKey(userId))
          if (raw) savedCustom = JSON.parse(raw)
        } catch { /* ignore */ }
        const dbIds = new Set(dbLinhas.map(l => l.id))
        const userLinhas = savedCustom.filter(l => (l.id ?? 0) < 0 && !dbIds.has(l.id))
        let allLinhas: DRELinha[] = [...dbLinhas, ...userLinhas]
        // Apply user's custom ordering if saved
        try {
          const orderRaw = localStorage.getItem(customOrderKey(userId))
          if (orderRaw) {
            const orderMap = new Map<number, number>(
              (JSON.parse(orderRaw) as Array<{ id: number; ordem: number }>).map(({ id, ordem }) => [id, ordem])
            )
            allLinhas = allLinhas.map(l => orderMap.has(l.id) ? { ...l, ordem: orderMap.get(l.id)! } : l)
          }
        } catch { /* ignore */ }
        setDreLinhas(allLinhas.sort((a, b) => a.ordem - b.ordem))
        setHierarchy(Array.isArray(hier) ? hier : [])
        setDepartamentos(Array.isArray(depts) ? depts : [])
        const allPeriods = ([...new Set(
          (Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean)
        )].sort() as string[])
        setPeriodos(allPeriods)

        const now = new Date()
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const curMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
        const ytd = allPeriods.filter(p => p.startsWith('2026') && p <= curMonth)
        const initPeriods = ytd.length > 0 ? ytd : allPeriods.filter(p => p.startsWith('2026'))
        const initDepts = isDept ? meDepts : []
        if (initDepts.length) setSelDepts(initDepts)
        if (initPeriods.length) setSelPeriods(initPeriods)
        fetchData(initDepts, initPeriods, [])
      } catch { /* ignore */ }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Centros de custo ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selDepts.length) { setCentrosDisp([]); return }
    const p = new URLSearchParams({ type: 'centros', departamentos: selDepts.join(',') })
    fetch(`/api/dre?${p}`).then(r => r.json()).then(data => {
      const avail = Array.isArray(data) ? (data as Array<{ cc: string; nome: string }>) : []
      setCentrosDisp(avail)
      setSelCentros(prev => prev.filter(c => avail.some(d => d.cc === c)))
    })
  }, [selDepts])

  // ── Fetch DRE data ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async (depts: string[], periods: string[], centros: string[]) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (depts.length)   params.set('departamentos', depts.join(','))
      if (periods.length) params.set('periodos', periods.join(','))
      if (centros.length) params.set('centros', centros.join(','))
      const acctParams = new URLSearchParams(params)
      acctParams.set('type', 'accounts')
      const [dreData, acctData] = await Promise.all([
        fetch(`/api/dre?${params}`).then(r => r.json()),
        fetch(`/api/dre?${acctParams}`).then(r => r.json()),
      ])
      setRawData(Array.isArray(dreData) ? dreData : [])
      setAccountData(Array.isArray(acctData) ? acctData : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Reload reativo com debounce ─────────────────────────────────────────────
  useEffect(() => {
    if (isFirstRef.current) { isFirstRef.current = false; return }
    const t = setTimeout(() => fetchData(selDepts, selPeriods, selCentros), 150)
    return () => clearTimeout(t)
  }, [selDepts, selPeriods, selCentros, fetchData])

  // ── Year filter handler ─────────────────────────────────────────────────────
  const handleYearChange = (year: string | null) => {
    setSelYear(year)
    if (!year) { setSelPeriods([]); return }
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const curMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    const ytd = periodos.filter(p => p.startsWith(year) && p <= curMonth)
    const newPeriods = ytd.length > 0 ? ytd : periodos.filter(p => p.startsWith(year))
    setSelPeriods(newPeriods)
    setExpandedYears(new Set([year]))
  }

  // ── Tree com exclusões + linhas calculadas ──────────────────────────────────
  const tree = useMemo((): TreeNode[] => {
    if (!rawData.length || !dreLinhas.length) return []
    const { rows, accounts } = applyExclusions(rawData, accountData, exclusions)
    const baseTree = buildTreeFromLinhas(rows, hierarchy, dreLinhas, accounts)

    const calculatedLinhas = dreLinhas.filter(l => l.tipo === 'calculada' && l.formula_gerencial)
    if (!calculatedLinhas.length) return baseTree

    // Build nodeMap from baseTree so formulas can reference any already-computed node
    const nodeMap = new Map<string, TreeNode>()
    for (const node of baseTree) nodeMap.set(node.name, node)

    const result = [...baseTree]
    for (const linha of calculatedLinhas) {
      const fg = linha.formula_gerencial!
      let budget = 0, razao = 0
      const byPeriod: Record<string, { budget: number; razao: number }> = {}

      if (fg.type === 'percent_of_line') {
        const refNode = nodeMap.get(fg.ref_nome)
        if (refNode) {
          const pct = fg.percent / 100
          budget = refNode.budget * pct
          razao = refNode.razao * pct
          for (const [p, v] of Object.entries(refNode.byPeriod)) {
            byPeriod[p] = { budget: v.budget * pct, razao: v.razao * pct }
          }
        }
      } else if (fg.type === 'fixed') {
        budget = fg.value
        razao = fg.value
      } else if (fg.type === 'divide_lines') {
        const numNode = nodeMap.get(fg.numerator_nome)
        const denNode = nodeMap.get(fg.denominator_nome)
        if (numNode && denNode) {
          budget = denNode.budget !== 0 ? numNode.budget / denNode.budget : 0
          razao  = denNode.razao  !== 0 ? numNode.razao  / denNode.razao  : 0
          for (const [p, v] of Object.entries(numNode.byPeriod)) {
            const d = denNode.byPeriod[p]
            byPeriod[p] = {
              budget: (d && d.budget !== 0) ? v.budget / d.budget : 0,
              razao:  (d && d.razao  !== 0) ? v.razao  / d.razao  : 0,
            }
          }
        }
      } else if (fg.type === 'multiply_lines') {
        const aNode = nodeMap.get(fg.line_a_nome)
        const bNode = nodeMap.get(fg.line_b_nome)
        if (aNode && bNode) {
          budget = aNode.budget * bNode.budget
          razao  = aNode.razao  * bNode.razao
          for (const [p, v] of Object.entries(aNode.byPeriod)) {
            const b = bNode.byPeriod[p]
            byPeriod[p] = {
              budget: v.budget * (b ? b.budget : 0),
              razao:  v.razao  * (b ? b.razao  : 0),
            }
          }
        }
      }

      const var_ = razao - budget
      const node: TreeNode = {
        name: linha.nome, isGroup: true, isBold: linha.negrito === 1,
        isSeparator: false, isCalculated: true, isAnalise: linha.isAnalise,
        depth: 0, ordem: linha.ordem,
        budget, razao, variacao: var_,
        variacao_pct: safePct(var_, budget),
        children: [], byPeriod,
      }
      nodeMap.set(linha.nome, node)
      const insertIdx = result.findIndex(n => n.ordem > linha.ordem)
      if (insertIdx === -1) result.push(node)
      else result.splice(insertIdx, 0, node)
    }

    // Recompute subtotals so they include any calculated lines inserted above them.
    // The baseTree subtotals only summed 'grupo' lines; now we also add 'calculada' lines.
    const subtotalLinhas = dreLinhas.filter(l => l.tipo === 'subtotal')
    if (subtotalLinhas.length > 0) {
      for (let i = 0; i < result.length; i++) {
        const subtotalLinha = subtotalLinhas.find(l => l.nome === result[i].name)
        if (!subtotalLinha) continue

        // Check if any calculada line sits above this subtotal — skip expensive recompute otherwise
        const hasCalcAbove = calculatedLinhas.some(l => l.ordem < subtotalLinha.ordem)
        if (!hasCalcAbove) continue

        let subBudget = 0, subRazao = 0
        const subByPeriod: Record<string, { budget: number; razao: number }> = {}

        for (const prevLinha of dreLinhas) {
          if (prevLinha.tipo === 'subtotal') continue
          if (prevLinha.isAnalise) continue  // analysis lines don't contribute to subtotals
          if (prevLinha.ordem >= subtotalLinha.ordem) continue
          const prevNode = nodeMap.get(prevLinha.nome)
          if (!prevNode) continue
          subBudget += prevNode.budget
          subRazao  += prevNode.razao
          for (const [p, v] of Object.entries(prevNode.byPeriod)) {
            if (!subByPeriod[p]) subByPeriod[p] = { budget: 0, razao: 0 }
            subByPeriod[p].budget += v.budget
            subByPeriod[p].razao  += v.razao
          }
        }

        subBudget *= subtotalLinha.sinal
        subRazao  *= subtotalLinha.sinal
        for (const p of Object.keys(subByPeriod)) {
          subByPeriod[p].budget *= subtotalLinha.sinal
          subByPeriod[p].razao  *= subtotalLinha.sinal
        }

        const var_ = subRazao - subBudget
        const updated: TreeNode = {
          ...result[i],
          budget: subBudget, razao: subRazao, variacao: var_,
          variacao_pct: safePct(var_, subBudget),
          byPeriod: subByPeriod,
        }
        result[i] = updated
        nodeMap.set(subtotalLinha.nome, updated)
      }
    }

    return result
  }, [rawData, accountData, hierarchy, dreLinhas, exclusions])

  // ── Dados derivados ──────────────────────────────────────────────────────────
  const dataPeriods = useMemo(
    () => [...new Set(rawData.map(r => r.periodo).filter(Boolean))].sort(),
    [rawData]
  )

  const periodsByYear = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const p of periodos) {
      const y = p.substring(0, 4)
      if (!map.has(y)) map.set(y, [])
      map.get(y)!.push(p)
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [periodos])

  const flatRows = useMemo(() => flattenTree(tree, expanded), [tree, expanded])

  // ── Exclusion toggle ────────────────────────────────────────────────────────
  function toggleExclusion(key: ExclusionKey) {
    setExclusions(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setActiveView('')
  }

  // ── Expand / collapse ───────────────────────────────────────────────────────
  function toggleExpand(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function expandAll() {
    const groups = new Set<string>()
    for (const h of hierarchy) {
      if (h.dre) groups.add(h.dre)
      if (h.agrupamento_arvore) groups.add(h.agrupamento_arvore)
    }
    setExpanded(groups)
  }
  const collapseAll = () => setExpanded(new Set())

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const exportXLSX = async () => {
    const header = viewMode === 'total'
      ? ['Linha DRE', 'Budget', 'Razão', 'Variação', '%']
      : ['Linha DRE', ...dataPeriods.flatMap(p => [`Budget ${formatPeriodo(p)}`, `Razão ${formatPeriodo(p)}`])]
    const rows = flatRows.map(r => {
      if (viewMode === 'total') return ['  '.repeat(r.depth) + r.name, r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)]
      return ['  '.repeat(r.depth) + r.name, ...dataPeriods.flatMap(p => [r.byPeriod[p]?.budget ?? 0, r.byPeriod[p]?.razao ?? 0])]
    })
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DRE Gerencial')
    XLSX.writeFile(wb, 'dre-gerencial.xlsx')
  }

  // ── Save view ───────────────────────────────────────────────────────────────
  function saveView() {
    if (!saveName.trim()) return
    const customLinhas = dreLinhas.filter(l => (l.id ?? 0) < 0)
    const linhaOrdem   = dreLinhas.map(l => ({ id: l.id, ordem: l.ordem }))
    const view: SavedView = {
      name: saveName.trim(),
      exclusions: [...exclusions],
      selCentros: [...selCentros],
      selDepts:   deptUser ? undefined : [...selDepts],   // só salva depts para master
      customLinhas,
      linhaOrdem,
      createdAt: new Date().toISOString(),
    }
    const next = [...savedViews.filter(v => v.name !== view.name), view]
    setSavedViews(next)
    setActiveView(view.name)
    setShowSaveModal(false)
    setSaveName('')
    setOrderChanged(false)
    try {
      localStorage.setItem(storageKey(currentUserId), JSON.stringify(next))
      localStorage.setItem(activeKey(currentUserId), view.name)
      // Remove view-owned lines from global storage so they don't persist outside this view
      const viewLinhaNames = new Set(customLinhas.map(l => l.nome))
      const remainingGlobal = dreLinhas.filter(l => (l.id ?? 0) < 0 && !viewLinhaNames.has(l.nome))
      localStorage.setItem(customLinhasKey(currentUserId), JSON.stringify(remainingGlobal))
    } catch { /* ignore */ }
  }

  function loadView(view: SavedView) {
    // Exclusões
    setExclusions(new Set(view.exclusions))

    // Filtros de centros / depts
    if (view.selCentros !== undefined) setSelCentros(view.selCentros)
    if (view.selDepts   !== undefined && !deptUser) setSelDepts(view.selDepts)

    // Linhas: lê o estado base do localStorage (linhas globais do usuário)
    // e adiciona as linhas EXCLUSIVAS da visão apenas na memória.
    // O localStorage base NÃO é alterado — ao sair da visão, o estado global é restaurado.
    let globalCustom: DRELinha[] = []
    try {
      const raw = localStorage.getItem(customLinhasKey(currentUserId))
      if (raw) globalCustom = JSON.parse(raw)
    } catch { /* ignore */ }

    const viewLinhas  = view.customLinhas ?? []
    const globalNomes = new Set(globalCustom.map(l => l.nome))
    // Linhas presentes na visão mas ausentes no estado global → view-only (temporárias)
    const viewOnly = viewLinhas.filter(l => !globalNomes.has(l.nome))

    const dbLinhas = dreLinhas.filter(l => (l.id ?? 0) > 0)
    let allLinhas: DRELinha[] = [...dbLinhas, ...globalCustom, ...viewOnly]

    if (view.linhaOrdem) {
      const orderMap = new Map(view.linhaOrdem.map(({ id, ordem }) => [id, ordem]))
      allLinhas = allLinhas.map(l => orderMap.has(l.id) ? { ...l, ordem: orderMap.get(l.id)! } : l)
    }
    allLinhas.sort((a, b) => a.ordem - b.ordem)
    setDreLinhas(allLinhas)
    setOrderChanged(false)

    setActiveView(view.name)
    try { localStorage.setItem(activeKey(currentUserId), view.name) } catch { /* ignore */ }
  }

  function deleteView(name: string) {
    const next = savedViews.filter(v => v.name !== name)
    setSavedViews(next)
    if (activeView === name) setActiveView('')
    try {
      localStorage.setItem(storageKey(currentUserId), JSON.stringify(next))
      localStorage.removeItem(activeKey(currentUserId))
    } catch { /* ignore */ }
  }

  function clearExclusions() {
    setExclusions(new Set())
    setSelCentros([])
    setActiveView('')
    // Restore global base state (removes view-only lines from memory)
    const dbLinhas = dreLinhas.filter(l => (l.id ?? 0) > 0)
    let globalCustom: DRELinha[] = []
    try {
      const raw = localStorage.getItem(customLinhasKey(currentUserId))
      if (raw) globalCustom = JSON.parse(raw)
    } catch { /* ignore */ }
    let allLinhas = [...dbLinhas, ...globalCustom]
    try {
      const orderRaw = localStorage.getItem(customOrderKey(currentUserId))
      if (orderRaw) {
        const orderMap = new Map<number, number>(
          (JSON.parse(orderRaw) as Array<{ id: number; ordem: number }>).map(({ id, ordem }) => [id, ordem])
        )
        allLinhas = allLinhas.map(l => orderMap.has(l.id) ? { ...l, ordem: orderMap.get(l.id)! } : l)
      }
    } catch { /* ignore */ }
    allLinhas.sort((a, b) => a.ordem - b.ordem)
    setDreLinhas(allLinhas)
    setOrderChanged(false)
    try { localStorage.removeItem(activeKey(currentUserId)) } catch { /* ignore */ }
  }

  const exclusionCount     = exclusions.size
  const customLinhasCount  = dreLinhas.filter(l => (l.id ?? 0) < 0).length
  const hasCustomizations  = exclusionCount > 0 || selCentros.length > 0 || customLinhasCount > 0 || orderChanged

  // ── Custom linhas storage helper ─────────────────────────────────────────────
  function saveCustomLinhasToStorage(linhas: DRELinha[]) {
    const custom = linhas.filter(l => (l.id ?? 0) < 0)
    try {
      localStorage.setItem(customLinhasKey(currentUserId), JSON.stringify(custom))
    } catch { /* ignore */ }
  }

  // ── Drag & drop handlers ─────────────────────────────────────────────────────
  function handleDragStart(nome: string) {
    dragItemRef.current = nome
  }

  function handleDrop(targetNome: string) {
    if (!dragItemRef.current || dragItemRef.current === targetNome) {
      setDragOver(null); return
    }
    const from = dreLinhas.findIndex(l => l.nome === dragItemRef.current)
    const to   = dreLinhas.findIndex(l => l.nome === targetNome)
    if (from < 0 || to < 0) { setDragOver(null); return }
    const next = [...dreLinhas]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setDreLinhas(next.map((l, i) => ({ ...l, ordem: (i + 1) * 10 })))
    setOrderChanged(true)
    setDragOver(null)
    dragItemRef.current = null
  }

  // ── Save order ───────────────────────────────────────────────────────────────
  async function saveDreLinhaOrder() {
    setSavingOrder(true)
    try {
      // Persist ordering per-user in localStorage
      const orderData = dreLinhas.map(l => ({ id: l.id, ordem: l.ordem }))
      localStorage.setItem(customOrderKey(currentUserId), JSON.stringify(orderData))
      // Only persist custom lines' new ordem globally when no view is active
      if (!activeView) saveCustomLinhasToStorage(dreLinhas)
      setOrderChanged(false)
    } catch { /* ignore */ } finally {
      setSavingOrder(false)
    }
  }

  function resetLineModal() {
    setEditingLinhaId(null)
    setNewLineName('')
    setNewLineIsAnalise(false)
    setNewLineFormulaType('percent_of_line')
    setNewLineRefNome('')
    setNewLinePercent('-5')
    setNewLineValue('')
    setNewLineNumeradorNome('')
    setNewLineDenomNome('')
    setNewLineMultANome('')
    setNewLineMultBNome('')
  }

  function openEditModal(linha: DRELinha) {
    const fg = linha.formula_gerencial
    setEditingLinhaId(linha.id)
    setNewLineName(linha.nome)
    setNewLineIsAnalise(linha.isAnalise ?? false)
    if (!fg) {
      setNewLineFormulaType('fixed')
      setNewLineValue('0')
    } else if (fg.type === 'percent_of_line') {
      setNewLineFormulaType('percent_of_line')
      setNewLineRefNome(fg.ref_nome)
      setNewLinePercent(String(fg.percent))
    } else if (fg.type === 'divide_lines') {
      setNewLineFormulaType('divide_lines')
      setNewLineNumeradorNome(fg.numerator_nome)
      setNewLineDenomNome(fg.denominator_nome)
    } else if (fg.type === 'multiply_lines') {
      setNewLineFormulaType('multiply_lines')
      setNewLineMultANome(fg.line_a_nome)
      setNewLineMultBNome(fg.line_b_nome)
    } else if (fg.type === 'fixed') {
      setNewLineFormulaType('fixed')
      setNewLineValue(String(fg.value))
    }
    setShowAddLineModal(true)
  }

  // ── Add / update calculated line ─────────────────────────────────────────────
  async function addCalculatedLine() {
    if (!newLineName.trim()) return
    setAddingLine(true)
    try {
      let formula_gerencial: FormulaGerencial
      if (newLineFormulaType === 'percent_of_line') {
        formula_gerencial = { type: 'percent_of_line', ref_nome: newLineRefNome, percent: parseFloat(newLinePercent) || 0 }
      } else if (newLineFormulaType === 'divide_lines') {
        formula_gerencial = { type: 'divide_lines', numerator_nome: newLineNumeradorNome, denominator_nome: newLineDenomNome }
      } else if (newLineFormulaType === 'multiply_lines') {
        formula_gerencial = { type: 'multiply_lines', line_a_nome: newLineMultANome, line_b_nome: newLineMultBNome }
      } else {
        formula_gerencial = { type: 'fixed', value: parseFloat(newLineValue) || 0 }
      }

      let updated: DRELinha[]
      if (editingLinhaId !== null) {
        // Update existing line — preserve id and ordem
        updated = dreLinhas.map(l => l.id === editingLinhaId
          ? { ...l, nome: newLineName.trim(), formula_gerencial, isAnalise: newLineIsAnalise }
          : l)
      } else {
        const maxOrdem = dreLinhas.length ? Math.max(...dreLinhas.map(l => l.ordem)) : 0
        const newLinha: DRELinha = {
          id: -(Date.now()),
          nome: newLineName.trim(),
          tipo: 'calculada',
          sinal: 1,
          formula_grupos: '[]',
          formula_sinais: '[]',
          negrito: 1,
          separador: 0,
          ordem: maxOrdem + 10,
          formula_gerencial,
          isAnalise: newLineIsAnalise,
        }
        updated = [...dreLinhas, newLinha]
      }

      setDreLinhas(updated)
      if (!activeView) saveCustomLinhasToStorage(updated)
      setShowAddLineModal(false)
      resetLineModal()
    } finally {
      setAddingLine(false)
    }
  }

  // ── Delete calculated line ───────────────────────────────────────────────────
  async function deleteCalculatedLine(id: number) {
    if (id < 0) {
      // Local-only line: remove from state and localStorage (only if no view active)
      const updated = dreLinhas.filter(l => l.id !== id)
      setDreLinhas(updated)
      if (!activeView) saveCustomLinhasToStorage(updated)
    } else {
      // DB-saved line: call API (requires master on backend)
      try {
        const r = await fetch(`/api/dre/linhas?id=${id}`, { method: 'DELETE' })
        if (r.ok) setDreLinhas(prev => prev.filter(l => l.id !== id))
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 md:px-6 py-3 md:py-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="page-title text-2xl md:text-3xl">DRE Gerencial</h1>
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
          {hasCustomizations && (
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
          <YearFilter periodos={periodos} selYear={selYear} onChange={handleYearChange} />
          <Button variant="outline" size="sm" onClick={exportXLSX}><Download size={13} /> Excel</Button>
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
          {(exclusionCount > 0 || selCentros.length > 0) && (
            <button
              onClick={clearExclusions}
              className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors"
              title="Limpar exclusões e centros"
            >
              <RotateCcw size={12} />
            </button>
          )}
          {orderChanged && (
            <button onClick={saveDreLinhaOrder} disabled={savingOrder}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[#E2C98A] bg-[#FBF7EE] text-[#6B4E18] hover:bg-[#FBF7EE]/80 disabled:opacity-50 transition-colors">
              <Save size={12} />
              {savingOrder ? 'Salvando...' : 'Salvar Ordem'}
            </button>
          )}
          <button onClick={() => setShowAddLineModal(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-dashed border-[#E2C98A] text-[#B8924A] hover:border-[#B8924A] hover:bg-[#FBF7EE] transition-colors">
            <Plus size={12} />
            Nova Linha
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 md:min-h-0 md:overflow-hidden">

        {/* Filter Sidebar */}
        <aside className="w-full md:w-52 flex-shrink-0 bg-white border-b md:border-b-0 md:border-r border-gray-200 md:overflow-y-auto space-y-3">
          {/* Mobile toggle */}
          <button
            onClick={() => setFilterMobileExpanded(v => !v)}
            className="md:hidden w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Filter size={11} /> Filtros
              {(selDepts.length + selCentros.length + selPeriods.length) > 0 && (
                <span className="ml-1 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {selDepts.length + selCentros.length + selPeriods.length}
                </span>
              )}
            </span>
            <ChevronDown size={14} className={cn('text-gray-400 transition-transform', filterMobileExpanded && 'rotate-180')} />
          </button>
          <div className={cn(filterMobileExpanded ? 'block' : 'hidden', 'md:block p-3 space-y-3')}>
          <Card>
            <CardContent className="p-3 space-y-3">
              <p className="hidden md:flex text-xs font-semibold text-gray-500 uppercase tracking-wide items-center gap-1">
                <Filter size={11} /> Filtros
              </p>
              {deptUser ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    {(deptUser.departments?.length ?? 0) > 1 ? 'Departamentos' : 'Departamento'}
                  </p>
                  {(deptUser.departments?.length ?? 0) > 1 ? (
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {deptUser.departments!.map(d => (
                        <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                          <input type="checkbox" checked={selDepts.includes(d)}
                            onChange={e => setSelDepts(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))}
                            className="w-3 h-3 accent-gray-800" />
                          <span className="text-xs text-gray-700 font-medium truncate">{d}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(deptUser.departments ?? (deptUser.department ? [deptUser.department] : [])).map(d => (
                        <span key={d} className="text-xs text-gray-700 font-semibold px-1 py-0.5 bg-gray-50 rounded">{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Departamentos</p>
                  <div className="space-y-0.5 max-h-36 overflow-y-auto">
                    {departamentos.map(d => (
                      <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={selDepts.includes(d)}
                          onChange={e => setSelDepts(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))}
                          className="w-3 h-3 accent-gray-800" />
                        <span className="text-xs text-gray-600 truncate">{d || '—'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {selDepts.length > 0 && centrosDisp.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <ChevronRight size={10} /> Centros de Custo
                  </p>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto pl-2 border-l-2 border-gray-100">
                    {centrosDisp.map(c => (
                      <label key={c.cc} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={selCentros.includes(c.cc)}
                          onChange={e => setSelCentros(prev => e.target.checked ? [...prev, c.cc] : prev.filter(x => x !== c.cc))}
                          className="w-3 h-3 accent-gray-800" />
                        <span className="text-xs text-gray-600 truncate" title={c.nome}>{c.nome || c.cc}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Períodos</p>
                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  {periodsByYear.map(([year, months]) => {
                    const selInYear = months.filter(m => selPeriods.includes(m))
                    const allSel  = selInYear.length === months.length
                    const someSel = selInYear.length > 0
                    const isOpen  = expandedYears.has(year)
                    return (
                      <div key={year}>
                        <div className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-gray-50 cursor-pointer select-none"
                          onClick={() => setExpandedYears(prev => { const s = new Set(prev); s.has(year) ? s.delete(year) : s.add(year); return s })}>
                          {isOpen ? <ChevronDown size={10} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={10} className="text-gray-400 flex-shrink-0" />}
                          <input type="checkbox" checked={allSel}
                            ref={el => { if (el) el.indeterminate = someSel && !allSel }}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setSelPeriods(prev => e.target.checked ? [...new Set([...prev, ...months])] : prev.filter(p => !months.includes(p)))}
                            className="w-3 h-3 accent-gray-800 flex-shrink-0" />
                          <span className="text-xs font-semibold text-gray-700">{year}</span>
                          {someSel && <span className="ml-auto text-[10px] text-gray-600 tabular-nums">{selInYear.length}/{months.length}</span>}
                        </div>
                        {isOpen && (
                          <div className="ml-4 space-y-0.5">
                            {months.map(m => (
                              <label key={m} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                                <input type="checkbox" checked={selPeriods.includes(m)}
                                  onChange={e => setSelPeriods(prev => e.target.checked ? [...prev, m] : prev.filter(x => x !== m))}
                                  className="w-3 h-3 accent-gray-800" />
                                <span className="text-xs text-gray-600">{formatPeriodo(m)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {selPeriods.length > 0 && (
                  <button onClick={() => setSelPeriods([])}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1 mt-1">
                    <X size={10} /> Limpar períodos
                  </button>
                )}
              </div>
              {(selDepts.length > 0 || selCentros.length > 0) && (
                <button onClick={() => { setSelDepts([]); setSelCentros([]) }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1">
                  <X size={10} /> Limpar filtros dept
                </button>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visualização</p>
              <div className="flex flex-col gap-1">
                <button onClick={expandAll} className="text-xs text-gray-700 hover:text-gray-800 text-left px-1">Expandir todos</button>
                <button onClick={collapseAll} className="text-xs text-gray-700 hover:text-gray-800 text-left px-1">Recolher todos</button>
              </div>
            </CardContent>
          </Card>
          </div>{/* end mobile collapse */}
        </aside>

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

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 space-y-3">
          {/* View mode toggle + active filter badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-gray-100 border border-gray-200 rounded-lg p-0.5 gap-0.5">
              {([['total', 'Consolidado'], ['periodo', 'Mensal'], ['trimestre', 'Trimestral'], ['comparativo', 'Comparativo'], ['cascata', 'Cascata']] as const).map(([v, label]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === v ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-white')}>
                  {label}
                </button>
              ))}
            </div>
            {(selDepts.length > 0 || selPeriods.length > 0 || selCentros.length > 0) && (
              <div className="flex flex-wrap gap-1 ml-2">
                {selDepts.map(d => <Badge key={d} variant="secondary" className="gap-1">{d}<button onClick={() => setSelDepts(p => p.filter(x => x !== d))}><X size={9} /></button></Badge>)}
                {selCentros.map(c => {
                  const nome = centrosDisp.find(x => x.cc === c)?.nome ?? c
                  return <Badge key={c} variant="secondary" className="gap-1 bg-gray-50 text-gray-700 border-gray-200">{nome}<button onClick={() => setSelCentros(p => p.filter(x => x !== c))}><X size={9} /></button></Badge>
                })}
                {selPeriods.map(p => <Badge key={p} variant="outline" className="gap-1">{formatPeriodo(p)}<button onClick={() => setSelPeriods(prev => prev.filter(x => x !== p))}><X size={9} /></button></Badge>)}
              </div>
            )}
            {exclusionCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 ml-auto">
                <EyeOff size={12} className="flex-shrink-0" />
                <span>{exclusionCount} {exclusionCount === 1 ? 'item excluído' : 'itens excluídos'}{activeView && <strong className="ml-1">— {activeView}</strong>}</span>
              </div>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center h-40">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ── Consolidado ── */}
          {!loading && viewMode === 'total' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="w-7 px-1" />
                      <th className="text-left px-5 py-3 font-medium text-gray-500">Demonstrativo Gerencial</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Vlr. Orçado</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Vlr. Realizado</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">Var. Orçado x Real</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-500">% Var.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRows.map((row, i) => {
                      const calcLinha = row.isCalculated ? dreLinhas.find(l => l.nome === row.name && l.tipo === 'calculada') : null
                      const isDivide   = calcLinha?.formula_gerencial?.type === 'divide_lines'
                      const isDragTarget = dragOver === row.name
                      const fmtVal = (v: number) => isDivide ? formatPct(v * 100) : formatCurrency(v)
                      return (
                      <tr key={i}
                        onDragOver={row.depth === 0 ? e => { e.preventDefault(); setDragOver(row.name) } : undefined}
                        onDrop={row.depth === 0 ? () => handleDrop(row.name) : undefined}
                        onDragEnd={() => { setDragOver(null); dragItemRef.current = null }}
                        className={cn(
                          'border-b transition-colors',
                          row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50',
                          row.isCalculated && !row.isAnalise && 'border-l-2 border-[#B8924A] bg-[#FBF7EE]/40',
                          row.isAnalise && 'border-l-2 border-[#6B4E18] bg-[#FBF7EE]/60',
                          isDragTarget && 'ring-2 ring-inset ring-[#B8924A] bg-[#FBF7EE]',
                        )}>
                        <td className="px-1 py-2 text-center w-7">
                          {row.depth === 0 && (
                            <span
                              draggable
                              onDragStart={() => handleDragStart(row.name)}
                              className="text-gray-300 cursor-grab active:cursor-grabbing inline-flex"
                            >
                              <GripVertical size={13} />
                            </span>
                          )}
                        </td>
                        <td className={cn('px-5 py-2.5', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-800' : row.isAccount ? 'text-gray-500 text-xs' : 'text-gray-700')}
                          style={{ paddingLeft: `${20 + row.depth * 24}px` }}>
                          <div className="flex items-center gap-1.5">
                            {row.isGroup && !row.isSubtotal && !row.isCalculated ? (
                              <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                {expanded.has(row.agrupamento || row.name) ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                              </button>
                            ) : <span className="w-5" />}
                            {row.isCalculated && !row.isAnalise && <Calculator size={12} className="flex-shrink-0" style={{ color: '#B8924A' }} />}
                            {row.isAnalise && <Calculator size={12} className="flex-shrink-0" style={{ color: '#6B4E18' }} />}
                            <span className={row.isAnalise ? 'italic text-[#6B4E18]' : ''}>{row.name}</span>
                            {row.isCalculated && calcLinha && ((calcLinha.id ?? 0) < 0 || isMaster) && (
                              <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                                <button onClick={e => { e.stopPropagation(); openEditModal(calcLinha) }}
                                  className="text-gray-300 hover:text-[#B8924A] transition-colors" title="Editar linha">
                                  <Pencil size={11} />
                                </button>
                                <button onClick={e => { e.stopPropagation(); deleteCalculatedLine(calcLinha.id) }}
                                  className="text-gray-300 hover:text-red-400 transition-colors" title="Remover linha">
                                  <Trash2 size={11} />
                                </button>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={cn('px-5 py-2.5 text-right', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-800' : 'text-gray-600', (row.isAnalise ? 'text-[#6B4E18]' : ''))}>{fmtVal(row.budget)}</td>
                        <td className={cn('px-5 py-2.5 text-right', row.isSubtotal ? 'font-bold text-gray-900' : row.isGroup ? 'font-medium text-gray-800' : 'text-gray-600', (row.isAnalise ? 'text-[#6B4E18]' : ''))}>{fmtVal(row.razao)}</td>
                        <td className={cn('px-5 py-2.5 text-right font-semibold', row.isAnalise ? 'text-[#B8924A]' : colorForVariance(row.variacao))}>{fmtVal(row.variacao)}</td>
                        <td className="px-5 py-2.5 text-right">
                          {!isDivide && <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', bgColorForVariance(row.variacao))}>{formatPct(row.variacao_pct)}</span>}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Mensal ── */}
          {!loading && viewMode === 'periodo' && (
            <Card>
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100">
                <p className="text-xs text-gray-400">{dataPeriods.length} período(s)</p>
                <div className="flex bg-gray-100 rounded-md p-0.5 gap-0.5">
                  {([['compact', 'Compacto'], ['full', 'Completo']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setPeriodView(v)}
                      className={cn('px-2.5 py-1 rounded text-xs font-medium transition-colors', periodView === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                {periodView === 'compact' ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[220px]">Demonstrativo</th>
                        {dataPeriods.map(p => <th key={p} className="text-center px-1.5 py-2 font-medium text-gray-400 text-xs border-l-2 border-black min-w-[68px]">{formatPeriodo(p).replace(' ', '\u00a0')}</th>)}
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs border-l border-gray-200 bg-gray-50">Orçado</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">Realizado</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">Var.</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatRows.map((row, i) => {
                        const totB = dataPeriods.reduce((s, p) => s + (row.byPeriod[p]?.budget ?? 0), 0)
                        const totR = dataPeriods.reduce((s, p) => s + (row.byPeriod[p]?.razao  ?? 0), 0)
                        const totV = totR - totB
                        const totP = safePct(totV, totB)
                        return (
                          <tr key={i} className={cn('border-b transition-colors', row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50')}>
                            <td className={cn('px-4 py-2 sticky left-0 bg-white z-10', row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80' : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80' : 'text-gray-700')} style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                              <div className="flex items-center gap-1">
                                {row.isGroup && !row.isSubtotal ? (
                                  <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                    {expanded.has(row.agrupamento || row.name) ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                                  </button>
                                ) : <span className="w-4" />}
                                <span className="truncate">{row.name}</span>
                              </div>
                            </td>
                            {dataPeriods.map(p => {
                              const cell = row.byPeriod[p] ?? { budget: 0, razao: 0 }
                              const v = cell.razao - cell.budget
                              const pct = safePct(v, cell.budget)
                              const hasData = cell.budget !== 0 || cell.razao !== 0
                              return (
                                <td key={p} className="px-1 py-2 text-center border-l-2 border-black">
                                  {hasData ? (
                                    <span title={`Orç: ${formatCurrency(cell.budget)}\nReal: ${formatCurrency(cell.razao)}\nVar: ${formatCurrency(v)}`}
                                      className={cn('inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[52px] text-center', bgColorForVariance(v), colorForVariance(v))}>
                                      {formatPct(pct)}
                                    </span>
                                  ) : <span className="text-gray-200 text-xs">—</span>}
                                </td>
                              )
                            })}
                            <td className={cn('px-3 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(totB)}</td>
                            <td className={cn('px-3 py-2 text-right text-xs', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(totR)}</td>
                            <td className={cn('px-3 py-2 text-right text-xs font-semibold', colorForVariance(totV))}>{formatCurrency(totV)}</td>
                            <td className="px-3 py-2 text-right text-xs"><span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', bgColorForVariance(totV))}>{formatPct(totP)}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[240px]">Demonstrativo Gerencial</th>
                        {dataPeriods.map(p => <th key={p} colSpan={3} className="text-center px-1 py-2 font-medium text-gray-600 border-l-2 border-black bg-gray-50">{formatPeriodo(p)}</th>)}
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
                        <tr key={i} className={cn('border-b transition-colors', row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50')}>
                          <td className={cn('px-4 py-2 sticky left-0 bg-white z-10', row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80' : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80' : 'text-gray-700')} style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                            <div className="flex items-center gap-1">
                              {row.isGroup && !row.isSubtotal ? (
                                <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                  {expanded.has(row.agrupamento || row.name) ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
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
                                <td className={cn('px-2 py-2 text-right text-xs border-l-2 border-black', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(cell.budget)}</td>
                                <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(cell.razao)}</td>
                                <td className={cn('px-2 py-2 text-right text-xs font-semibold border-l border-gray-200', colorForVariance(v))}>{formatCurrency(v)}</td>
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

          {/* ── Trimestral ── */}
          {!loading && viewMode === 'trimestre' && (() => {
            const allQ = sortQuarterLabels([...new Set(dataPeriods.map(p => toQuarterLabel(p)))])
            return (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[220px]">Demonstrativo Gerencial</th>
                        {allQ.map(q => <th key={q} colSpan={3} className="text-center px-1 py-2 font-medium text-gray-600 border-l-2 border-black bg-gray-50">{q}</th>)}
                      </tr>
                      <tr className="border-b bg-gray-50/50">
                        <th className="sticky left-0 bg-gray-50/50 z-10" />
                        {allQ.map(q => (
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
                          <tr key={i} className={cn('border-b transition-colors', row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50')}>
                            <td className={cn('px-4 py-2 sticky left-0 bg-white z-10', row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80' : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80' : 'text-gray-700')} style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                              <div className="flex items-center gap-1">
                                {row.isGroup && !row.isSubtotal ? (
                                  <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                    {expanded.has(row.agrupamento || row.name) ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                                  </button>
                                ) : <span className="w-4" />}
                                <span className="truncate">{row.name}</span>
                              </div>
                            </td>
                            {allQ.map(q => {
                              const cell = byQ[q] ?? { budget: 0, razao: 0 }
                              const v = cell.razao - cell.budget
                              return (
                                <React.Fragment key={q}>
                                  <td className={cn('px-2 py-2 text-right text-xs border-l-2 border-black', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(cell.budget)}</td>
                                  <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(cell.razao)}</td>
                                  <td className={cn('px-2 py-2 text-right text-xs font-semibold border-l border-gray-200', colorForVariance(v))}>{formatCurrency(v)}</td>
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

          {/* ── Comparativo ── */}
          {!loading && viewMode === 'comparativo' && (() => {
            const monthOpts = dataPeriods
            const quarterOpts = sortQuarterLabels([...new Set(dataPeriods.map(p => toQuarterLabel(p)))])
            const yearOpts = [...new Set(dataPeriods.map(p => p.split('-')[0]))].sort()
            const options = compMode === 'mes' ? monthOpts : compMode === 'trimestre' ? quarterOpts : yearOpts
            const fmtOpt = (o: string) => compMode === 'mes' ? formatPeriodo(o) : o
            const getVals = (row: TreeNode, key: string): { budget: number; razao: number } => {
              if (compMode === 'mes') return row.byPeriod[key] ?? { budget: 0, razao: 0 }
              if (compMode === 'trimestre') { const byQ = groupByQuarter(row.byPeriod); return byQ[key] ?? { budget: 0, razao: 0 } }
              let b = 0, r = 0
              for (const [p, v] of Object.entries(row.byPeriod)) { if (p.startsWith(key + '-')) { b += v.budget; r += v.razao } }
              return { budget: b, razao: r }
            }
            const hasSel = compA && compB && compA !== compB
            return (
              <div className="space-y-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex bg-gray-100 rounded-md p-0.5 gap-0.5">
                        {([['mes', 'Mês'], ['trimestre', 'Trimestre'], ['ano', 'Ano']] as const).map(([v, l]) => (
                          <button key={v} onClick={() => { setCompMode(v); setCompA(''); setCompB('') }}
                            className={cn('px-3 py-1.5 rounded text-xs font-medium transition-colors', compMode === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>{l}</button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={compA} onChange={e => setCompA(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-gray-500">
                          <option value="">Período A</option>
                          {options.map(o => <option key={o} value={o}>{fmtOpt(o)}</option>)}
                        </select>
                        <span className="text-sm font-medium text-gray-400">vs</span>
                        <select value={compB} onChange={e => setCompB(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-gray-500">
                          <option value="">Período B</option>
                          {options.map(o => <option key={o} value={o}>{fmtOpt(o)}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
                        <span className="text-xs text-gray-400 mr-1">Rápido:</span>
                        {compMode === 'mes' && monthOpts.length >= 2 && <button onClick={() => { setCompA(monthOpts[monthOpts.length-1]); setCompB(monthOpts[monthOpts.length-2]) }} className="text-xs px-2.5 py-1 rounded-lg bg-[#FBF7EE] text-[#6B4E18] hover:bg-[#FBF7EE]/80 font-medium">MoM</button>}
                        {compMode === 'trimestre' && quarterOpts.length >= 2 && <button onClick={() => { setCompA(quarterOpts[quarterOpts.length-1]); setCompB(quarterOpts[quarterOpts.length-2]) }} className="text-xs px-2.5 py-1 rounded-lg bg-[#FBF7EE] text-[#6B4E18] hover:bg-[#FBF7EE]/80 font-medium">QoQ</button>}
                        {compMode === 'ano' && yearOpts.length >= 2 && <button onClick={() => { setCompA(yearOpts[yearOpts.length-1]); setCompB(yearOpts[yearOpts.length-2]) }} className="text-xs px-2.5 py-1 rounded-lg bg-[#FBF7EE] text-[#6B4E18] hover:bg-[#FBF7EE]/80 font-medium">YoY</button>}
                      </div>
                      {hasSel && <Badge variant="secondary" className="text-xs">{fmtOpt(compA)} vs {fmtOpt(compB)}</Badge>}
                    </div>
                  </CardContent>
                </Card>
                {hasSel ? (
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left px-4 py-2 font-medium text-gray-500 sticky left-0 bg-gray-50 z-10 min-w-[220px]">Demonstrativo Gerencial</th>
                            <th colSpan={2} className="text-center px-2 py-2 font-medium text-gray-700 border-l-2 border-gray-200 bg-gray-50/50">{fmtOpt(compA)}</th>
                            <th colSpan={2} className="text-center px-2 py-2 font-medium text-emerald-600 border-l-2 border-emerald-200 bg-emerald-50/50">{fmtOpt(compB)}</th>
                            <th colSpan={2} className="text-center px-2 py-2 font-medium text-gray-600 border-l-2 border-black bg-gray-100/50">Variação (A vs B)</th>
                          </tr>
                          <tr className="border-b bg-gray-50/50">
                            <th className="sticky left-0 bg-gray-50/50 z-10" />
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-gray-200">Orçado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-emerald-200">Orçado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l-2 border-black">Δ Realizado</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-400 text-xs border-l border-gray-200">% Var.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {flatRows.map((row, i) => {
                            const vA = getVals(row, compA), vB = getVals(row, compB)
                            const delta = vA.razao - vB.razao
                            const deltaPct = safePct(delta, vB.razao)
                            return (
                              <tr key={i} className={cn('border-b transition-colors', row.isGroup ? 'bg-gray-50/80 hover:bg-gray-100/80' : 'border-gray-50 hover:bg-gray-50')}>
                                <td className={cn('px-4 py-2 sticky left-0 bg-white z-10', row.isSubtotal ? 'font-bold text-gray-900 bg-gray-50/80' : row.isGroup ? 'font-medium text-gray-800 bg-gray-50/80' : 'text-gray-700')} style={{ paddingLeft: `${16 + row.depth * 20}px` }}>
                                  <div className="flex items-center gap-1">
                                    {row.isGroup && !row.isSubtotal ? (
                                      <button onClick={() => toggleExpand(row.agrupamento || row.name)} className="p-0.5 hover:bg-gray-200 rounded">
                                        {expanded.has(row.agrupamento || row.name) ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                                      </button>
                                    ) : <span className="w-4" />}
                                    <span className="truncate">{row.name}</span>
                                  </div>
                                </td>
                                <td className={cn('px-2 py-2 text-right text-xs border-l-2 border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(vA.budget)}</td>
                                <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(vA.razao)}</td>
                                <td className={cn('px-2 py-2 text-right text-xs border-l-2 border-emerald-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(vB.budget)}</td>
                                <td className={cn('px-2 py-2 text-right text-xs border-l border-gray-200', row.isSubtotal ? 'font-bold' : row.isGroup ? 'font-medium text-gray-700' : 'text-gray-600')}>{formatCurrency(vB.razao)}</td>
                                <td className={cn('px-2 py-2 text-right text-xs font-semibold border-l-2 border-black', colorForVariance(delta))}>{formatCurrency(delta)}</td>
                                <td className="px-2 py-2 text-right border-l border-gray-200"><span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', bgColorForVariance(delta))}>{formatPct(deltaPct)}</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <Card><CardContent className="p-10 text-center text-gray-400 text-sm">Selecione dois períodos diferentes para comparar.</CardContent></Card>
                )}
              </div>
            )
          })()}

          {/* ── Cascata ── */}
          {!loading && viewMode === 'cascata' && dreLinhas.length > 0 && <WaterfallChart tree={tree} dreLinhas={dreLinhas} />}
          {!loading && viewMode === 'cascata' && dreLinhas.length === 0 && (
            <Card><CardContent className="p-10 text-center text-gray-400 text-sm">Importe a estrutura da DRE para visualizar o gráfico de cascata.</CardContent></Card>
          )}
        </main>
      </div>

      {/* Add Line Modal */}
      {showAddLineModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setShowAddLineModal(false); resetLineModal() }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-1 flex items-center gap-2" style={{ color: '#1A1820' }}>
              {editingLinhaId !== null ? <Pencil size={15} style={{ color: '#B8924A' }} /> : <Calculator size={15} style={{ color: '#B8924A' }} />}
              {editingLinhaId !== null ? 'Editar Linha Gerencial' : 'Nova Linha Gerencial'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">Adiciona uma linha calculada visível apenas nesta DRE Gerencial.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Nome da linha</label>
                <input type="text" value={newLineName} onChange={e => setNewLineName(e.target.value)}
                  placeholder="Ex: Margem Bruta"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
              </div>

              {/* Tipo: Valor vs Análise */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Tipo de linha</label>
                <div className="flex gap-2">
                  <button onClick={() => setNewLineIsAnalise(false)}
                    className={cn('flex-1 text-xs py-1.5 rounded-lg border transition-colors',
                      !newLineIsAnalise ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                    Valor (soma ao resultado)
                  </button>
                  <button onClick={() => setNewLineIsAnalise(true)}
                    className={cn('flex-1 text-xs py-1.5 rounded-lg border transition-colors',
                      newLineIsAnalise ? 'bg-[#1A1820] text-[#B8924A] border-[rgba(184,146,74,0.3)]' : 'border-[#E4DFD5] text-[#1A1820] hover:border-[#B8924A]')}>
                    Análise (só exibição)
                  </button>
                </div>
                {newLineIsAnalise && <p className="text-[11px] mt-0.5" style={{ color: '#B8924A', opacity: 0.7 }}>Não afeta subtotais. Ideal para margens e índices.</p>}
              </div>

              {/* Tipo de fórmula */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Fórmula</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['percent_of_line', 'divide_lines', 'multiply_lines', 'fixed'] as const).map(t => (
                    <button key={t} onClick={() => setNewLineFormulaType(t)}
                      className={cn('text-xs py-1.5 rounded-lg border transition-colors',
                        newLineFormulaType === t ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {t === 'percent_of_line' ? '% de linha' : t === 'divide_lines' ? 'A ÷ B' : t === 'multiply_lines' ? 'A × B' : 'Valor fixo'}
                    </button>
                  ))}
                </div>
              </div>

              {newLineFormulaType === 'percent_of_line' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Linha de referência</label>
                    <select value={newLineRefNome} onChange={e => setNewLineRefNome(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
                      <option value="">Selecione...</option>
                      {dreLinhas.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Percentual (%)</label>
                    <input type="number" value={newLinePercent} onChange={e => setNewLinePercent(e.target.value)}
                      placeholder="-5"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
                    <p className="text-[11px] text-gray-400 mt-0.5">Use negativo para deduções (ex: -5 para -5%)</p>
                  </div>
                </>
              )}

              {newLineFormulaType === 'divide_lines' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Numerador (linha A)</label>
                    <select value={newLineNumeradorNome} onChange={e => setNewLineNumeradorNome(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
                      <option value="">Selecione...</option>
                      {dreLinhas.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Denominador (linha B)</label>
                    <select value={newLineDenomNome} onChange={e => setNewLineDenomNome(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
                      <option value="">Selecione...</option>
                      {dreLinhas.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-400">Resultado exibido em %. Ex: Resultado Bruto ÷ Receita = Margem Bruta.</p>
                </>
              )}

              {newLineFormulaType === 'multiply_lines' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Linha A</label>
                    <select value={newLineMultANome} onChange={e => setNewLineMultANome(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
                      <option value="">Selecione...</option>
                      {dreLinhas.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Linha B</label>
                    <select value={newLineMultBNome} onChange={e => setNewLineMultBNome(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
                      <option value="">Selecione...</option>
                      {dreLinhas.map(l => <option key={l.id} value={l.nome}>{l.nome}</option>)}
                    </select>
                  </div>
                </>
              )}

              {newLineFormulaType === 'fixed' && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Valor (R$)</label>
                  <input type="number" value={newLineValue} onChange={e => setNewLineValue(e.target.value)}
                    placeholder="Ex: -1000000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => { setShowAddLineModal(false); resetLineModal() }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <Button onClick={addCalculatedLine} disabled={!newLineName.trim() || addingLine}
                className="bg-gray-900 text-white hover:bg-gray-700 text-sm px-4 py-2">
                {editingLinhaId !== null ? <Pencil size={13} className="mr-1.5" /> : <Plus size={13} className="mr-1.5" />}
                {addingLine ? 'Salvando...' : editingLinhaId !== null ? 'Salvar' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-1">Salvar visão gerencial</h3>
            <p className="text-xs text-gray-500 mb-2">Salva um preset com nome para reutilizar depois. O preset inclui:</p>
            <ul className="text-xs text-gray-400 mb-4 space-y-0.5 pl-3">
              {exclusionCount > 0 && <li>· {exclusionCount} {exclusionCount === 1 ? 'exclusão' : 'exclusões'} de linha/agrupamento/conta</li>}
              {selCentros.length > 0 && <li>· {selCentros.length} {selCentros.length === 1 ? 'centro de custo' : 'centros de custo'} selecionado{selCentros.length === 1 ? '' : 's'}</li>}
              {!deptUser && selDepts.length > 0 && <li>· {selDepts.length} {selDepts.length === 1 ? 'departamento' : 'departamentos'} selecionado{selDepts.length === 1 ? '' : 's'}</li>}
              {customLinhasCount > 0 && <li>· {customLinhasCount} {customLinhasCount === 1 ? 'linha adicionada' : 'linhas adicionadas'}</li>}
              {orderChanged && <li>· Ordem personalizada das linhas</li>}
              {exclusionCount === 0 && selCentros.length === 0 && customLinhasCount === 0 && !orderChanged && <li>· Configuração atual (sem alterações pendentes)</li>}
            </ul>
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
