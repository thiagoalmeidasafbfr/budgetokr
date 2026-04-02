'use client'
import { cn } from '@/lib/utils'
import { Calendar } from 'lucide-react'

interface YearFilterProps {
  periodos: string[]
  selYear: string | null
  onChange: (year: string | null) => void
  className?: string
}

export function YearFilter({ periodos, selYear, onChange, className }: YearFilterProps) {
  const years = [...new Set(periodos.map(p => p.substring(0, 4)).filter(Boolean))].sort()

  if (years.length <= 1) return null

  const monoStyle: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '11px',
    letterSpacing: '0.06em',
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Calendar size={13} className="flex-shrink-0 hidden sm:block" style={{ color: '#9B6E20' }} />
      <span className="flex-shrink-0 hidden sm:inline" style={{ ...monoStyle, color: '#9B6E20' }}>Ano:</span>
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => onChange(null)}
          className="px-2.5 py-1 rounded-lg transition-all"
          style={selYear === null
            ? { ...monoStyle, backgroundColor: '#1A1820', color: '#B8924A', border: '0.5px solid rgba(184,146,74,0.3)' }
            : { ...monoStyle, backgroundColor: '#FFFFFF', color: '#1A1820', border: '0.5px solid #E4DFD5' }
          }
        >
          Todos
        </button>
        {years.map(y => (
          <button
            key={y}
            onClick={() => onChange(y)}
            className="px-2.5 py-1 rounded-lg transition-all"
            style={selYear === y
              ? { ...monoStyle, backgroundColor: '#1A1820', color: '#B8924A', border: '0.5px solid rgba(184,146,74,0.3)' }
              : { ...monoStyle, backgroundColor: '#FFFFFF', color: '#1A1820', border: '0.5px solid #E4DFD5' }
            }
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  )
}
