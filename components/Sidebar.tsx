'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Upload, Target, GitCompare, Settings, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/', icon: BarChart3, label: 'Dashboard' },
  { href: '/comparison', icon: GitCompare, label: 'Budget vs Realizado' },
  { href: '/metrics', icon: Target, label: 'Métricas' },
  { href: '/upload', icon: Upload, label: 'Importar Dados' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col min-h-screen">
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <TrendingUp size={16} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">BudgetOKR</p>
            <p className="text-xs text-gray-500">Budget vs Realizado</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon size={16} className={active ? 'text-indigo-600' : 'text-gray-400'} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">v1.0.0</p>
      </div>
    </aside>
  )
}
