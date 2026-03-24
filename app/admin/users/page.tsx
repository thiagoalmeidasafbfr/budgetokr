'use client'
import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Pencil, Trash2, X, Check, Eye, EyeOff, RefreshCw } from 'lucide-react'
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
                    onDelete={handleDelete} saving={saving} />
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
                    onDelete={handleDelete} saving={saving} />
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

  function UserRow({ user, onEdit, confirmDel, setConfirmDel, onDelete, saving }: {
    user: AppUser
    onEdit: (u: AppUser) => void
    confirmDel: number | null
    setConfirmDel: (id: number | null) => void
    onDelete: (id: number) => void
    saving: boolean
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
