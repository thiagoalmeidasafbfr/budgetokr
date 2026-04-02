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
    <div
      className="flex items-center justify-between px-3 md:px-6 py-2 flex-shrink-0"
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '0.5px solid #E4DFD5',
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={toggleMobileMenu}
        className="md:hidden p-2 rounded-lg transition-colors"
        style={{ color: '#6B4E18' }}
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      <div className="relative ml-auto" ref={ref}>
        {/* Trigger button */}
        <button
          onClick={() => { setOpen(v => !v); setAdding(false) }}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
          )}
          style={isCurrentFav
            ? {
                backgroundColor: '#FBF7EE',
                color: '#B8924A',
                border: '0.5px solid #E2C98A',
              }
            : favs.length > 0
            ? {
                backgroundColor: '#F7F6F2',
                color: '#6B4E18',
                border: '0.5px solid #E4DFD5',
              }
            : {
                color: '#B8924A',
                opacity: 0.6,
                border: '0.5px solid transparent',
              }
          }
        >
          <Star size={14} fill={isCurrentFav ? 'currentColor' : 'none'} />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.04em',
            }}
          >
            {isCurrentFav ? 'Favoritado' : 'Favoritar'}
          </span>
          {favs.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-bold"
              style={isCurrentFav
                ? { backgroundColor: '#FBF7EE', color: '#6B4E18', border: '0.5px solid #E2C98A' }
                : { backgroundColor: '#F7F6F2', color: '#B8924A', border: '0.5px solid #E4DFD5' }
              }
            >
              {favs.length}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute top-full right-0 mt-1.5 z-50 rounded-xl shadow-xl w-72 overflow-hidden"
            style={{
              backgroundColor: '#FFFFFF',
              border: '0.5px solid #E4DFD5',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: '0.5px solid #E4DFD5' }}
            >
              <div className="flex items-center gap-1.5">
                <Bookmark size={13} style={{ color: '#B8924A' }} />
                <span
                  className="text-xs font-semibold"
                  style={{ color: '#1A1820', fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  Favoritos
                </span>
              </div>
              <button
                onClick={() => { setAdding(true); setNome('') }}
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: '#B8924A' }}
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>

            {/* Add form */}
            {adding && (
              <div
                className="px-3 py-2"
                style={{
                  borderBottom: '0.5px solid #E4DFD5',
                  backgroundColor: '#FBF7EE',
                }}
              >
                <p className="text-[11px] mb-1.5 truncate" style={{ color: '#6B4E18' }}>
                  📌 {currentUrl}
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Nome do favorito…"
                    onKeyDown={e => { if (e.key === 'Enter') addFav(); if (e.key === 'Escape') setAdding(false) }}
                    className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                    style={{
                      border: '0.5px solid #E2C98A',
                      backgroundColor: '#FFFFFF',
                      color: '#1A1820',
                    }}
                    autoFocus
                  />
                  <button
                    onClick={addFav}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                    style={{ backgroundColor: '#1A1820', color: '#B8924A' }}
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setAdding(false)}
                    className="px-1 transition-colors"
                    style={{ color: '#B8924A' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            <div className="max-h-56 overflow-y-auto">
              {favs.length === 0 && !adding && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Star size={22} style={{ color: '#E4DFD5' }} />
                  <p className="text-xs" style={{ color: '#B8924A', opacity: 0.5 }}>Nenhum favorito salvo ainda</p>
                  <button
                    onClick={() => setAdding(true)}
                    className="text-xs font-medium transition-colors"
                    style={{ color: '#B8924A' }}
                  >
                    + Adicionar esta página
                  </button>
                </div>
              )}
              {favs.map(f => (
                <div
                  key={f.id}
                  className="flex items-center gap-2.5 group px-3 py-2 transition-colors"
                  style={{ borderBottom: '0.5px solid rgba(228,223,213,0.5)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FBF7EE')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Star size={12} className="flex-shrink-0" fill="currentColor" style={{ color: '#B8924A' }} />
                  <Link
                    href={f.url}
                    className="flex-1 text-sm truncate transition-colors"
                    style={{ color: '#1A1820' }}
                    onClick={() => setOpen(false)}
                  >
                    {f.nome}
                  </Link>
                  <span
                    className="text-[10px] truncate max-w-[80px] hidden group-hover:block"
                    style={{ color: '#B8924A', opacity: 0.4, fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {f.url}
                  </span>
                  <button
                    onClick={e => removeFav(f.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-0.5"
                    style={{ color: '#B91C1C' }}
                  >
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
