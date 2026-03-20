'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, ChevronDown, Filter, X, Download, Upload, RefreshCw, ChevronsUpDown, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPct, formatPeriodo, colorForVariance, bgColorForVariance, cn } from '@/lib/utils'

interface TreeNode {
  numero: string
  nome: string
  nivel: number
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
  contaCount: number
  agrupamento: string
  dre: string
  children: TreeNode[]
}

interface PlanoData {
  tree: TreeNode[]
  maxLevel: number
  totalContas: number
  departamentos: string[]
  periodos: string[]
}

export default function PlanoContasPage() {
  const [data, setData]             = useState<PlanoData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [selDepts, setSelDepts]     = useState<string[]>([])
  const [selPeriods, setSelPeriods] = useState<string[]>([])
  const [expandLevel, setExpandLevel] = useState(1)
  const [search, setSearch]         = useState('')
  const [editingNumero, setEditingNumero] = useState<string | null>(null)
  const [editingName, setEditingName]     = useState('')
  const [importing, setImporting]         = useState(false)
  const [importMsg, setImportMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const editRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async (depts: string[], periods: string[]) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (depts.length) params.set('departamentos', depts.join(','))
    if (periods.length) params.set('periodos', periods.join(','))
    const res = await fetch(`/api/plano-contas?${params}`)
    if (res.ok) {
      const d = await res.json()
      setData(d)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData([], []) }, [loadData])

  const applyFilters = () => loadData(selDepts, selPeriods)

  // Expand/collapse
  const toggle = (numero: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(numero)) next.delete(numero)
      else next.add(numero)
      return next
    })
  }

  const expandToLevel = (level: number) => {
    if (!data) return
    const toExpand = new Set<string>()
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.nivel < level && n.children.length > 0) {
          toExpand.add(n.numero)
          walk(n.children)
        }
      }
    }
    walk(data.tree)
    setExpanded(toExpand)
    setExpandLevel(level)
  }

  const collapseAll = () => { setExpanded(new Set()); setExpandLevel(1) }

  // Inline name editing
  const startEditing = (numero: string, currentName: string) => {
    setEditingNumero(numero)
    setEditingName(currentName)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  const saveAccountName = async () => {
    if (!editingNumero) return
    const trimmed = editingName.trim()
    try {
      await fetch('/api/plano-contas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_conta_contabil: editingNumero, nome_conta_contabil: trimmed }),
      })
      // Update tree locally without full reload
      if (data) {
        const updateNode = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map(n => ({
            ...n,
            nome: n.numero === editingNumero ? trimmed : n.nome,
            children: updateNode(n.children),
          }))
        setData({ ...data, tree: updateNode(data.tree) })
      }
    } catch (e) {
      console.error('Erro ao salvar nome:', e)
    }
    setEditingNumero(null)
  }

  const cancelEditing = () => {
    setEditingNumero(null)
    setEditingName('')
  }

  // Flatten tree for rendering
  const flattenTree = (nodes: TreeNode[], depth: number = 0, parentMatch: boolean = false): Array<TreeNode & { depth: number; hasChildren: boolean; isExpanded: boolean; visible: boolean }> => {
    const result: Array<TreeNode & { depth: number; hasChildren: boolean; isExpanded: boolean; visible: boolean }> = []
    for (const node of nodes) {
      const hasChildren = node.children.length > 0
      const isExpanded = expanded.has(node.numero)
      const matchesSearch = !search ||
        node.numero.toLowerCase().includes(search.toLowerCase()) ||
        node.nome.toLowerCase().includes(search.toLowerCase())
      const visible = !search || matchesSearch || parentMatch

      if (visible || hasChildren) {
        result.push({ ...node, depth, hasChildren, isExpanded, visible })
      }

      if (hasChildren && (isExpanded || search)) {
        result.push(...flattenTree(node.children, depth + 1, matchesSearch || parentMatch))
      }
    }
    return result
  }

  const rows = data ? flattenTree(data.tree).filter(r => r.visible) : []

  // Totals (sum of root nodes only)
  const totals = data?.tree.reduce(
    (acc, n) => ({ budget: acc.budget + n.budget, razao: acc.razao + n.razao }),
    { budget: 0, razao: 0 }
  ) ?? { budget: 0, razao: 0 }
  const totalVariacao = totals.razao - totals.budget

  // CSV export
  const exportCSV = () => {
    if (!data) return
    const header = ['Nível', 'Número', 'Nome', 'Agrupamento', 'DRE', 'Budget', 'Razão', 'Variação', '%']
    const allRows = flattenTree(data.tree)
    const csvRows = allRows.map(r => [
      r.nivel, r.numero, r.nome, r.agrupamento, r.dre,
      r.budget, r.razao, r.variacao, r.variacao_pct.toFixed(2)
    ])
    const csv = [header, ...csvRows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `plano-contas-${Date.now()}.csv`; a.click()
  }

  // CSV import
  const handleImportCSV = async (file: File) => {
    setImporting(true)
    setImportMsg(null)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) {
        setImportMsg({ type: 'err', text: 'CSV vazio ou sem dados.' })
        setImporting(false)
        return
      }

      // Parse header to find column indices
      const headerLine = lines[0]
      const sep = headerLine.includes(';') ? ';' : ','
      const parseCSVLine = (line: string) => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
            else inQuotes = !inQuotes
          } else if (ch === sep && !inQuotes) {
            result.push(current.trim())
            current = ''
          } else {
            current += ch
          }
        }
        result.push(current.trim())
        return result
      }

      const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().replace(/['"]/g, ''))
      const iNumero = headers.findIndex(h => h.includes('número') || h.includes('numero'))
      const iNome = headers.findIndex(h => h.includes('nome'))
      const iAgrup = headers.findIndex(h => h.includes('agrupamento'))
      const iDre = headers.findIndex(h => h.includes('dre'))

      if (iNumero === -1) {
        setImportMsg({ type: 'err', text: 'Coluna "Número" não encontrada no CSV.' })
        setImporting(false)
        return
      }

      const rows: Array<{ numero: string; nome: string; agrupamento?: string; dre?: string }> = []
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i])
        const numero = cols[iNumero]?.replace(/['"]/g, '')
        const nome = iNome >= 0 ? cols[iNome]?.replace(/['"]/g, '') : ''
        if (!numero) continue
        rows.push({
          numero,
          nome: nome || '',
          agrupamento: iAgrup >= 0 ? cols[iAgrup]?.replace(/['"]/g, '') : '',
          dre: iDre >= 0 ? cols[iDre]?.replace(/['"]/g, '') : '',
        })
      }

      const res = await fetch('/api/plano-contas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const result = await res.json()
      if (res.ok) {
        setImportMsg({ type: 'ok', text: `${result.updated} contas importadas/atualizadas.` })
        loadData(selDepts, selPeriods) // reload tree
      } else {
        setImportMsg({ type: 'err', text: result.error || 'Erro na importação.' })
      }
    } catch (e) {
      setImportMsg({ type: 'err', text: `Erro: ${e}` })
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plano de Contas</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Análise hierárquica por nível do plano de contas · Budget vs Razão
            {data && <span className="ml-2 text-gray-400">· {data.totalContas} contas · {data.maxLevel} níveis</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData(selDepts, selPeriods)}>
            <RefreshCw size={13} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download size={13} /> Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload size={13} /> {importing ? 'Importando...' : 'Importar CSV'}
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCSV(f) }} />
        </div>
      </div>

      {/* Import feedback */}
      {importMsg && (
        <div className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm',
          importMsg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        )}>
          <span>{importMsg.text}</span>
          <button onClick={() => setImportMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="flex gap-4">
        {/* Sidebar filters */}
        <div className="w-52 flex-shrink-0 space-y-3">
          {/* Expand level control */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <ChevronsUpDown size={11} /> Expandir
              </p>
              <div className="flex flex-wrap gap-1">
                {data && Array.from({ length: data.maxLevel }, (_, i) => i + 1).map(lvl => (
                  <button
                    key={lvl}
                    onClick={() => expandToLevel(lvl)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                      expandLevel === lvl
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'
                    )}
                  >
                    Nv {lvl}
                  </button>
                ))}
                <button
                  onClick={collapseAll}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border bg-white text-gray-400 border-gray-200 hover:border-gray-400"
                >
                  <X size={10} />
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Department filter */}
          {data && data.departamentos.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <Filter size={11} /> Departamentos
                </p>
                <div className="space-y-0.5 max-h-36 overflow-y-auto">
                  {data.departamentos.map(d => (
                    <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selDepts.includes(d)}
                        onChange={e => setSelDepts(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600 truncate">{d}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Period filter */}
          {data && data.periodos.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Períodos</p>
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {data.periodos.map(p => (
                    <label key={p} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selPeriods.includes(p)}
                        onChange={e => setSelPeriods(prev => e.target.checked ? [...prev, p] : prev.filter(x => x !== p))}
                        className="w-3 h-3 accent-indigo-600" />
                      <span className="text-xs text-gray-600">{formatPeriodo(p)}</span>
                    </label>
                  ))}
                </div>
                {(selDepts.length > 0 || selPeriods.length > 0) && (
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" className="flex-1 text-xs h-7" onClick={applyFilters}>
                      Aplicar
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => { setSelDepts([]); setSelPeriods([]); loadData([], []) }}>
                      Limpar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Search */}
          <div className="mb-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por número ou nome da conta..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-[60vh]">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !data || rows.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-400">Nenhuma conta encontrada. Importe as contas contábeis primeiro.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 font-medium" style={{ minWidth: 400 }}>Conta</th>
                        <th className="text-right px-4 py-2.5 font-medium w-32">Budget</th>
                        <th className="text-right px-4 py-2.5 font-medium w-32">Razão</th>
                        <th className="text-right px-4 py-2.5 font-medium w-32">Variação</th>
                        <th className="text-right px-4 py-2.5 font-medium w-20">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const isParent = row.hasChildren
                        const isLeaf = !isParent
                        const levelColors = [
                          'bg-gray-800 text-white',    // nível 1
                          'bg-gray-100 text-gray-800',  // nível 2
                          'bg-gray-50 text-gray-700',   // nível 3
                          '',                            // nível 4
                          '',                            // nível 5+
                        ]
                        const rowBg = row.nivel <= 2 ? levelColors[row.nivel - 1] : ''
                        const isBold = row.nivel <= 2

                        return (
                          <tr
                            key={row.numero}
                            className={cn(
                              'border-b border-gray-100 transition-colors',
                              rowBg,
                              !rowBg && 'hover:bg-gray-50',
                              isLeaf && 'text-gray-600'
                            )}
                          >
                            {/* Conta */}
                            <td className="px-4 py-2">
                              <div
                                className="flex items-center gap-1.5"
                                style={{ paddingLeft: `${(row.depth) * 20}px` }}
                              >
                                {isParent ? (
                                  <button
                                    onClick={() => toggle(row.numero)}
                                    className={cn(
                                      'w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0',
                                      row.nivel === 1 ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'
                                    )}
                                  >
                                    {row.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                ) : (
                                  <span className="w-5 flex-shrink-0" />
                                )}
                                <span className={cn(
                                  'font-mono text-xs flex-shrink-0',
                                  row.nivel === 1 ? 'text-white/60' : 'text-gray-400'
                                )}>
                                  {row.numero}
                                </span>
                                {editingNumero === row.numero ? (
                                  <input
                                    ref={editRef}
                                    value={editingName}
                                    onChange={e => setEditingName(e.target.value)}
                                    onBlur={saveAccountName}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveAccountName()
                                      if (e.key === 'Escape') cancelEditing()
                                    }}
                                    className="border border-indigo-400 rounded px-1.5 py-0.5 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[200px]"
                                    placeholder="Nome da conta..."
                                  />
                                ) : (
                                  <span
                                    className={cn(
                                      'truncate group/name',
                                      isBold && 'font-semibold',
                                      row.nivel === 1 && 'text-white',
                                      !row.nome && 'cursor-pointer'
                                    )}
                                    onClick={() => !row.nome && startEditing(row.numero, '')}
                                  >
                                    {row.nome || <span className="italic text-gray-300 hover:text-indigo-400">sem nome — clique para editar</span>}
                                    {row.nome && (
                                      <button
                                        onClick={e => { e.stopPropagation(); startEditing(row.numero, row.nome) }}
                                        className={cn(
                                          'inline-flex ml-1.5 opacity-0 group-hover/name:opacity-100 transition-opacity',
                                          row.nivel === 1 ? 'text-white/50 hover:text-white' : 'text-gray-300 hover:text-indigo-500'
                                        )}
                                      >
                                        <Pencil size={11} />
                                      </button>
                                    )}
                                  </span>
                                )}
                                {isParent && row.contaCount > 0 && (
                                  <Badge variant="secondary" className={cn(
                                    'ml-1 text-[10px] px-1.5 py-0',
                                    row.nivel === 1 && 'bg-white/20 text-white/80'
                                  )}>
                                    {row.contaCount}
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Budget */}
                            <td className={cn('px-4 py-2 text-right tabular-nums', isBold && 'font-semibold')}>
                              {row.budget !== 0 ? formatCurrency(row.budget) : <span className="text-gray-300">—</span>}
                            </td>

                            {/* Razão */}
                            <td className={cn('px-4 py-2 text-right tabular-nums', isBold && 'font-semibold')}>
                              {row.razao !== 0 ? formatCurrency(row.razao) : <span className="text-gray-300">—</span>}
                            </td>

                            {/* Variação */}
                            <td className={cn(
                              'px-4 py-2 text-right tabular-nums',
                              isBold && 'font-semibold',
                              row.variacao !== 0 && (row.nivel === 1
                                ? (row.variacao >= 0 ? 'text-emerald-300' : 'text-red-300')
                                : colorForVariance(row.variacao_pct))
                            )}>
                              {row.variacao !== 0 ? formatCurrency(row.variacao) : <span className="text-gray-300">—</span>}
                            </td>

                            {/* % */}
                            <td className="px-4 py-2 text-right">
                              {row.budget !== 0 && row.variacao !== 0 ? (
                                <span className={cn(
                                  'text-xs px-1.5 py-0.5 rounded-full font-medium',
                                  row.nivel === 1
                                    ? (row.variacao >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')
                                    : bgColorForVariance(row.variacao_pct)
                                )}>
                                  {formatPct(row.variacao_pct)}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-800 text-white font-bold text-sm">
                        <td className="px-4 py-3">Total Geral</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.budget)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totals.razao)}</td>
                        <td className={cn('px-4 py-3 text-right tabular-nums', totalVariacao >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                          {formatCurrency(totalVariacao)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {totals.budget !== 0 && (
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded-full font-medium',
                              totalVariacao >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                            )}>
                              {formatPct(totals.budget ? (totalVariacao / Math.abs(totals.budget)) * 100 : 0)}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
