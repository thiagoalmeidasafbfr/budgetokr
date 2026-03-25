'use client'
import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Pencil, Trash2, X, Check, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface AppUser {
  id: number
  username: string
  role: 'master' | 'dept'
  department: string | null
  created_at: string
}

const ROLES = [
  { value: 'master', label: 'Master (Administrador)' },
  { value: 'dept',   label: 'Departamento' },
]

function formatDate(s: string) {
  const d = new Date(s.includes('T') ? s : s + 'Z')
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface FormState {
  username: string
  password: string
  role: 'master' | 'dept'
  department: string
}

const emptyForm = (): FormState => ({ username: '', password: '', role: 'dept', department: '' })

// ─── Modal de Permissões de Centros de Custo ─────────────────────────────────
interface CentrosModalProps {
  user: AppUser
  onClose: () => void
}

function CentrosModal({ user, onClose }: CentrosModalProps) {
  const [allCentros, setAllCentros]   = useState<Array<{ cc: string; nome: string }>>([])
  const [selected,   setSelected]     = useState<Set<string>>(new Set())
  const [configured, setConfigured]   = useState(false)
  const [loading,    setLoading]      = useState(true)
  const [saving,     setSaving]       = useState(false)
  const [error,      setError]        = useState('')
  const [search,     setSearch]       = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const dept = user.department
        const [centrosRes, permRes] = await Promise.all([
          dept
            ? fetch(`/api/dre?type=centros&departamentos=${encodeURIComponent(dept)}`)
            : Promise.resolve(null),
          fetch(`/api/admin/users/centros?username=${encodeURIComponent(user.username)}`),
        ])
        const centrosList = centrosRes?.ok
          ? (await centrosRes.json() as Array<{ cc: string; nome: string }>)
          : []
        setAllCentros(centrosList)

        if (permRes.ok) {
          const perm = await permRes.json() as { centros: string[]; configured: boolean }
          setConfigured(perm.configured)
          setSelected(new Set(perm.centros))
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const filtered = allCentros.filter(c =>
    !search || c.nome.toLowerCase().includes(search.toLowerCase()) || c.cc.toLowerCase().includes(search.toLowerCase())
  )

  const allChecked = allCentros.length > 0 && allCentros.every(c => selected.has(c.cc))
  const someChecked = allCentros.some(c => selected.has(c.cc))

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allCentros.map(c => c.cc)))
    }
  }

  function toggle(cc: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(cc)) next.delete(cc)
      else next.add(cc)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users/centros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, centros: [...selected] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao salvar')
      setConfigured(json.configured)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  function handleRemoveAll() {
    setSelected(new Set())
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[80vh] flex flex-col">
        <CardContent className="p-5 flex flex-col gap-3 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-indigo-500" />
                Permissões de Centros de Custo
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Usuário: <span className="font-medium text-gray-700">{user.username}</span>
                {user.department && <> &middot; Dept: <span className="font-medium text-gray-700">{user.department}</span></>}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          {/* Info box */}
          <div className="text-xs bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-indigo-700 flex-shrink-0">
            {configured
              ? `Restrição ativa: usuário vê apenas ${selected.size} centro(s) selecionado(s).`
              : 'Sem restrição configurada: usuário vê todos os centros do departamento.'}
            {' '}Desmarque todos para remover restrições.
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 flex-shrink-0">{error}</p>}

          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : allCentros.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {user.department ? 'Nenhum centro de custo encontrado para este departamento.' : 'Usuário sem departamento definido.'}
            </p>
          ) : (
            <>
              {/* Search + select-all */}
              <div className="flex gap-2 flex-shrink-0">
                <input
                  type="text"
                  placeholder="Buscar centro..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 text-xs border rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  onClick={toggleAll}
                  className="text-xs px-2.5 py-1.5 border rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
                >
                  {allChecked ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>

              {/* Checkboxes list */}
              <div className="overflow-y-auto flex-1 border rounded-lg divide-y min-h-0">
                {filtered.map(c => (
                  <label
                    key={c.cc}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.cc)}
                      onChange={() => toggle(c.cc)}
                      className="accent-indigo-600 w-3.5 h-3.5 flex-shrink-0"
                    />
                    <span className="text-sm text-gray-800 flex-1">{c.nome}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{c.cc}</span>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Nenhum resultado para &ldquo;{search}&rdquo;</p>
                )}
              </div>

              {/* Counter */}
              <p className="text-xs text-gray-500 flex-shrink-0">
                {selected.size === 0
                  ? 'Nenhum selecionado — acesso a todos os centros do departamento'
                  : `${selected.size} de ${allCentros.length} centros selecionados`}
              </p>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0 pt-1">
            {selected.size > 0 && (
              <button onClick={handleRemoveAll} disabled={saving}
                className="px-3 py-2 text-xs border rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">
                Remover restrições
              </button>
            )}
            <button onClick={onClose} disabled={saving}
              className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-600">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || loading}
              className="flex-1 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
              Salvar
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users,       setUsers]      = useState<AppUser[]>([])
  const [depts,       setDepts]      = useState<string[]>([])
  const [loading,     setLoading]    = useState(true)
  const [saving,      setSaving]     = useState(false)
  const [error,       setError]      = useState('')
  const [showForm,    setShowForm]   = useState(false)
  const [editUser,    setEditUser]   = useState<AppUser | null>(null)
  const [form,        setForm]       = useState<FormState>(emptyForm())
  const [showPwd,     setShowPwd]    = useState(false)
  const [confirmDel,  setConfirmDel] = useState<number | null>(null)
  const [centrosUser, setCentrosUser] = useState<AppUser | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [usersRes, deptsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/dre?type=distinct&col=nome_departamento'),
      ])
      if (!usersRes.ok) throw new Error('Erro ao carregar usuários')
      const { users: u } = await usersRes.json()
      setUsers(u)
      if (deptsRes.ok) {
        const d = await deptsRes.json()
        setDepts(Array.isArray(d) ? d : [])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditUser(null)
    setForm(emptyForm())
    setShowPwd(false)
    setShowForm(true)
  }

  function openEdit(u: AppUser) {
    setEditUser(u)
    setForm({ username: u.username, password: '', role: u.role, department: u.department ?? '' })
    setShowPwd(false)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditUser(null)
    setError('')
  }

  async function handleSave() {
    setError('')
    if (!form.username) { setError('Username é obrigatório'); return }
    if (!editUser && !form.password) { setError('Senha é obrigatória para novo usuário'); return }
    if (form.role === 'dept' && !form.department) { setError('Departamento é obrigatório para usuários de departamento'); return }
    setSaving(true)
    try {
      if (editUser) {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editUser.id, password: form.password || undefined, department: form.department, role: form.role }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Erro ao atualizar')
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: form.username, password: form.password, role: form.role, department: form.department }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Erro ao criar')
      }
      closeForm()
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao deletar')
      setConfirmDel(null)
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const masters = users.filter(u => u.role === 'master')
  const deptUsers = users.filter(u => u.role === 'dept')

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900">Gerenciar Usuários</h1>
          <span className="text-sm text-gray-500 ml-1">({users.length} usuários)</span>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <Plus size={13} /> Novo Usuário
          </button>
        </div>
      </div>

      {error && !showForm && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Modal / Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">
                  {editUser ? `Editar: ${editUser.username}` : 'Novo Usuário'}
                </h2>
                <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>}

              <div className="space-y-3">
                {/* Username */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Username</label>
                  <input
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    disabled={!!editUser}
                    placeholder="ex: joao.silva"
                    className={cn(
                      'w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300',
                      editUser ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                    )}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Senha{editUser && <span className="text-gray-400 font-normal ml-1">(deixe em branco para não alterar)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder={editUser ? 'Nova senha (opcional)' : 'Senha'}
                      className="w-full text-sm border rounded-lg px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <button type="button" onClick={() => setShowPwd(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Role */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Perfil</label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as 'master' | 'dept', department: '' }))}
                    className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>

                {/* Department (only for dept role) */}
                {form.role === 'dept' && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Departamento</label>
                    {depts.length > 0 ? (
                      <select
                        value={form.department}
                        onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                        className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                      >
                        <option value="">Selecione um departamento...</option>
                        {depts.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    ) : (
                      <input
                        value={form.department}
                        onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                        placeholder="Nome do departamento"
                        className="w-full text-sm border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    )}
                  </div>
                )}

                {/* Centros de custo — só aparece ao editar usuário dept existente */}
                {editUser && form.role === 'dept' && (
                  <div className="pt-1 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setCentrosUser(editUser)}
                      className="w-full py-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShieldCheck size={13} /> Configurar Centros de Custo
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={closeForm} disabled={saving}
                  className="flex-1 py-2 text-sm border rounded-lg hover:bg-gray-50 text-gray-600">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                  {editUser ? 'Salvar' : 'Criar Usuário'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de permissões de centros — renderizado após o form para aparecer acima (mesmo z-index, DOM posterior) */}
      {centrosUser && (
        <CentrosModal user={centrosUser} onClose={() => setCentrosUser(null)} />
      )}

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Master users */}
          {masters.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Administradores ({masters.length})</p>
              <div className="space-y-2">
                {masters.map(u => (
                  <UserRow key={u.id} user={u} onEdit={openEdit}
                    confirmDel={confirmDel} setConfirmDel={setConfirmDel}
                    onDelete={handleDelete} saving={saving}
                    onCentros={null} />
                ))}
              </div>
            </div>
          )}

          {/* Dept users */}
          {deptUsers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Usuários de Departamento ({deptUsers.length})</p>
              <div className="space-y-2">
                {deptUsers.map(u => (
                  <UserRow key={u.id} user={u} onEdit={openEdit}
                    confirmDel={confirmDel} setConfirmDel={setConfirmDel}
                    onDelete={handleDelete} saving={saving}
                    onCentros={() => setCentrosUser(u)} />
                ))}
              </div>
            </div>
          )}

          {users.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum usuário cadastrado.</div>
          )}
        </div>
      )}
    </div>
  )

  function UserRow({ user, onEdit, confirmDel, setConfirmDel, onDelete, saving, onCentros }: {
    user: AppUser
    onEdit: (u: AppUser) => void
    confirmDel: number | null
    setConfirmDel: (id: number | null) => void
    onDelete: (id: number) => void
    saving: boolean
    onCentros: (() => void) | null
  }) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-white border rounded-lg hover:border-indigo-200 transition-colors">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
          user.role === 'master' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'
        )}>
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{user.username}</p>
          <p className="text-xs text-gray-500">
            {user.role === 'master' ? 'Administrador' : (user.department || 'Sem departamento')}
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-gray-400">criado em {formatDate(user.created_at)}</span>
          </p>
        </div>
        <span className={cn(
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0',
          user.role === 'master' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
        )}>
          {user.role}
        </span>

        {confirmDel === user.id ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-red-600 font-medium">Confirmar exclusão?</span>
            <button onClick={() => onDelete(user.id)} disabled={saving}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">Sim</button>
            <button onClick={() => setConfirmDel(null)} disabled={saving}
              className="px-2 py-1 text-xs border rounded hover:bg-gray-50">Não</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            {onCentros && (
              <button onClick={onCentros} title="Permissões de centros de custo"
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                <ShieldCheck size={13} />
              </button>
            )}
            <button onClick={() => onEdit(user)} title="Editar"
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={() => setConfirmDel(user.id)} title="Excluir"
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    )
  }
}
