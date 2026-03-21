'use client'
import { useState, useEffect, useRef } from 'react'
import { Star, Plus, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Favorite { id: number; nome: string; url: string; filtros: string; icone: string; created_at: string }

export function FavoritesMenu() {
  const [favs, setFavs]   = useState<Favorite[]>([])
  const [open, setOpen]    = useState(false)
  const [adding, setAdding] = useState(false)
  const [nome, setNome]    = useState('')
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/favorites').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setFavs(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const addFav = async () => {
    if (!nome.trim()) return
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), url: pathname + window.location.search }),
    })
    if (res.ok) {
      const fav = await res.json()
      setFavs(prev => [fav, ...prev])
      setNome('')
      setAdding(false)
    }
  }

  const removeFav = async (id: number) => {
    await fetch(`/api/favorites?id=${id}`, { method: 'DELETE' })
    setFavs(prev => prev.filter(f => f.id !== id))
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        title="Favoritos"
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md transition-colors flex-shrink-0',
          favs.length > 0 ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-400 hover:bg-gray-100'
        )}>
        <Star size={13} fill={favs.length > 0 ? 'currentColor' : 'none'} />
        {favs.length > 0 && <span className="text-[10px] font-bold">{favs.length}</span>}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-64 p-2">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Favoritos</span>
            <button onClick={() => setAdding(true)} className="text-indigo-500 hover:text-indigo-700">
              <Plus size={13} />
            </button>
          </div>

          {adding && (
            <div className="flex gap-1 mb-2">
              <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Nome do favorito…"
                onKeyDown={e => e.key === 'Enter' && addFav()}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                autoFocus />
              <button onClick={addFav} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg hover:bg-indigo-700">Salvar</button>
              <button onClick={() => { setAdding(false); setNome('') }} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
            </div>
          )}

          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {favs.length === 0 && !adding && (
              <p className="text-xs text-gray-400 text-center py-3">Nenhum favorito salvo</p>
            )}
            {favs.map(f => (
              <div key={f.id} className="flex items-center gap-2 group hover:bg-indigo-50 rounded-lg px-2 py-1.5">
                <Star size={11} className="text-amber-400 flex-shrink-0" fill="currentColor" />
                <Link href={f.url} className="flex-1 text-xs text-gray-700 truncate hover:text-indigo-700"
                  onClick={() => setOpen(false)}>
                  {f.nome}
                </Link>
                <button onClick={() => removeFav(f.id)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity flex-shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
