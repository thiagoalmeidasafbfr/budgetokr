'use client'
import { useState, useEffect, useRef } from 'react'
import { Star, Plus, X, Trash2, Bookmark, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMobileMenu } from '@/components/MobileMenuProvider'

interface Favorite { id: number; nome: string; url: string; icone: string; created_at: string }

export function TopBar() {
  const [favs, setFavs]     = useState<Favorite[]>([])
  const [open, setOpen]     = useState(false)
  const [adding, setAdding] = useState(false)
  const [nome, setNome]     = useState('')
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const { toggle: toggleMobileMenu } = useMobileMenu()

  useEffect(() => {
    // Try cache first (1 minute TTL) to avoid redundant fetch on every page navigation
    try {
      const raw = sessionStorage.getItem('_favs')
      if (raw) {
        const { data, ts } = JSON.parse(raw) as { data: Favorite[]; ts: number }
        if (Date.now() - ts < 60_000) { setFavs(data); return }
      }
    } catch { /* ignore */ }
    fetch('/api/favorites').then(r => r.ok ? r.json() : []).then(data => {
      if (Array.isArray(data)) {
        setFavs(data)
        try { sessionStorage.setItem('_favs', JSON.stringify({ data, ts: Date.now() })) } catch { /* ignore */ }
      }
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

  const syncCache = (updated: Favorite[]) => {
    try { sessionStorage.setItem('_favs', JSON.stringify({ data: updated, ts: Date.now() })) } catch { /* ignore */ }
  }

  const addFav = async () => {
    if (!nome.trim()) return
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), url: currentUrl }),
    })
    if (res.ok) {
      const fav = await res.json()
      const updated = [fav, ...favs]
      setFavs(updated)
      syncCache(updated)
      setNome('')
      setAdding(false)
    }
  }

  const removeFav = async (id: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await fetch(`/api/favorites?id=${id}`, { method: 'DELETE' })
    const updated = favs.filter(f => f.id !== id)
    setFavs(updated)
    syncCache(updated)
  }

  return (
    <div className="flex items-center justify-between px-3 md:px-6 py-2 border-b border-border bg-surface flex-shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={toggleMobileMenu}
        className="md:hidden p-2 rounded-md text-muted hover:bg-base-2 hover:text-ink transition-colors"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      <div className="relative ml-auto" ref={ref}>
        {/* Trigger button */}
        <button
          onClick={() => { setOpen(v => !v); setAdding(false) }}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            isCurrentFav
              ? 'bg-gold-bg text-gold-deep hover:bg-gold-bg border border-gold-border'
              : favs.length > 0
              ? 'bg-base-2 text-muted hover:bg-border hover:text-ink'
              : 'text-faint hover:bg-base-2 hover:text-muted'
          )}>
          <Star size={14} fill={isCurrentFav ? 'currentColor' : 'none'} />
          <span>{isCurrentFav ? 'Favoritado' : 'Favoritar'}</span>
          {favs.length > 0 && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-sm font-bold',
              isCurrentFav ? 'bg-gold-bg text-gold-deep' : 'bg-border text-muted'
            )}>
              {favs.length}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full right-0 mt-1.5 z-50 bg-surface border border-border rounded-lg shadow-sm w-72">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-1.5">
                <Bookmark size={13} className="text-muted" />
                <span className="text-xs font-semibold text-ink">Favoritos salvos</span>
              </div>
              <button
                onClick={() => { setAdding(true); setNome('') }}
                className="flex items-center gap-1 text-xs text-muted hover:text-ink font-medium">
                <Plus size={12} /> Adicionar
              </button>
            </div>

            {/* Add form */}
            {adding && (
              <div className="px-3 py-2 border-b border-border bg-base">
                <p className="text-[11px] text-muted mb-1.5 truncate">
                  📌 {currentUrl}
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Nome do favorito…"
                    onKeyDown={e => { if (e.key === 'Enter') addFav(); if (e.key === 'Escape') setAdding(false) }}
                    className="flex-1 text-xs border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold-bg bg-surface text-ink placeholder:text-faint"
                    autoFocus
                  />
                  <button onClick={addFav} className="text-xs bg-gold text-white px-2.5 py-1.5 rounded-md hover:bg-gold-bright font-medium">
                    Salvar
                  </button>
                  <button onClick={() => setAdding(false)} className="text-muted hover:text-ink px-1">
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            <div className="max-h-56 overflow-y-auto">
              {favs.length === 0 && !adding && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Star size={22} className="text-faint" />
                  <p className="text-xs text-muted">Nenhum favorito salvo ainda</p>
                  <button onClick={() => setAdding(true)} className="text-xs text-muted hover:text-ink font-medium">
                    + Adicionar esta página
                  </button>
                </div>
              )}
              {favs.map(f => (
                <div key={f.id} className="flex items-center gap-2.5 group hover:bg-base px-3 py-2 transition-colors">
                  <Star size={12} className="text-gold flex-shrink-0" fill="currentColor" />
                  <Link
                    href={f.url}
                    className="flex-1 text-sm text-ink hover:text-muted truncate"
                    onClick={() => setOpen(false)}>
                    {f.nome}
                  </Link>
                  <span className="text-[10px] text-faint truncate max-w-[80px] hidden group-hover:block">{f.url}</span>
                  <button
                    onClick={e => removeFav(f.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-danger hover:text-danger transition-opacity flex-shrink-0 p-0.5">
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
