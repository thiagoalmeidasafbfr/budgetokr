'use client'
import Image from 'next/image'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [userId, setUserId]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erro ao autenticar')
        return
      }
      if (data.role === 'dept') {
        router.push('/dept')
      } else {
        router.push('/')
      }
      router.refresh()
    } catch {
      setError('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#F7F6F2' }}
    >
      <div className="w-full max-w-sm">

        {/* ── Logo / Wordmark ─────────────────────────────────────────────── */}
        <div className="flex flex-col items-center mb-10">
          <Image src="/logo2.png" alt="Logo" width={360} height={120} style={{ objectFit: 'contain' }} priority />
        </div>

        {/* ── Card ────────────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-8"
          style={{
            backgroundColor: '#FFFFFF',
            border: '0.5px solid #E4DFD5',
            boxShadow: '0 2px 8px rgba(26,24,32,0.04)',
          }}
        >
          <h1
            className="mb-1"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#1A1820',
              letterSpacing: '-0.01em',
            }}
          >
            Entrar
          </h1>
          <p
            className="mb-6"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '11px',
              color: '#B8924A',
              opacity: 0.6,
              letterSpacing: '0.04em',
            }}
          >
            Acesse com seu usuário e senha
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{
                  color: '#1A1820',
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontSize: '10px',
                }}
              >
                Usuário
              </label>
              <input
                type="text"
                value={userId}
                onChange={e => setUserId(e.target.value)}
                required
                autoFocus
                placeholder="ex: financeiro"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
                style={{
                  border: '0.5px solid #E4DFD5',
                  backgroundColor: '#F7F6F2',
                  color: '#1A1820',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#B8924A'; e.currentTarget.style.backgroundColor = '#FFFFFF' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E4DFD5'; e.currentTarget.style.backgroundColor = '#F7F6F2' }}
              />
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{
                  color: '#1A1820',
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontSize: '10px',
                }}
              >
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none transition-all"
                style={{
                  border: '0.5px solid #E4DFD5',
                  backgroundColor: '#F7F6F2',
                  color: '#1A1820',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#B8924A'; e.currentTarget.style.backgroundColor = '#FFFFFF' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E4DFD5'; e.currentTarget.style.backgroundColor = '#F7F6F2' }}
              />
            </div>

            {error && (
              <div
                className="flex items-center gap-2 text-sm rounded-lg px-3.5 py-2.5"
                style={{
                  backgroundColor: 'rgba(185,28,28,0.06)',
                  border: '0.5px solid rgba(185,28,28,0.2)',
                  color: '#B91C1C',
                }}
              >
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-2"
              style={{
                backgroundColor: '#1A1820',
                color: '#B8924A',
                border: '0.5px solid rgba(184,146,74,0.3)',
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: '0.08em',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#0C0B0F' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.backgroundColor = '#1A1820' }}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Autenticando...' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <p
          className="text-center mt-5"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.15em',
            color: '#B8924A',
            opacity: 0.4,
            textTransform: 'uppercase',
          }}
        >
          © 2026 Glorioso Finance · Rio de Janeiro
        </p>
      </div>
    </div>
  )
}
