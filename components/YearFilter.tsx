'use client'
import { cn } from '@/lib/utils'
import { Calendar } from 'lucide-react'

interface YearFilterProps {
  periodos: string[]       // all available YYYY-MM strings
  selYear: string | null   // currently selected year, null = all years
  onChange: (year: string | null) => void
  className?: string
}

export function YearFilter({ periodos, selYear, onChange, className }: YearFilterProps) {
  const years = [...new Set(periodos.map(p => p.substring(0, 4)).filter(Boolean))].sort()

  // Only render if there are multiple years to choose from
  if (years.length <= 1) return null

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Calendar size={13} className="text-gray-400 flex-shrink-0 hidden sm:block" />
      <span className="text-xs text-gray-500 flex-shrink-0 hidden sm:inline">Ano:</span>
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => onChange(null)}
          className={cn(
            'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
            selYear === null
              ? 'bg-gray-800 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          )}
        >
          Todos
        </button>
        {years.map(y => (
          <button
            key={y}
            onClick={() => onChange(y)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              selYear === y
                ? 'bg-gray-800 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  )
}
