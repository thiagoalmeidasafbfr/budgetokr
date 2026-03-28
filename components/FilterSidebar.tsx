'use client'
import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, ChevronUp, Filter, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatPeriodo, cn } from '@/lib/utils'

interface FilterSidebarProps {
  /** If set, shows locked dept badge(s) instead of checkboxes */
  deptUser?: { department?: string; departments?: string[] } | null
  departamentos?: string[]
  selDepts: string[]
  onDeptsChange: (depts: string[]) => void
  /** Cost centers — shown cascaded after dept selection */
  centrosDisp?: { cc: string; nome: string }[]
  selCentros?: string[]
  onCentrosChange?: (centros: string[]) => void
  periodos: string[]
  selPeriods: string[]
  onPeriodsChange: (periods: string[]) => void
  /** Extra filter sections rendered before departments (e.g. projects, units) */
  extraBefore?: React.ReactNode
}

export function FilterSidebar({
  deptUser,
  departamentos = [],
  selDepts,
  onDeptsChange,
  centrosDisp = [],
  selCentros = [],
  onCentrosChange,
  periodos,
  selPeriods,
  onPeriodsChange,
  extraBefore,
}: FilterSidebarProps) {
  const currentYear = new Date().getFullYear().toString()
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set([currentYear]))
  const [mobileExpanded, setMobileExpanded] = useState(false)

  // When periods load, make sure the most recent year with data is expanded
  useEffect(() => {
    if (periodos.length === 0) return
    setExpandedYears(prev => {
      const hasVisibleYear = periodos.some(p => prev.has(p.substring(0, 4)))
      if (hasVisibleYear) return prev
      // No expanded year has data — expand the latest available year
      const latestYear = periodos[periodos.length - 1].substring(0, 4)
      return new Set([latestYear])
    })
  }, [periodos])

  const periodsByYear = Object.entries(
    periodos.reduce<Record<string, string[]>>((acc, p) => {
      const y = p.substring(0, 4)
      if (!acc[y]) acc[y] = []
      acc[y].push(p)
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  const hasActiveFilters = selDepts.length > 0 || selCentros.length > 0 || selPeriods.length > 0
  const hasDeptSection = departamentos.length > 0 || !!deptUser
  const activeCount = selDepts.length + selCentros.length + selPeriods.length

  return (
    <Card>
      {/* Mobile toggle header */}
      <button
        onClick={() => setMobileExpanded(v => !v)}
        className="md:hidden w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
          <Filter size={11} /> Filtros
          {activeCount > 0 && (
            <span className="ml-1 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </span>
        {mobileExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      <div className={cn(mobileExpanded ? 'block' : 'hidden', 'md:block')}>
      <CardContent className="p-3 space-y-3">
        <p className="hidden md:flex text-xs font-semibold text-gray-500 uppercase tracking-wide items-center gap-1">
          <Filter size={11} /> Filtros
        </p>

        {extraBefore}

        {/* Departments */}
        {hasDeptSection && (
          deptUser ? (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">
                {(deptUser.departments?.length ?? 0) > 1 ? 'Departamentos' : 'Departamento'}
              </p>
              {(deptUser.departments?.length ?? 0) > 1 ? (
                // Multi-dept: checkboxes filtráveis dentro dos departamentos permitidos
                <div className="space-y-0.5 max-h-36 overflow-y-auto">
                  {deptUser.departments!.map(d => (
                    <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selDepts.includes(d)}
                        onChange={e => onDeptsChange(e.target.checked ? [...selDepts, d] : selDepts.filter(x => x !== d))}
                        className="w-3 h-3 accent-gray-800" />
                      <span className="text-xs text-gray-700 font-medium truncate">{d}</span>
                    </label>
                  ))}
                </div>
              ) : (
                // Single dept: badge fixo
                <div className="flex flex-wrap gap-1">
                  {(deptUser.departments ?? (deptUser.department ? [deptUser.department] : [])).map(d => (
                    <span key={d} className="text-xs text-gray-700 font-semibold px-1.5 py-0.5 bg-gray-50 rounded">
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Departamentos</p>
              <div className="space-y-0.5 max-h-36 overflow-y-auto">
                {departamentos.map(d => (
                  <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input type="checkbox" checked={selDepts.includes(d)}
                      onChange={e => onDeptsChange(e.target.checked ? [...selDepts, d] : selDepts.filter(x => x !== d))}
                      className="w-3 h-3 accent-gray-800" />
                    <span className="text-xs text-gray-600 truncate">{d || '—'}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        )}

        {/* Cost centers — cascaded from departments */}
        {selDepts.length > 0 && centrosDisp.length > 0 && onCentrosChange && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <ChevronRight size={10} /> Centros de Custo
            </p>
            <div className="space-y-0.5 max-h-32 overflow-y-auto pl-2 border-l-2 border-gray-100">
              {centrosDisp.map(c => (
                <label key={c.cc} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                  <input type="checkbox" checked={selCentros.includes(c.cc)}
                    onChange={e => onCentrosChange(e.target.checked ? [...selCentros, c.cc] : selCentros.filter(x => x !== c.cc))}
                    className="w-3 h-3 accent-gray-800" />
                  <span className="text-xs text-gray-600 truncate" title={c.nome}>{c.nome || c.cc}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Periods grouped by year with expand/collapse */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Períodos</p>
          <div className="space-y-0.5 max-h-52 overflow-y-auto">
            {periodsByYear.map(([year, months]) => {
              const selInYear = months.filter(m => selPeriods.includes(m))
              const allSel  = selInYear.length === months.length
              const someSel = selInYear.length > 0
              const isOpen  = expandedYears.has(year)
              return (
                <div key={year}>
                  <div
                    className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-gray-50 cursor-pointer select-none"
                    onClick={() => setExpandedYears(prev => {
                      const s = new Set(prev); s.has(year) ? s.delete(year) : s.add(year); return s
                    })}>
                    {isOpen
                      ? <ChevronDown size={10} className="text-gray-400 flex-shrink-0" />
                      : <ChevronRight size={10} className="text-gray-400 flex-shrink-0" />}
                    <input type="checkbox"
                      checked={allSel}
                      ref={el => { if (el) el.indeterminate = someSel && !allSel }}
                      onClick={e => e.stopPropagation()}
                      onChange={e => onPeriodsChange(
                        e.target.checked
                          ? [...new Set([...selPeriods, ...months])]
                          : selPeriods.filter(p => !months.includes(p))
                      )}
                      className="w-3 h-3 accent-gray-800 flex-shrink-0" />
                    <span className="text-xs font-semibold text-gray-700">{year}</span>
                    {someSel && <span className="ml-auto text-[10px] text-gray-600 tabular-nums">{selInYear.length}/{months.length}</span>}
                  </div>
                  {isOpen && (
                    <div className="ml-4 space-y-0.5">
                      {months.map(m => (
                        <label key={m} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                          <input type="checkbox" checked={selPeriods.includes(m)}
                            onChange={e => onPeriodsChange(e.target.checked ? [...selPeriods, m] : selPeriods.filter(x => x !== m))}
                            className="w-3 h-3 accent-gray-800" />
                          <span className="text-xs text-gray-600">{formatPeriodo(m)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {selPeriods.length > 0 && (
            <button onClick={() => onPeriodsChange([])}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1 mt-1">
              <X size={10} /> Limpar períodos
            </button>
          )}
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={() => { onDeptsChange([]); onCentrosChange?.([]); onPeriodsChange([]) }}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-1">
            <X size={10} /> Limpar filtros
          </button>
        )}
      </CardContent>
      </div>
    </Card>
  )
}
