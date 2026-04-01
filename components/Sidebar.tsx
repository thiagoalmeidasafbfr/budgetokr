'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, LineChart, GitCompare,
  Target, Layers, FileText, Database, Upload,
  ChevronRight, ChevronDown, Building2, BookOpen, LayoutList, Gauge,
  LogOut, User, ListTree, Shield, Landmark, Moon, Sun, History, MessageSquare, Briefcase, Users, PieChart, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/ThemeProvider'
import { useMobileMenu } from '@/components/MobileMenuProvider'

// ─── Per-icon accent colors (no blue-*, purple-*, gray-*) ────────────────────
const iconColors = new Map<React.ElementType, string>([
  [LayoutDashboard, 'text-muted'],
  [LineChart,       'text-emerald-500'],
  [PieChart,        'text-muted'],
  [GitCompare,      'text-muted'],
  [Layers,          'text-orange-500'],
  [Landmark,        'text-amber-500'],
  [Briefcase,       'text-cyan-500'],
  [ListTree,        'text-teal-500'],
  [MessageSquare,   'text-pink-500'],
  [Gauge,           'text-amber-500'],
  [Target,          'text-rose-500'],
  [FileText,        'text-sky-500'],
  [Database,        'text-muted'],
  [Upload,          'text-green-500'],
  [Shield,          'text-muted'],
  [History,         'text-amber-500'],
  [Building2,       'text-orange-500'],
  [BookOpen,        'text-lime-500'],
  [LayoutList,      'text-muted'],
  [Users,           'text-muted'],
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
    type: 'link', href: '/dre-gerencial',
    icon: PieChart,
    label: 'DRE Gerencial',
    sublabel: 'Visão personalizada por exclusão',
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
      { href: '/dimensoes/centros-custo',     label: 'Centros de Custo',    icon: Building2  },
      { href: '/dimensoes/contas-contabeis',  label: 'Contas Contábeis',    icon: BookOpen   },
      { href: '/dimensoes/dre',              label: 'Estrutura DRE',       icon: LayoutList },
      { href: '/dimensoes/unidades-negocio', label: 'Unidades de Negócio', icon: Briefcase  },
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
  const { isOpen: mobileOpen, close: closeMobile } = useMobileMenu()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const s = new Set<string>()
    nav.forEach(item => { if (item.type === 'section' && item.defaultCollapsed) s.add(item.label) })
    return s
  })

  useEffect(() => {
    if (pathname === '/login' || pathname === '/logout') {
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

  useEffect(() => {
    if (!loaded) return
    let currentSection = ''
    for (const item of nav) {
      if (item.type === 'section') { currentSection = item.label; continue }
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

  let currentSection = ''

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

    <aside className={cn(
      "w-60 flex-shrink-0 bg-base border-r border-border flex flex-col h-screen",
      // Desktop: sticky, participates in flex layout
      "md:sticky md:top-0",
      // Mobile: fixed drawer, slides in/out
      "fixed top-0 left-0 z-50 transition-transform duration-300 ease-in-out",
      "md:translate-x-0",
      mobileOpen ? "translate-x-0" : "-translate-x-full"
    )}>

      {/* Wordmark */}
      <div className="px-5 py-5 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--gold)', fontSize: '1.25rem', lineHeight: 1 }}>✦</span>
          <div className="flex flex-col leading-none">
            <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 700, fontSize: '1.5rem', color: 'var(--ink)', lineHeight: 1 }}>
              Glorioso
            </span>
            <span style={{ fontFamily: 'Big Shoulders Display, Impact, sans-serif', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '0.3em', color: 'var(--gold)' }}>
              FINANCE
            </span>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={closeMobile}
          className="md:hidden flex-shrink-0 p-1 rounded-md text-muted hover:text-ink hover:bg-base-2 transition-colors"
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto min-h-0">
        {!loaded && (
          <div className="space-y-2 px-3 py-2">
            {[1,2,3,4].map(i => <div key={i} className="h-8 bg-border rounded-md animate-pulse" />)}
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
                  'w-full flex items-center gap-1 px-3 pb-1 hover:text-ink transition-colors group',
                  i === 0 ? 'pt-1' : 'pt-4'
                )}
              >
                <p className="text-[10px] font-semibold text-muted uppercase tracking-widest group-hover:text-ink flex-1 text-left">
                  {item.label}
                </p>
                {isCollapsed
                  ? <ChevronRight size={10} className="text-faint group-hover:text-muted" />
                  : <ChevronDown  size={10} className="text-faint group-hover:text-muted" />
                }
              </button>
            )
          }

          if (collapsedSections.has(currentSection)) return null

          // ── Group ────────────────────────────────────────────────────────
          if (item.type === 'group') {
            const Icon = item.icon
            const anyActive = item.children.some(c => isActive(c.href))
            return (
              <div key={item.label}>
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold cursor-default',
                  anyActive ? 'text-ink' : 'text-muted'
                )}>
                  <Icon size={13} className={anyActive ? 'text-ink' : (iconColors.get(Icon) ?? 'text-muted')} />
                  <span>{item.label}</span>
                </div>
                <div className="ml-4 border-l border-border pl-1 space-y-0.5">
                  {item.children.map(child => {
                    const active = isActive(child.href)
                    const CIcon = child.icon
                    return (
                      <Link key={child.href} href={child.href} onClick={closeMobile}
                        className={cn(
                          'flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md text-sm transition-colors',
                          active
                            ? 'bg-surface border border-border text-ink font-medium'
                            : 'text-muted hover:bg-base-2 hover:text-ink'
                        )}>
                        {CIcon && <CIcon size={12} className={active ? 'text-ink' : (iconColors.get(CIcon) ?? 'text-muted')} />}
                        <span className="text-xs">{child.label}</span>
                        {active && <ChevronRight size={10} className="ml-auto text-muted" />}
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
            <Link key={item.href} href={item.href} onClick={closeMobile}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors group',
                active
                  ? 'bg-surface border border-border text-ink'
                  : 'text-muted hover:bg-base-2 hover:text-ink'
              )}>
              <div className={cn(
                'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
                active ? 'bg-base-2' : 'bg-transparent group-hover:bg-base-2'
              )}>
                <Icon size={14} className={active ? 'text-ink' : (iconColors.get(Icon) ?? 'text-muted')} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium leading-tight', active ? 'text-ink' : 'text-muted')}>
                  {item.label}
                </p>
                {item.sublabel && (
                  <p className={cn('text-[11px] leading-tight mt-0.5 truncate', active ? 'text-muted' : 'text-faint')}>
                    {item.sublabel}
                  </p>
                )}
              </div>
              {active && <div className="w-0.5 h-4 rounded-full bg-gold flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      {user && (
        <div className="flex-shrink-0 px-3 py-2 border-t border-border bg-base-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-border flex items-center justify-center flex-shrink-0">
              <User size={12} className="text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-ink truncate">{user.userId}</p>
              <p className="text-[10px] text-muted truncate">
                {user.role === 'master' ? 'Administrador' : (user.department || 'Departamento')}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-base text-muted hover:text-ink transition-colors flex-shrink-0"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button
              onClick={handleLogout}
              title="Sair"
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50 hover:text-danger text-muted transition-colors flex-shrink-0 text-[10px] font-medium"
            >
              <LogOut size={11} />
            </button>
          </div>
        </div>
      )}
    </aside>
    </>
  )
}
