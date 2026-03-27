'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  MessageSquare, ExternalLink, Trash2, Building2, Clock,
  ChevronDown, ChevronUp, Reply, X, CheckCircle2, AlertCircle,
  RefreshCw, Send, Eye
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, getDeptColor } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DREComment {
  id: number
  dre_linha: string
  agrupamento?: string
  conta?: string
  periodo?: string
  tipo_valor?: string
  texto: string
  usuario?: string
  user_role?: string
  departamento?: string
  parent_id?: number | null
  status?: string
  resolved_at?: string
  resolved_by?: string
  resolved_motivo?: string
  filter_state?: string
  created_at: string
  updated_at?: string
  lancamento_id?: number
}

// Group tickets + replies
interface Ticket extends DREComment {
  replies: DREComment[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)   return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
        <CheckCircle2 size={10} /> Encerrado
      </span>
    )
  }
  if (status === 'replied') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600">
        <Reply size={10} /> Respondido
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-600">
      <AlertCircle size={10} /> Aberto
    </span>
  )
}

// Stores full filter context in sessionStorage and navigates to DRE.
// sessionStorage avoids URL encoding issues and works even when already on /dre.
function navigateToDRE(comment: DREComment, router: ReturnType<typeof useRouter>) {
  try {
    const fs = comment.filter_state ? JSON.parse(comment.filter_state as string) : {}
    const depts   = fs.depts?.length   ? fs.depts   : (comment.departamento ? [comment.departamento] : [])
    const periods = fs.periods?.length ? fs.periods : (comment.periodo       ? [comment.periodo]       : [])
    const centros = fs.centros?.length ? fs.centros : []
    const dl: Record<string, unknown> = {
      depts, periods, centros,
      view:        'total',
      expand:      comment.dre_linha   ?? null,
      expandAgrup: comment.agrupamento ?? null,
    }
    // Lancamento comment: open detalhamento and highlight the specific row
    if (comment.lancamento_id && fs.detNode) {
      dl.openDetalhamento      = true
      dl.detNode               = fs.detNode
      dl.highlightLancamentoId = comment.lancamento_id
    }
    sessionStorage.setItem('dre_deeplink', JSON.stringify(dl))
  } catch { /* ignore */ }
  router.push('/dre')
}

// ─── Close Modal ─────────────────────────────────────────────────────────────────

function CloseModal({ ticket, onClose, onConfirm }: {
  ticket: Ticket
  onClose: () => void
  onConfirm: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 mx-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Encerrar Ticket
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm">
          <p className="text-gray-500 text-xs mb-1">{ticket.dre_linha} · {ticket.departamento}</p>
          <p className="text-gray-700">{ticket.texto}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Motivo do encerramento</label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Descreva o motivo do encerramento…"
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            autoFocus
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(motivo)}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5"
          >
            <CheckCircle2 size={13} /> Encerrar Ticket
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ticket Card ─────────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onReply,
  onClose,
  onDelete,
  onRefresh,
  onView,
}: {
  ticket: Ticket
  onReply: (id: number, text: string) => Promise<void>
  onClose: (ticket: Ticket) => void
  onDelete: (id: number) => Promise<void>
  onRefresh: () => void
  onView: (ticket: Ticket) => void
}) {
  const [expanded, setExpanded]   = useState(false)
  const [replying, setReplying]   = useState(false)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving]       = useState(false)

  const hasReplies = ticket.replies.length > 0
  const isClosed   = ticket.status === 'closed'

  const handleReply = async () => {
    if (!replyText.trim()) return
    setSaving(true)
    await onReply(ticket.id, replyText.trim())
    setReplyText('')
    setReplying(false)
    setSaving(false)
    setExpanded(true)
    onRefresh()
  }

  return (
    <div className={cn(
      'border rounded-xl overflow-hidden transition-all',
      isClosed ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white',
    )}>
      {/* Ticket header */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Dot — color per department */}
          <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', getDeptColor(ticket.departamento).dot)} />

          <div className="flex-1 min-w-0">
            {/* Meta row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn('font-semibold text-sm', isClosed ? 'text-gray-500' : 'text-gray-800')}>
                {ticket.dre_linha}
              </span>
              {ticket.periodo && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-50 text-gray-700">
                  {ticket.periodo}
                </span>
              )}
              {ticket.tipo_valor && (
                <span className={cn(
                  'text-xs font-medium px-1.5 py-0.5 rounded',
                  ticket.tipo_valor === 'budget' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                )}>
                  {ticket.tipo_valor === 'budget' ? 'Budget' : 'Realizado'}
                </span>
              )}
              {ticket.lancamento_id && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex items-center gap-1">
                  <ExternalLink size={9} /> Lançamento #{ticket.lancamento_id}
                </span>
              )}
              <StatusBadge status={ticket.status} />
            </div>

            {/* Text */}
            <p className={cn('text-sm', isClosed ? 'text-gray-500' : 'text-gray-700')}>{ticket.texto}</p>

            {/* Footer meta */}
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={10} /> {timeAgo(ticket.created_at)}
              </span>
              {ticket.usuario && <span>por {ticket.usuario}</span>}
              {ticket.replies.length > 0 && (
                <span className="text-blue-400">{ticket.replies.length} resposta{ticket.replies.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {/* Closure info */}
            {isClosed && ticket.resolved_motivo && (
              <div className="mt-2 px-3 py-2 bg-gray-100 rounded-lg text-xs text-gray-500">
                <span className="font-medium">Encerrado por {ticket.resolved_by}</span>
                {ticket.resolved_at && <span> · {timeAgo(ticket.resolved_at)}</span>}
                {ticket.resolved_motivo && <span className="block mt-0.5 italic">"{ticket.resolved_motivo}"</span>}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onView(ticket)}
              title="Ver na DRE com filtros aplicados"
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Eye size={13} />
            </button>
            {!isClosed && (
              <>
                <button
                  onClick={() => { setReplying(v => !v); setExpanded(true) }}
                  title="Responder"
                  className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Reply size={13} />
                </button>
                <button
                  onClick={() => onClose(ticket)}
                  title="Encerrar ticket"
                  className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  <CheckCircle2 size={13} />
                </button>
              </>
            )}
            <button
              onClick={() => onDelete(ticket.id)}
              title="Excluir"
              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} />
            </button>
            {hasReplies && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {expanded && hasReplies && (
        <div className="border-t border-gray-100 bg-slate-50 divide-y divide-gray-100">
          {ticket.replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-3 px-5 py-3">
              <span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-purple-600">Master</span>
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Clock size={9} /> {timeAgo(reply.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{reply.texto}</p>
              </div>
              <button
                onClick={() => onDelete(reply.id)}
                className="p-1 text-red-300 hover:text-red-500 flex-shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reply form */}
      {replying && (
        <div className="border-t border-gray-100 px-4 py-3 bg-blue-50">
          <div className="flex gap-2 items-end">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Escreva sua resposta ao departamento…"
              rows={2}
              className="flex-1 text-sm border border-blue-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleReply() }}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={handleReply}
                disabled={saving || !replyText.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 text-xs font-medium"
              >
                <Send size={11} /> {saving ? '…' : 'Enviar'}
              </button>
              <button
                onClick={() => { setReplying(false); setReplyText('') }}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
              >
                Cancelar
              </button>
            </div>
          </div>
          <p className="text-[10px] text-blue-400 mt-1">Ctrl+Enter para enviar</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────────

export default function CommentsLogPage() {
  const router = useRouter()
  const [tickets, setTickets]     = useState<Ticket[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<'all' | 'open' | 'replied' | 'closed'>('open')
  const [closing, setClosing]     = useState<Ticket | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/dre/comments?context=log')
      .then(r => r.json())
      .then((data: DREComment[]) => {
        if (!Array.isArray(data)) { setLoading(false); return }
        // Build ticket tree: root = no parent_id, replies have parent_id
        const roots   = data.filter(c => !c.parent_id)
        const replies = data.filter(c => !!c.parent_id)
        const tree: Ticket[] = roots.map(r => ({
          ...r,
          replies: replies.filter(rep => rep.parent_id === r.id)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        }))
        tree.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setTickets(tree)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleReply = async (parentId: number, text: string) => {
    // Find ticket to get context
    const ticket = tickets.find(t => t.id === parentId)
    if (!ticket) return
    await fetch('/api/dre/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dre_linha: ticket.dre_linha,
        agrupamento: ticket.agrupamento,
        conta: ticket.conta,
        periodo: ticket.periodo,
        tipo_valor: ticket.tipo_valor ?? 'realizado',
        texto: text,
        parent_id: parentId,
        filter_state: ticket.filter_state ? JSON.parse(ticket.filter_state) : {},
      }),
    })
  }

  const handleClose = async (ticket: Ticket, motivo: string) => {
    await fetch('/api/dre/comments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ticket.id, action: 'close', motivo }),
    })
    setClosing(null)
    load()
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/dre/comments?id=${id}`, { method: 'DELETE' })
    load()
  }

  // Filter
  const filtered = filter === 'all'
    ? tickets
    : tickets.filter(t => t.status === filter)

  // Group by department
  const byDept = filtered.reduce<Record<string, Ticket[]>>((acc, t) => {
    const key = t.departamento || 'Sem departamento'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const counts = {
    all:     tickets.length,
    open:    tickets.filter(t => t.status === 'open').length,
    replied: tickets.filter(t => t.status === 'replied').length,
    closed:  tickets.filter(t => t.status === 'closed').length,
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={22} className="text-gray-600" /> Tickets de Comentários
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Comentários dos departamentos · gerenciamento de tickets</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors" title="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1 w-fit">
        {([
          ['open',    'Abertos',    counts.open],
          ['replied', 'Respondidos', counts.replied],
          ['closed',  'Encerrados', counts.closed],
          ['all',     'Todos',       counts.all],
        ] as const).map(([v, l, c]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
              filter === v ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>
            {l}
            {c > 0 && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-bold',
                filter === v ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500')}>
                {c}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <MessageSquare size={32} className="text-gray-300" />
            <p className="text-gray-400 text-sm">Nenhum ticket encontrado</p>
          </CardContent>
        </Card>
      )}

      {/* Tickets by dept */}
      {!loading && Object.entries(byDept).map(([dept, deptTickets]) => (
        <div key={dept} className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 size={14} className={getDeptColor(dept).text} />
            <span className={cn('text-sm font-semibold', getDeptColor(dept).text)}>{dept}</span>
            <span className="text-xs text-gray-400">{deptTickets.length} ticket{deptTickets.length !== 1 ? 's' : ''}</span>
          </div>
          {deptTickets.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onReply={handleReply}
              onClose={t => setClosing(t)}
              onDelete={handleDelete}
              onRefresh={load}
              onView={t => navigateToDRE(t, router)}
            />
          ))}
        </div>
      ))}

      {/* Close modal */}
      {closing && (
        <CloseModal
          ticket={closing}
          onClose={() => setClosing(null)}
          onConfirm={motivo => handleClose(closing, motivo)}
        />
      )}
    </div>
  )
}
