'use client'
import { useState, useEffect } from 'react'
import { Search, Plus, Trash2, Edit2, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UnidadeNegocio } from '@/lib/types'

const FIELDS: Array<{ key: keyof UnidadeNegocio; label: string; required?: boolean }> = [
  { key: 'id_cc_cc',          label: 'ID CC- CC',         required: true },
  { key: 'management_report', label: 'Management Report' },
  { key: 'conta',             label: 'Conta' },
  { key: 'centros_custo',     label: 'Centros de Custos' },
  { key: 'unidade',           label: 'Unidade' },
]

export default function UnidadesNegocioPage() {
  const [rows,    setRows]    = useState<UnidadeNegocio[]>([])
  const [q,       setQ]       = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [form,    setForm]    = useState<Partial<UnidadeNegocio>>({})
  const [loading, setLoading] = useState(false)

  const load = async (search = q) => {
    setLoading(true)
    const res = await fetch(`/api/dimensoes?tipo=unidades_negocio&q=${encodeURIComponent(search)}`)
    setRows(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.id_cc_cc?.trim()) return
    await fetch('/api/dimensoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'unidades_negocio', ...form }) })
    setEditing(null); setForm({})
    load()
  }

  const remove = async (key: string) => {
    if (!confirm('Remover?')) return
    await fetch(`/api/dimensoes?tipo=unidades_negocio&key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    load()
  }

  const startEdit = (row: UnidadeNegocio) => { setEditing(row.id_cc_cc); setForm({ ...row }) }
  const startNew  = () => { setEditing('new'); setForm({}) }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title text-2xl md:text-3xl">Unidades de Negócio</h1>
          <p className="text-sm mt-0.5" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#B8924A", opacity: 0.55, letterSpacing: "0.04em" }}>{rows.length} registros · Ligação via ID CC- CC</p>
        </div>
        <Button size="sm" onClick={startNew}><Plus size={14} /> Adicionar</Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => { setQ(e.target.value); load(e.target.value) }} placeholder="Buscar…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400" />
      </div>

      {editing !== null && (
        <Card className="ring-1 ring-gray-100">
          <CardContent className="p-4">
            <p className="font-medium text-gray-800 mb-3">{editing === 'new' ? 'Nova Unidade de Negócio' : 'Editar'}</p>
            <div className="grid grid-cols-3 gap-3">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}{f.required && ' *'}</label>
                  <input value={form[f.key] ?? ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    disabled={f.required && editing !== 'new'}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button size="sm" onClick={save}><Check size={13} /> Salvar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              {FIELDS.map(f => <th key={f.key} className="text-left px-4 py-2.5 font-medium text-gray-500 whitespace-nowrap">{f.label}</th>)}
              <th className="w-16" />
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center py-8 text-gray-400"><div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>}
              {!loading && rows.map(row => (
                <tr key={row.id_cc_cc} className="border-b border-gray-50 hover:bg-gray-50 group transition-colors">
                  {FIELDS.map(f => <td key={f.key} className="px-4 py-2.5 text-gray-700">{row[f.key] || <span className="text-gray-300">—</span>}</td>)}
                  <td className="px-2 py-2 text-right">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(row)} className="p-1 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 size={12} /></button>
                      <button onClick={() => remove(row.id_cc_cc)} className="p-1 text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Nenhum registro. Importe via <a href="/upload" className="text-gray-600 underline">Upload</a> ou adicione manualmente.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
