'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, TrendingUp, LineChart, GitCompare,
  Target, Layers, FileText, Database, Upload,
  ChevronRight, Building2, BookOpen, LayoutList, Gauge,
  LogOut, User, ListTree, Shield, Landmark, Moon, Sun, History, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/ThemeProvider'

// ─── Types ──────────────────────────────────────────────────────────────────────

type SessionUser = { userId: string; role: 'master' | 'dept'; department?: string }

type NavLink  = { type: 'link';    href: string; icon: React.ElementType; label: string; sublabel?: string; masterOnly?: boolean; deptOnly?: boolean }
type NavGroup = { type: 'group';   icon: React.ElementType; label: string; masterOnly?: boolean; children: { href: string; label: string; icon?: React.ElementType }[] }
type NavSep   = { type: 'section'; label: string; masterOnly?: boolean; deptOnly?: boolean }
type NavItem  = NavLink | NavGroup | NavSep

// ─── Nav config ─────────────────────────────────────────────────────────────────

const nav: NavItem[] = [
  { type: 'section', label: 'Visão Geral', masterOnly: true },
  {
    type: 'link', href: '/',
    icon: LayoutDashboard,
    label: 'Dashboard',
    sublabel: 'Resumo consolidado',
    masterOnly: true,
  },

  { type: 'section', label: 'Análise Financeira' },
  {
    type: 'link', href: '/dre',
    icon: LineChart,
    label: 'DRE',
    sublabel: 'P&L · Resultado',
  },
  {
    type: 'link', href: '/analise',
    icon: GitCompare,
    label: 'Análise',
    sublabel: 'Budget vs Realizado',
  },
  {
    type: 'link', href: '/dept',
    icon: Layers,
    label: 'Por Departamento',
    sublabel: 'KPIs e DRE por área',
  },
  {
    type: 'link', href: '/capex',
    icon: Landmark,
    label: 'CAPEX',
    sublabel: 'Investimentos por projeto',
  },
  {
    type: 'link', href: '/plano-contas',
    icon: ListTree,
    label: 'Plano de Contas',
    sublabel: 'Hierarquia por nível',
    masterOnly: true,
  },

  { type: 'section', label: 'Meus Tickets', deptOnly: true },
  {
    type: 'link', href: '/dept/comments',
    icon: MessageSquare,
    label: 'Comentários',
    sublabel: 'Tickets e respostas',
    deptOnly: true,
  },

  { type: 'section', label: 'KPIs & Medidas', masterOnly: true },
  {
    type: 'link', href: '/kpis',
    icon: Gauge,
    label: 'KPIs',
    sublabel: 'Configurar indicadores',
    masterOnly: true,
  },
  {
    type: 'link', href: '/medidas',
    icon: Target,
    label: 'Medidas Calculadas',
    sublabel: 'Indicadores financeiros',
    masterOnly: true,
  },

  { type: 'section', label: 'Gestão de Dados', masterOnly: true },
  {
    type: 'group', icon: FileText, label: 'Lançamentos', masterOnly: true,
    children: [
      { href: '/lancamentos', label: 'Todos os lançamentos', icon: FileText },
    ],
  },
  {
    type: 'group', icon: Database, label: 'Dimensões', masterOnly: true,
    children: [
      { href: '/dimensoes/centros-custo',    label: 'Centros de Custo',   icon: Building2  },
      { href: '/dimensoes/contas-contabeis', label: 'Contas Contábeis',   icon: BookOpen   },
      { href: '/dimensoes/dre',              label: 'Estrutura DRE',      icon: LayoutList },
    ],
  },
  {
    type: 'link', href: '/upload',
    icon: Upload,
    label: 'Importar Dados',
    sublabel: 'Excel · CSV',
    masterOnly: true,
  },
  {
    type: 'link', href: '/admin/login-logs',
    icon: Shield,
    label: 'Log de Acessos',
    sublabel: 'Histórico de logins',
    masterOnly: true,
  },
  {
    type: 'link', href: '/admin/audit',
    icon: History,
    label: 'Audit Trail',
    sublabel: 'Alterações em dados',
    masterOnly: true,
  },
  {
    type: 'link', href: '/admin/comments',
    icon: MessageSquare,
    label: 'Log de Comentários',
    sublabel: 'Comentários da DRE',
    masterOnly: true,
  },
]

// ─── Component ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Only fetch once on mount — navigation doesn't change the user
    fetch('/api/me')
      .then(r => {
        if (r.status === 401) {
          if (pathname !== '/login' && pathname !== '/logout') router.push('/login')
          setLoaded(true)
          return null
        }
        return r.ok ? r.json() : null
      })
      .then(u => { if (u) setUser(u); setLoaded(true) })
      .catch(() => setLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hide sidebar on login page
  if (pathname === '/login') return null

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const isMaster = user?.role === 'master'

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="w-60 flex-shrink-0 bg-white dark:bg-slate-800 border-r border-gray-100 dark:border-slate-700 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <TrendingUp size={15} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight">Glorioso Finance</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-400 leading-tight">Botafogo F.R.</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto min-h-0">
        {!loaded && (
          <div className="space-y-2 px-3 py-2">
            {[1,2,3,4].map(i => <div key={i} className="h-8 bg-gray-100 dark:bg-slate-700 rounded-lg animate-pulse" />)}
          </div>
        )}
        {loaded && user && nav.map((item, i) => {
          // Esconde itens masterOnly para dept, deptOnly para master
          if (item.masterOnly && !isMaster) return null
          if (item.deptOnly && isMaster) return null

          // ── Section label ──────────────────────────────────────────────────
          if (item.type === 'section') {
            return (
              <div key={i} className={cn('px-3 pt-3 pb-1', i === 0 ? 'pt-1' : '')}>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                  {item.label}
                </p>
              </div>
            )
          }

          // ── Group (collapsible children) ───────────────────────────────────
          if (item.type === 'group') {
            const Icon = item.icon
            const anyActive = item.children.some(c => isActive(c.href))
            return (
              <div key={item.label}>
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-default',
                  anyActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500 dark:text-slate-400'
                )}>
                  <Icon size={13} className={anyActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500'} />
                  <span>{item.label}</span>
                </div>
                <div className="ml-4 border-l border-gray-100 dark:border-slate-700 pl-1 space-y-0.5">
                  {item.children.map(child => {
                    const active = isActive(child.href)
                    const CIcon = child.icon
                    return (
                      <Link key={child.href} href={child.href}
                        className={cn(
                          'flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm transition-colors',
                          active
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium'
                            : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-white'
                        )}>
                        {CIcon && <CIcon size={12} className={active ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500'} />}
                        <span className="text-xs">{child.label}</span>
                        {active && <ChevronRight size={10} className="ml-auto text-indigo-400" />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          }

          // ── Single link ────────────────────────────────────────────────────
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group',
                active
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white'
              )}>
              <div className={cn(
                'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
                active ? 'bg-indigo-100 dark:bg-indigo-900' : 'bg-gray-100 dark:bg-slate-700 group-hover:bg-gray-200 dark:group-hover:bg-slate-600'
              )}>
                <Icon size={14} className={active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-slate-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium leading-tight', active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-slate-200')}>
                  {item.label}
                </p>
                {item.sublabel && (
                  <p className={cn('text-[11px] leading-tight mt-0.5 truncate', active ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-500')}>
                    {item.sublabel}
                  </p>
                )}
              </div>
              {active && <ChevronRight size={12} className="text-indigo-400 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer: usuário + logout — fixado no fundo */}
      {user && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
              <User size={12} className="text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 dark:text-slate-200 truncate">{user.userId}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">
                {user.role === 'master' ? 'Administrador' : (user.department || 'Departamento')}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-400 transition-colors flex-shrink-0"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button
              onClick={handleLogout}
              title="Sair"
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 text-gray-400 dark:text-slate-400 transition-colors flex-shrink-0 text-[10px] font-medium"
            >
              <LogOut size={11} />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
