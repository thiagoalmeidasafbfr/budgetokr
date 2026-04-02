'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import { History, ChevronLeft, ChevronRight, Filter } from 'lucide-react'

interface AuditRow {
  id: number; tabela: string; registro_id: number | null
  acao: string; campo: string | null
  valor_anterior: string | null; valor_novo: string | null
  usuario: string | null; created_at: string
}

const ACAO_COLORS: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
}

export default function AuditPage() {
  const [rows, setRows]     = useState<AuditRow[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [pages, setPages]   = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterTabela, setFilterTabela] = useState('')
  const [filterAcao, setFilterAcao] = useState('')

  const load = (pg = 1) => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(pg) })
    if (filterTabela) p.set('tabela', filterTabela)
    if (filterAcao) p.set('acao', filterAcao)
    fetch(`/api/audit?${p}`)
      .then(r => r.json())
      .then(data => {
        setRows(data.rows ?? [])
        setTotal(data.total ?? 0)
        setPages(data.pages ?? 1)
        setPage(pg)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [filterTabela, filterAcao])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title text-2xl md:text-3xl flex items-center gap-2">
          <History size={22} className="text-gray-600" /> Audit Trail
        </h1>
        <p className="text-sm mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#9B6E20", letterSpacing: "0.04em" }}>Histórico de alterações em lançamentos</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <Filter size={14} className="text-gray-400" />
            <select value={filterTabela} onChange={e => setFilterTabela(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-400">
              <option value="">Todas as tabelas</option>
              <option value="lancamentos">Lançamentos</option>
              <option value="capex">CAPEX</option>
            </select>
            <select value={filterAcao} onChange={e => setFilterAcao(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-400">
              <option value="">Todas as ações</option>
              <option value="INSERT">Insert</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>
            <span className="text-xs text-gray-400">{total} registros</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Nenhum registro de auditoria</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Data</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Usuário</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Ação</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Tabela</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">ID</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Campo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Anterior</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Novo</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-xs font-medium">{r.usuario ?? '—'}</td>
                      <td className="px-4 py-2">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ACAO_COLORS[r.acao] ?? 'bg-gray-100 text-gray-600')}>
                          {r.acao}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{r.tabela}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 font-mono">{r.registro_id ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{r.campo ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-red-500 max-w-[200px] truncate" title={r.valor_anterior ?? ''}>
                        {r.valor_anterior ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-emerald-600 max-w-[200px] truncate" title={r.valor_novo ?? ''}>
                        {r.valor_novo ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t">
              <button onClick={() => load(page - 1)} disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-600"><ChevronLeft size={14} /></button>
              <span className="text-xs text-gray-500">Página {page} de {pages}</span>
              <button onClick={() => load(page + 1)} disabled={page >= pages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-600"><ChevronRight size={14} /></button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
