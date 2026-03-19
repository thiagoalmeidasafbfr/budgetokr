'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, LineChart, GitCompare,
  Target, Layers, FileText, Database, Upload,
  ChevronRight, Building2, BookOpen, LayoutList, Gauge,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Nav config ────────────────────────────────────────────────────────────────

type NavLink  = { type: 'link';    href: string; icon: React.ElementType; label: string; sublabel?: string }
type NavGroup = { type: 'group';   icon: React.ElementType; label: string; children: { href: string; label: string; icon?: React.ElementType }[] }
type NavSep   = { type: 'section'; label: string }

type NavItem = NavLink | NavGroup | NavSep

const nav: NavItem[] = [
  // ─ Visão Geral ─────────────────────────────────────────────────────────────
  { type: 'section', label: 'Visão Geral' },
  {
    type: 'link', href: '/',
    icon: LayoutDashboard,
    label: 'Dashboard',
    sublabel: 'Resumo consolidado',
  },

  // ─ Análise Financeira e Qualitativa ────────────────────────────────────────
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

  // ─ KPIs & Medidas ──────────────────────────────────────────────────────────
  { type: 'section', label: 'KPIs & Medidas' },
  {
    type: 'link', href: '/kpis',
    icon: Gauge,
    label: 'KPIs',
    sublabel: 'Configurar indicadores',
  },
  {
    type: 'link', href: '/medidas',
    icon: Target,
    label: 'Medidas Calculadas',
    sublabel: 'Indicadores financeiros',
  },

  // ─ Gestão de Dados ─────────────────────────────────────────────────────────
  { type: 'section', label: 'Gestão de Dados' },
  {
    type: 'group', icon: FileText, label: 'Lançamentos',
    children: [
      { href: '/lancamentos', label: 'Todos os lançamentos', icon: FileText },
    ],
  },
  {
    type: 'group', icon: Database, label: 'Dimensões',
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
  },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <TrendingUp size={15} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">BudgetOKR</p>
            <p className="text-[11px] text-gray-400 leading-tight">Budget vs Razão</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {nav.map((item, i) => {
          // ── Section label ────────────────────────────────────────────────
          if (item.type === 'section') {
            return (
              <div key={i} className={cn('px-3 pt-3 pb-1', i === 0 ? 'pt-1' : '')}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  {item.label}
                </p>
              </div>
            )
          }

          // ── Group (collapsible children) ─────────────────────────────────
          if (item.type === 'group') {
            const Icon = item.icon
            const anyActive = item.children.some(c => isActive(c.href))
            return (
              <div key={item.label}>
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-default',
                  anyActive ? 'text-indigo-700' : 'text-gray-500'
                )}>
                  <Icon size={13} className={anyActive ? 'text-indigo-500' : 'text-gray-400'} />
                  <span>{item.label}</span>
                </div>
                <div className="ml-4 border-l border-gray-100 pl-1 space-y-0.5">
                  {item.children.map(child => {
                    const active = isActive(child.href)
                    const CIcon = child.icon
                    return (
                      <Link key={child.href} href={child.href}
                        className={cn(
                          'flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm transition-colors',
                          active
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                        )}>
                        {CIcon && <CIcon size={12} className={active ? 'text-indigo-500' : 'text-gray-400'} />}
                        <span className="text-xs">{child.label}</span>
                        {active && <ChevronRight size={10} className="ml-auto text-indigo-400" />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          }

          // ── Single link ──────────────────────────────────────────────────
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group',
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}>
              <div className={cn(
                'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
                active ? 'bg-indigo-100' : 'bg-gray-100 group-hover:bg-gray-200'
              )}>
                <Icon size={14} className={active ? 'text-indigo-600' : 'text-gray-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium leading-tight', active ? 'text-indigo-700' : 'text-gray-700')}>
                  {item.label}
                </p>
                {item.sublabel && (
                  <p className={cn('text-[11px] leading-tight mt-0.5 truncate', active ? 'text-indigo-500' : 'text-gray-400')}>
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
      <div className="px-4 py-3 border-t border-gray-100">
        <p className="text-[10px] text-gray-300 text-center">v2.0.0 · Star Schema</p>
      </div>
    </aside>
  )
}
