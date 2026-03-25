'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, TrendingUp, LineChart, GitCompare,
  Target, Layers, FileText, Database, Upload,
  ChevronRight, ChevronDown, Building2, BookOpen, LayoutList, Gauge,
  LogOut, User, ListTree, Shield, Landmark, Moon, Sun, History, MessageSquare, BarChart2, Briefcase, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/ThemeProvider'

// ─── Per-icon accent colors ──────────────────────────────────────────────────────
const iconColors = new Map<React.ElementType, string>([
  [LayoutDashboard, 'text-blue-400'],
  [LineChart,       'text-emerald-400'],
  [GitCompare,      'text-violet-400'],
  [Layers,          'text-orange-400'],
  [Landmark,        'text-yellow-400'],
  [Briefcase,       'text-cyan-400'],
  [ListTree,        'text-teal-400'],
  [MessageSquare,   'text-pink-400'],
  [Gauge,           'text-amber-400'],
  [Target,          'text-rose-400'],
  [FileText,        'text-sky-400'],
  [Database,        'text-purple-400'],
  [Upload,          'text-green-400'],
  [Shield,          'text-indigo-400'],
  [History,         'text-amber-300'],
  [Building2,       'text-orange-300'],
  [BookOpen,        'text-lime-400'],
  [LayoutList,      'text-blue-300'],
])

// ─── Types ──────────────────────────────────────────────────────────────────────

type SessionUser = { userId: string; role: 'master' | 'dept'; department?: string }

type NavLink  = { type: 'link';    href: string; icon: React.ElementType; label: string; sublabel?: string; masterOnly?: boolean; deptOnly?: boolean }
type NavGroup = { type: 'group';   icon: React.ElementType; label: string; masterOnly?: boolean; children: { href: string; label: string; icon?: React.ElementType }[] }
type NavSep   = { type: 'section'; label: string; masterOnly?: boolean; deptOnly?: boolean; defaultCollapsed?: boolean }
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
    label: 'Análise Macro',
    sublabel: 'Visão Geral por Centro de Custo',
  },
  {
    type: 'link', href: '/dept',
    icon: Layers,
    label: 'Dashboard do Departamento',
    sublabel: 'KPIs e DRE por área',
  },
  {
    type: 'link', href: '/capex',
    icon: Landmark,
    label: 'CAPEX',
    sublabel: 'Investimentos por projeto',
  },
  {
    type: 'link', href: '/unidades-negocio',
    icon: Briefcase,
    label: 'Unidades de Negócio',
    sublabel: 'Visão Real vs Orçado por unidade de negócio',
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

  { type: 'section', label: 'Gestão de Dados', masterOnly: true, defaultCollapsed: true },
  {
    type: 'group', icon: FileText, label: 'Lançamentos', masterOnly: true,
    children: [
      { href: '/lancamentos', label: 'Todos os lançamentos', icon: FileText },
    ],
  },
  {
    type: 'group', icon: Database, label: 'Dimensões', masterOnly: true,
    children: [
      { href: '/dimensoes/centros-custo',      label: 'Centros de Custo',      icon: Building2  },
      { href: '/dimensoes/contas-contabeis',  label: 'Contas Contábeis',      icon: BookOpen   },
      { href: '/dimensoes/dre',               label: 'Estrutura DRE',         icon: LayoutList },
      { href: '/dimensoes/unidades-negocio',  label: 'Unidades de Negócio',   icon: Briefcase  },
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
    type: 'link', href: '/admin/users',
    icon: Users,
    label: 'Usuários',
    sublabel: 'Gerenciar acessos',
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

  // Sections that are collapsed — initialised from defaultCollapsed flags
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const s = new Set<string>()
    nav.forEach(item => { if (item.type === 'section' && item.defaultCollapsed) s.add(item.label) })
    return s
  })

  useEffect(() => {
    if (pathname === '/login' || pathname === '/logout') {
      // Clear stale user so the next login loads fresh data
      setUser(null)
      setLoaded(true)
      return
    }
    if (user) return
    fetch('/api/me')
      .then(r => {
        if (r.status === 401) {
          router.push('/login')
          setLoaded(true)
          return null
        }
        return r.ok ? r.json() : null
      })
      .then(u => { if (u) setUser(u); setLoaded(true) })
      .catch(() => setLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // If the active page is inside a collapsed section, auto-expand it
  useEffect(() => {
    if (!loaded) return
    let currentSection = ''
    for (const item of nav) {
      if (item.type === 'section') { currentSection = item.label; continue }
      const href = item.type === 'link' ? item.href
        : item.type === 'group' ? item.children[0]?.href
        : null
      const anyActive = item.type === 'link'
        ? (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
        : item.type === 'group'
        ? item.children.some(c => pathname.startsWith(c.href))
        : false
      if (anyActive && currentSection) {
        setCollapsedSections(prev => {
          if (!prev.has(currentSection)) return prev
          const next = new Set(prev)
          next.delete(currentSection)
          return next
        })
        break
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, pathname])

  if (pathname === '/login') return null

  async function handleLogout() {
    setUser(null)
    setLoaded(false)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function toggleSection(label: string) {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  const isMaster = user?.role === 'master'

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  // Track which section we're currently inside while rendering
  let currentSection = ''

  return (
    <aside className="w-60 flex-shrink-0 bg-[#1a2535] border-r border-white/5 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-sm">
            <TrendingUp size={15} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-100 text-sm leading-tight">Glorioso Finance</p>
            <p className="text-[11px] text-slate-500 leading-tight">Botafogo F.R.</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto min-h-0">
        {!loaded && (
          <div className="space-y-2 px-3 py-2">
            {[1,2,3,4].map(i => <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />)}
          </div>
        )}
        {loaded && user && nav.map((item, i) => {
          if (item.masterOnly && !isMaster) return null
          if (item.deptOnly && isMaster) return null

          // ── Section label (collapsible) ────────────────────────────────────
          if (item.type === 'section') {
            currentSection = item.label
            const isCollapsed = collapsedSections.has(item.label)
            return (
              <button
                key={item.label}
                onClick={() => toggleSection(item.label)}
                className={cn(
                  'w-full flex items-center gap-1 px-3 pb-1 hover:text-slate-300 transition-colors group',
                  i === 0 ? 'pt-1' : 'pt-3'
                )}
              >
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest group-hover:text-slate-400 flex-1 text-left">
                  {item.label}
                </p>
                {isCollapsed
                  ? <ChevronRight size={10} className="text-slate-600 group-hover:text-slate-400" />
                  : <ChevronDown  size={10} className="text-slate-600 group-hover:text-slate-400" />
                }
              </button>
            )
          }

          // Hide items when their section is collapsed
          if (collapsedSections.has(currentSection)) return null

          // ── Group (always-open sub-list with label) ────────────────────────
          if (item.type === 'group') {
            const Icon = item.icon
            const anyActive = item.children.some(c => isActive(c.href))
            return (
              <div key={item.label}>
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-default',
                  anyActive ? 'text-indigo-400' : 'text-slate-500'
                )}>
                  <Icon size={13} className={anyActive ? 'text-indigo-400' : (iconColors.get(Icon) ?? 'text-slate-500')} />
                  <span>{item.label}</span>
                </div>
                <div className="ml-4 border-l border-white/10 pl-1 space-y-0.5">
                  {item.children.map(child => {
                    const active = isActive(child.href)
                    const CIcon = child.icon
                    return (
                      <Link key={child.href} href={child.href}
                        className={cn(
                          'flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm transition-colors',
                          active
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-slate-200 hover:bg-white/5 hover:text-white'
                        )}>
                        {CIcon && <CIcon size={12} className={active ? 'text-indigo-400' : (iconColors.get(CIcon) ?? 'text-slate-500')} />}
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
                  ? 'bg-white/10 text-slate-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )}>
              <div className={cn(
                'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
                active ? 'bg-indigo-500/20' : 'bg-white/5 group-hover:bg-white/10'
              )}>
                <Icon size={14} className={active ? 'text-indigo-400' : (iconColors.get(Icon) ?? 'text-slate-500')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium leading-tight', active ? 'text-white' : 'text-slate-100')}>
                  {item.label}
                </p>
                {item.sublabel && (
                  <p className={cn('text-[11px] leading-tight mt-0.5 truncate', active ? 'text-slate-300' : 'text-slate-400')}>
                    {item.sublabel}
                  </p>
                )}
              </div>
              {active && <ChevronRight size={12} className="text-indigo-400 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      {user && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-white/5 bg-black/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <User size={12} className="text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{user.userId}</p>
              <p className="text-[10px] text-slate-500 truncate">
                {user.role === 'master' ? 'Administrador' : (user.department || 'Departamento')}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button
              onClick={handleLogout}
              title="Sair"
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-500/10 hover:text-red-400 text-slate-500 transition-colors flex-shrink-0 text-[10px] font-medium"
            >
              <LogOut size={11} />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
