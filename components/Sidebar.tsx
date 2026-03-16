'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Upload, Target, GitCompare, TrendingUp, FileText, Database, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem =
  | { href: string; icon: React.ElementType; label: string; children?: never }
  | { href?: never; icon: React.ElementType; label: string; children: { href: string; label: string }[] }

const nav: NavItem[] = [
  { href: '/',            icon: BarChart3,   label: 'Dashboard'  },
  { href: '/analise',     icon: GitCompare,  label: 'Análise'    },
  { href: '/medidas',     icon: Target,      label: 'Medidas'    },
  {
    label: 'Lançamentos', icon: FileText, children: [
      { href: '/lancamentos', label: 'Todos' },
    ]
  },
  {
    label: 'Dimensões', icon: Database, children: [
      { href: '/dimensoes/centros-custo',    label: 'Centros de Custo'  },
      { href: '/dimensoes/contas-contabeis', label: 'Contas Contábeis'  },
    ]
  },
  { href: '/upload', icon: Upload, label: 'Importar Dados' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col min-h-screen">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <TrendingUp size={15} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">BudgetOKR</p>
            <p className="text-xs text-gray-400">Budget vs Razão</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {nav.map((item) => {
          if ('children' in item) {
            const Icon = item.icon
            return (
              <div key={item.label}>
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">
                  <Icon size={12} />
                  {item.label}
                </div>
                {(item.children ?? []).map(child => {
                  const active = pathname === child.href
                  return (
                    <Link key={child.href} href={child.href}
                      className={cn('flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                        active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800')}>
                      {child.label}
                    </Link>
                  )
                })}
              </div>
            )
          }

          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')}>
              <Icon size={15} className={active ? 'text-indigo-600' : 'text-gray-400'} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <p className="text-xs text-gray-300 text-center">v2.0.0 · Star Schema</p>
      </div>
    </aside>
  )
}
