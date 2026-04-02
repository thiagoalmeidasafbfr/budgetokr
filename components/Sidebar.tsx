'use client'
import Image from 'next/image'
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
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

      <aside className={cn(
        "w-60 flex-shrink-0 flex flex-col h-screen border-r",
        "md:sticky md:top-0",
        "fixed top-0 left-0 z-50 transition-transform duration-300 ease-in-out",
        "md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
        style={{ backgroundColor: '#1A1820', borderColor: 'rgba(228,223,213,0.08)' }}
      >

        {/* ── Logo ────────────────────────────────────────────────────────── */}
        <div className="px-5 py-5 flex-shrink-0 flex items-center justify-between"
          style={{ borderBottom: '0.5px solid rgba(228,223,213,0.1)' }}
        >
          <div className="flex items-center">
            <Image src="/logo1.png" alt="Logo" width={140} height={48} style={{ objectFit: 'contain' }} priority />
          </div>

          {/* Close button — mobile only */}
          <button
            onClick={closeMobile}
            className="md:hidden flex-shrink-0 p-1 rounded-md transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto min-h-0">
          {!loaded && (
            <div className="space-y-2 px-3 py-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-8 rounded-lg animate-pulse"
                  style={{ backgroundColor: 'rgba(184,146,74,0.06)' }} />
              ))}
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
                  className={cn('w-full flex items-center gap-1 px-3 pb-1 group transition-colors', i === 0 ? 'pt-1' : 'pt-4')}
                >
                  <p
                    className="flex-1 text-left group-hover:opacity-70 transition-opacity"
                    style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: '9px',
                      fontWeight: 500,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'rgba(184,146,74,0.5)',
                    }}
                  >
                    {item.label}
                  </p>
                  {isCollapsed
                    ? <ChevronRight size={10} style={{ color: 'rgba(184,146,74,0.25)' }} />
                    : <ChevronDown  size={10} style={{ color: 'rgba(184,146,74,0.25)' }} />
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
                  <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-default')}
                    style={{ color: anyActive ? '#B8924A' : 'rgba(255,255,255,0.25)' }}
                  >
                    <Icon size={13} style={{ color: anyActive ? '#B8924A' : 'rgba(255,255,255,0.2)' }} />
                    <span>{item.label}</span>
                  </div>
                  <div className="ml-4 pl-1 space-y-0.5"
                    style={{ borderLeft: '0.5px solid rgba(184,146,74,0.15)' }}
                  >
                    {item.children.map(child => {
                      const active = isActive(child.href)
                      const CIcon = child.icon
                      return (
                        <Link key={child.href} href={child.href} onClick={closeMobile}
                          className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm transition-colors"
                          style={{
                            backgroundColor: active ? 'rgba(184,146,74,0.12)' : 'transparent',
                            color: active ? '#B8924A' : 'rgba(255,255,255,0.4)',
                          }}
                        >
                          {CIcon && <CIcon size={12} style={{ color: active ? '#B8924A' : 'rgba(255,255,255,0.25)' }} />}
                          <span className="text-xs">{child.label}</span>
                          {active && <ChevronRight size={10} className="ml-auto" style={{ color: '#B8924A' }} />}
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
                className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all group"
                style={{
                  backgroundColor: active ? 'rgba(184,146,74,0.12)' : 'transparent',
                  color: active ? '#B8924A' : 'rgba(255,255,255,0.5)',
                }}
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{
                    backgroundColor: active
                      ? 'rgba(184,146,74,0.18)'
                      : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <Icon size={14} style={{ color: active ? '#B8924A' : 'rgba(255,255,255,0.3)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight"
                    style={{ color: active ? '#B8924A' : 'rgba(255,255,255,0.65)' }}
                  >
                    {item.label}
                  </p>
                  {item.sublabel && (
                    <p className="text-[11px] leading-tight mt-0.5 truncate"
                      style={{ color: active ? 'rgba(184,146,74,0.5)' : 'rgba(255,255,255,0.22)' }}
                    >
                      {item.sublabel}
                    </p>
                  )}
                </div>
                {active && (
                  <div className="w-0.5 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#B8924A' }} />
                )}
              </Link>
            )
          })}
        </nav>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {user && (
          <div className="flex-shrink-0 px-3 py-2"
            style={{
              borderTop: '0.5px solid rgba(228,223,213,0.08)',
              backgroundColor: 'rgba(0,0,0,0.2)',
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #B8924A, #6B4E18)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <User size={11} style={{ color: 'rgba(255,255,255,0.8)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {user.userId}
                </p>
                <p className="text-[10px] truncate uppercase"
                  style={{ color: '#B8924A', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em', opacity: 0.7 }}
                >
                  {user.role === 'master' ? 'Administrador' : (user.department || 'Departamento')}
                </p>
              </div>
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors flex-shrink-0"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
              </button>
              <button
                onClick={handleLogout}
                title="Sair"
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-colors flex-shrink-0 text-[10px] font-medium"
                style={{ color: 'rgba(255,255,255,0.25)' }}
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
