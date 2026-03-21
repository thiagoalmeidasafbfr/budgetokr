'use client'
import { useState, useEffect, useRef } from 'react'
import { Star, Plus, X, Trash2, Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Favorite { id: number; nome: string; url: string; icone: string; created_at: string }

export function TopBar() {
  const [favs, setFavs]     = useState<Favorite[]>([])
  const [open, setOpen]     = useState(false)
  const [adding, setAdding] = useState(false)
  const [nome, setNome]     = useState('')
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/favorites').then(r => r.ok ? r.json() : []).then(data => {
      if (Array.isArray(data)) setFavs(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  // Don't show on login page
  if (pathname === '/login') return null

  const currentUrl = typeof window !== 'undefined' ? pathname + window.location.search : pathname
  const isCurrentFav = favs.some(f => f.url === currentUrl || f.url === pathname)

  const addFav = async () => {
    if (!nome.trim()) return
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), url: currentUrl }),
    })
    if (res.ok) {
      const fav = await res.json()
      setFavs(prev => [fav, ...prev])
      setNome('')
      setAdding(false)
    }
  }

  const removeFav = async (id: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await fetch(`/api/favorites?id=${id}`, { method: 'DELETE' })
    setFavs(prev => prev.filter(f => f.id !== id))
  }

  return (
    <div className="flex items-center justify-end px-6 py-2 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
      <div className="relative" ref={ref}>
        {/* Trigger button */}
        <button
          onClick={() => { setOpen(v => !v); setAdding(false) }}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            isCurrentFav
              ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'
              : favs.length > 0
              ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              : 'text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-700'
          )}>
          <Star size={14} fill={isCurrentFav ? 'currentColor' : 'none'} />
          <span>{isCurrentFav ? 'Favoritado' : 'Favoritar'}</span>
          {favs.length > 0 && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-bold',
              isCurrentFav ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300'
            )}>
              {favs.length}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full right-0 mt-1.5 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-xl w-72">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
              <div className="flex items-center gap-1.5">
                <Bookmark size={13} className="text-indigo-500" />
                <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">Favoritos salvos</span>
              </div>
              <button
                onClick={() => { setAdding(true); setNome('') }}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                <Plus size={12} /> Adicionar
              </button>
            </div>

            {/* Add form */}
            {adding && (
              <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700 bg-indigo-50 dark:bg-indigo-950">
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mb-1.5 truncate">
                  📌 {currentUrl}
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Nome do favorito…"
                    onKeyDown={e => { if (e.key === 'Enter') addFav(); if (e.key === 'Escape') setAdding(false) }}
                    className="flex-1 text-xs border border-indigo-200 dark:border-indigo-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-slate-700 dark:text-white"
                    autoFocus
                  />
                  <button onClick={addFav} className="text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 font-medium">
                    Salvar
                  </button>
                  <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600 px-1">
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            <div className="max-h-56 overflow-y-auto">
              {favs.length === 0 && !adding && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Star size={22} className="text-gray-200" />
                  <p className="text-xs text-gray-400">Nenhum favorito salvo ainda</p>
                  <button onClick={() => setAdding(true)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                    + Adicionar esta página
                  </button>
                </div>
              )}
              {favs.map(f => (
                <div key={f.id} className="flex items-center gap-2.5 group hover:bg-gray-50 dark:hover:bg-slate-700 px-3 py-2 transition-colors">
                  <Star size={12} className="text-amber-400 flex-shrink-0" fill="currentColor" />
                  <Link
                    href={f.url}
                    className="flex-1 text-sm text-gray-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-400 truncate"
                    onClick={() => setOpen(false)}>
                    {f.nome}
                  </Link>
                  <span className="text-[10px] text-gray-300 dark:text-slate-600 truncate max-w-[80px] hidden group-hover:block">{f.url}</span>
                  <button
                    onClick={e => removeFav(f.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity flex-shrink-0 p-0.5">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
