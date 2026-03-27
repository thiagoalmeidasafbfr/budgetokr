'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp, Loader2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [userId, setUserId]   = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

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
      // dept users vão para /dept, master vai para /
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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center shadow-md">
            <TrendingUp size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">Glorioso Finance</p>
            <p className="text-xs text-gray-400 dark:text-slate-400 leading-tight">Botafogo F.R.</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-8">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Entrar</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">Acesse com seu usuário e senha</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Usuário
              </label>
              <input
                type="text"
                value={userId}
                onChange={e => setUserId(e.target.value)}
                required
                autoFocus
                placeholder="ex: financeiro"
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all dark:placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all dark:placeholder-slate-400"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-950 rounded-lg px-3.5 py-2.5">
                <AlertCircle size={14} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-4">
          Fale com o administrador para obter acesso
        </p>
      </div>
    </div>
  )
}
