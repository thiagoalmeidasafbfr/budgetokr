'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, CheckCircle, XCircle, RefreshCw, Shield } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface LogRow {
  id: number
  user_id: string
  role: string | null
  department: string | null
  success: number
  ip: string | null
  user_agent: string | null
  created_at: string
}

interface PageData {
  rows: LogRow[]
  total: number
  page: number
  pages: number
}

function formatDateTime(s: string) {
  if (!s) return '—'
  const d = new Date(s.includes('T') ? s : s + 'Z')
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function shortUA(ua: string | null) {
  if (!ua) return '—'
  // Extract browser name from UA string
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari'
  if (ua.includes('Edg')) return 'Edge'
  return ua.substring(0, 30)
}

export default function LoginLogsPage() {
  const [data,     setData]    = useState<PageData | null>(null)
  const [page,     setPage]    = useState(1)
  const [q,        setQ]       = useState('')
  const [filter,   setFilter]  = useState<'' | '0' | '1'>('')
  const [loading,  setLoading] = useState(false)

  const load = useCallback(async (p = page, search = q, suc = filter) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p) })
    if (search)       params.set('q', search)
    if (suc !== '')   params.set('success', suc)
    const res = await fetch(`/api/admin/login-logs?${params}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [page, q, filter])

  useEffect(() => { load(1, q, filter) }, [filter])
  useEffect(() => { load() }, [])

  const handleSearch = (v: string) => {
    setQ(v)
    setPage(1)
    load(1, v, filter)
  }

  const stats = data ? {
    total:   data.total,
    success: data.rows.filter(r => r.success).length,
    failed:  data.rows.filter(r => !r.success).length,
  } : null

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={22} className="text-gray-600" />
            Log de Acessos
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data?.total.toLocaleString() ?? '—'} tentativas registradas
          </p>
        </div>
        <button onClick={() => load(page, q, filter)} className="p-2 text-gray-400 hover:text-gray-700 transition-colors">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar usuário ou IP..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
          {([['', 'Todos'], ['1', 'Sucesso'], ['0', 'Falha']] as const).map(([val, label]) => (
            <button key={val} onClick={() => { setFilter(val); setPage(1) }}
              className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === val ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {label}
            </button>
          ))}
        </div>

        {stats && (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle size={13} /> {stats.success} nesta página
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <XCircle size={13} /> {stats.failed} falhas
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">Data/Hora</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Usuário</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Perfil</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Departamento</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">IP</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Navegador</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-10">
                  <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </td></tr>
              )}
              {!loading && data?.rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">
                  Nenhum log encontrado.
                </td></tr>
              )}
              {!loading && data?.rows.map(row => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap font-mono text-xs">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{row.user_id}</td>
                  <td className="px-4 py-2.5">
                    {row.role ? (
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                        row.role === 'master' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700')}>
                        {row.role === 'master' ? 'Admin' : 'Dept'}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{row.department || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {row.success ? (
                      <CheckCircle size={16} className="text-emerald-500 mx-auto" />
                    ) : (
                      <XCircle size={16} className="text-red-400 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{row.ip || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{shortUA(row.user_agent)}</td>
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
    </div>
  )
}
