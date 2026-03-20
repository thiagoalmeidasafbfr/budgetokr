'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Search, ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { YearFilter } from '@/components/YearFilter'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, dateToISO, cn } from '@/lib/utils'
import type { Lancamento } from '@/lib/types'

interface PageData {
  rows: (Lancamento & { departamento?: string; nome_departamento?: string; agrupamento_arvore?: string; dre?: string })[]
  total: number
  page: number
  pages: number
}

type EditingCell = { id: number; field: string } | null

const COLS = [
  { key: 'data_lancamento',          label: 'Data',          width: 'w-24',  type: 'text' },
  { key: 'numero_conta_contabil',    label: 'Nº Conta',       width: 'w-28',  type: 'text' },
  { key: 'nome_conta_contabil',      label: 'Nome Conta',     width: 'w-44',  type: 'text' },
  { key: 'centro_custo',             label: 'CC',             width: 'w-20',  type: 'text' },
  { key: 'departamento',             label: 'Departamento',   width: 'w-36',  type: 'readonly' },
  { key: 'fonte',                    label: 'Fonte',          width: 'w-24',  type: 'text' },
  { key: 'nome_conta_contrapartida', label: 'Contrapartida',  width: 'w-40',  type: 'text' },
  { key: 'observacao',               label: 'Observação',     width: 'w-48',  type: 'text' },
  { key: 'debito_credito',           label: 'D/C (MC)',       width: 'w-28',  type: 'number', align: 'right' },
] as const

type ColKey = typeof COLS[number]['key']

export default function LancamentosPage() {
  const [tipo,        setTipo]        = useState<'budget' | 'razao'>('budget')
  const [data,        setData]        = useState<PageData | null>(null)
  const [page,        setPage]        = useState(1)
  const [q,           setQ]           = useState('')
  const [loading,     setLoading]     = useState(false)
  const [editing,     setEditing]     = useState<EditingCell>(null)
  const [editVal,     setEditVal]     = useState('')
  const [saving,      setSaving]      = useState<number | null>(null)
  const [error,       setError]       = useState('')
  const [allPeriodos, setAllPeriodos] = useState<string[]>([])
  const [selYear,     setSelYear]     = useState<string | null>('2026')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (p = page, search = q, t = tipo, year = selYear) => {
    setLoading(true)
    const params = new URLSearchParams({ tipo: t, page: String(p) })
    if (search) params.set('q', search)
    if (year)   params.set('ano', year)
    const res = await fetch(`/api/lancamentos?${params}`)
    const d   = await res.json()
    if (res.ok) setData(d)
    else setError(d.error)
    setLoading(false)
  }, [page, q, tipo, selYear])

  useEffect(() => { load(1, q, tipo, selYear) }, [tipo, selYear])
  useEffect(() => { inputRef.current?.focus() }, [editing])

  // Load available periods on mount
  useEffect(() => {
    fetch('/api/analise?type=distinct&col=data_lancamento', { cache: 'no-store' })
      .then(r => r.json())
      .then(dates => {
        const periodos = [...new Set((Array.isArray(dates) ? dates : []).map((d: string) => d?.substring(0, 7)).filter(Boolean))].sort() as string[]
        setAllPeriodos(periodos)
      })
      .catch(() => {})
  }, [])

  const handleSearch = (v: string) => { setQ(v); setPage(1); load(1, v, tipo, selYear) }

  const startEdit = (id: number, field: string, val: unknown) => {
    if (field === 'departamento') return // readonly
    setEditing({ id, field })
    // Datas: exibe no formato brasileiro para edição
    setEditVal(field === 'data_lancamento' ? formatDate(String(val ?? '')) : String(val ?? ''))
  }

  const commitEdit = async () => {
    if (!editing) return
    const { id, field } = editing
    setSaving(id)
    setEditing(null)

    let fieldValue: unknown = editVal
    if (field === 'debito_credito')   fieldValue = parseFloat(editVal) || 0
    if (field === 'data_lancamento')  fieldValue = dateToISO(editVal) // BR → ISO

    const body: Record<string, unknown> = { id, [field]: fieldValue }
    const res = await fetch('/api/lancamentos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      const updated = await res.json()
      setData(prev => prev ? { ...prev, rows: prev.rows.map(r => r.id === id ? { ...r, ...updated } : r) } : prev)
    } else {
      setError('Falha ao salvar')
    }
    setSaving(null)
  }

  const cancelEdit = () => setEditing(null)

  const addRow = async () => {
    const res = await fetch('/api/lancamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo }),
    })
    if (res.ok) {
      load(page, q, tipo)
    }
  }

  const deleteRow = async (id: number) => {
    if (!confirm('Remover este lançamento?')) return
    await fetch(`/api/lancamentos?id=${id}`, { method: 'DELETE' })
    load(page, q, tipo)
  }

  const totalBudget = data?.rows.reduce((s, r) => s + (r.debito_credito || 0), 0) ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lançamentos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data?.total.toLocaleString() ?? '—'} registros · Edite clicando em qualquer célula
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <YearFilter periodos={allPeriodos} selYear={selYear} onChange={y => { setSelYear(y); setPage(1) }} />
          <Button onClick={addRow} size="sm"><Plus size={14} /> Nova Linha</Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Tipo toggle */}
        <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
          {(['budget', 'razao'] as const).map(t => (
            <button key={t} onClick={() => { setTipo(t); setPage(1) }}
              className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                tipo === t ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {t === 'budget' ? 'Budget' : 'Razão'}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => handleSearch(e.target.value)} placeholder="Buscar conta, CC, fonte..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>

        <button onClick={() => load(page, q, tipo)} className="p-2 text-gray-400 hover:text-gray-700 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>

        <div className="ml-auto text-sm text-gray-500">
          Total: <span className={cn('font-semibold', totalBudget >= 0 ? 'text-indigo-700' : 'text-red-600')}>
            {formatCurrency(totalBudget)}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2.5 rounded-lg text-sm">
          <AlertCircle size={14} />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {COLS.map(c => (
                  <th key={c.key} className={cn('text-left px-3 py-2.5 font-medium text-gray-500 whitespace-nowrap', c.width, 'align' in c && c.align === 'right' && 'text-right')}>
                    {c.label}
                  </th>
                ))}
                <th className="w-10 px-2" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={COLS.length + 1} className="text-center py-10 text-gray-400">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && data?.rows.length === 0 && (
                <tr><td colSpan={COLS.length + 1} className="text-center py-10 text-gray-400 text-sm">
                  Nenhum lançamento. Importe dados ou adicione uma linha.
                </td></tr>
              )}
              {!loading && data?.rows.map(row => (
                <tr key={row.id} className={cn('border-b border-gray-50 hover:bg-gray-50/50 group transition-colors', saving === row.id && 'opacity-60')}>
                  {COLS.map(col => {
                    const isEditing = editing?.id === row.id && editing?.field === col.key
                    const val = row[col.key as keyof typeof row]
                    const isReadonly = col.type === 'readonly'

                    return (
                      <td key={col.key} className={cn('px-0 py-0', col.width, 'align' in col && col.align === 'right' && 'text-right')}>
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                            type={col.type === 'number' ? 'number' : 'text'}
                            step={col.type === 'number' ? '0.01' : undefined}
                            className="w-full h-full px-3 py-2 text-sm bg-indigo-50 border-0 border-b-2 border-indigo-400 outline-none"
                          />
                        ) : (
                          <div
                            onClick={() => !isReadonly && startEdit(row.id, col.key, val)}
                            className={cn(
                              'px-3 py-2.5 truncate',
                              !isReadonly && 'cursor-pointer hover:bg-indigo-50 rounded transition-colors',
                              isReadonly && 'text-gray-400',
                              col.key === 'debito_credito' && 'text-right font-mono',
                              col.key === 'debito_credito' && (Number(val) >= 0 ? 'text-gray-800' : 'text-red-600'),
                            )}
                          >
                            {col.key === 'debito_credito'
                              ? Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                              : col.key === 'data_lancamento'
                                ? formatDate(String(val ?? ''))
                                : String(val ?? '')}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => deleteRow(row.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              {((page - 1) * 100 + 1).toLocaleString()}–{Math.min(page * 100, data.total).toLocaleString()} de {data.total.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => { const p = page - 1; setPage(p); load(p) }} disabled={page === 1}
                className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-30 transition-colors">
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs text-gray-600 px-2">Página {page} / {data.pages}</span>
              <button onClick={() => { const p = page + 1; setPage(p); load(p) }} disabled={page === data.pages}
                className="p-1.5 rounded-md hover:bg-gray-200 disabled:opacity-30 transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </Card>

      <p className="text-xs text-gray-400">
        Dica: clique em qualquer célula para editar. Pressione Enter para confirmar ou Esc para cancelar. Colunas como Departamento são calculadas automaticamente via Centro de Custo.
      </p>
    </div>
  )
}
