'use client'
import { cn } from '@/lib/utils'

interface YearFilterProps {
  periodos: string[]          // YYYY-MM format
  selectedYear: string        // '' = all
  onYearChange: (year: string) => void
  className?: string
}

export default function YearFilter({ periodos, selectedYear, onYearChange, className }: YearFilterProps) {
  const years = [...new Set(periodos.map(p => p.substring(0, 4)).filter(Boolean))].sort()

  if (years.length <= 1) return null

  return (
    <div className={cn('flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-0.5', className)}>
      <button
        onClick={() => onYearChange('')}
        className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          !selectedYear ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
        Todos
      </button>
      {years.map(y => (
        <button key={y} onClick={() => onYearChange(y)}
          className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            selectedYear === y ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>
          {y}
        </button>
      ))}
    </div>
  )
}

/** Filter an array of YYYY-MM periods by year */
export function filterPeriodosByYear(periodos: string[], year: string): string[] {
  if (!year) return periodos
  return periodos.filter(p => p.startsWith(year))
}
