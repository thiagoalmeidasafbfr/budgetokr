'use client'
import { useState, useEffect } from 'react'
import { MessageSquare, ExternalLink, Trash2, Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface DREComment {
  id: number
  dre_linha: string
  agrupamento?: string
  conta?: string
  periodo?: string
  texto: string
  usuario?: string
  user_role?: string
  departamento?: string
  created_at: string
}

export default function CommentsLogPage() {
  const [comments, setComments] = useState<DREComment[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'all' | 'dept' | 'master'>('dept')

  const load = () => {
    setLoading(true)
    fetch('/api/dre/comments')
      .then(r => r.json())
      .then(data => { setComments(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const remove = async (id: number) => {
    await fetch(`/api/dre/comments?id=${id}`, { method: 'DELETE' })
    setComments(prev => prev.filter(c => c.id !== id))
  }

  const filtered = comments.filter(c =>
    filter === 'all' ? true : c.user_role === filter
  )

  // Group by department
  const byDept = filtered.reduce<Record<string, DREComment[]>>((acc, c) => {
    const key = c.user_role === 'master' ? '— Master —' : (c.departamento || 'Sem departamento')
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={22} className="text-indigo-500" /> Log de Comentários
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Todos os comentários feitos na DRE · apenas visível ao master</p>
        </div>
        <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
          {([['dept', 'Departamentos'], ['master', 'Master'], ['all', 'Todos']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                filter === v ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <MessageSquare size={32} className="text-gray-300" />
            <p className="text-gray-400 text-sm">Nenhum comentário encontrado</p>
          </CardContent>
        </Card>
      )}

      {!loading && Object.entries(byDept).map(([dept, cmts]) => (
        <Card key={dept}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 size={15} className={dept === '— Master —' ? 'text-purple-500' : 'text-orange-400'} />
              {dept}
              <span className="text-xs font-normal text-gray-400 ml-1">{cmts.length} comentário{cmts.length !== 1 ? 's' : ''}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {cmts.map(c => (
                <div key={c.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group">
                  <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    c.user_role === 'master' ? 'bg-purple-500' : 'bg-orange-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-800">{c.dre_linha}</span>
                      {c.periodo
                        ? <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{c.periodo}</span>
                        : <span className="text-xs text-gray-300">sem período</span>}
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">{c.texto}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {c.usuario || (c.user_role === 'dept' ? c.departamento : 'master')} · {new Date(c.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {c.departamento && (
                      <Link
                        href={`/dre?depts=${encodeURIComponent(c.departamento)}${c.periodo ? `&periods=${c.periodo}&view=periodo` : ''}`}
                        title={`Ver no DRE${c.periodo ? ` · ${c.periodo}` : ''}`}
                        className="p-1.5 rounded-md text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50">
                        <ExternalLink size={13} />
                      </Link>
                    )}
                    <button onClick={() => remove(c.id)}
                      className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
