'use client'
import { useState } from 'react'
import { ChevronRight, ChevronDown, Filter, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatPeriodo } from '@/lib/utils'

interface FilterSidebarProps {
  /** If set, shows a locked dept badge instead of checkboxes */
  deptUser?: { department: string } | null
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

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
          <Filter size={11} /> Filtros
        </p>

        {extraBefore}

        {/* Departments */}
        {hasDeptSection && (
          deptUser ? (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Departamento</p>
              <p className="text-xs text-indigo-700 font-semibold px-1 py-0.5 bg-indigo-50 rounded">{deptUser.department}</p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Departamentos</p>
              <div className="space-y-0.5 max-h-36 overflow-y-auto">
                {departamentos.map(d => (
                  <label key={d} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                    <input type="checkbox" checked={selDepts.includes(d)}
                      onChange={e => onDeptsChange(e.target.checked ? [...selDepts, d] : selDepts.filter(x => x !== d))}
                      className="w-3 h-3 accent-indigo-600" />
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
            <p className="text-xs font-medium text-indigo-600 mb-1 flex items-center gap-1">
              <ChevronRight size={10} /> Centros de Custo
            </p>
            <div className="space-y-0.5 max-h-32 overflow-y-auto pl-2 border-l-2 border-indigo-100">
              {centrosDisp.map(c => (
                <label key={c.cc} className="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 rounded px-1 py-0.5">
                  <input type="checkbox" checked={selCentros.includes(c.cc)}
                    onChange={e => onCentrosChange(e.target.checked ? [...selCentros, c.cc] : selCentros.filter(x => x !== c.cc))}
                    className="w-3 h-3 accent-indigo-600" />
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
                      className="w-3 h-3 accent-indigo-600 flex-shrink-0" />
                    <span className="text-xs font-semibold text-gray-700">{year}</span>
                    {someSel && <span className="ml-auto text-[10px] text-indigo-500 tabular-nums">{selInYear.length}/{months.length}</span>}
                  </div>
                  {isOpen && (
                    <div className="ml-4 space-y-0.5">
                      {months.map(m => (
                        <label key={m} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                          <input type="checkbox" checked={selPeriods.includes(m)}
                            onChange={e => onPeriodsChange(e.target.checked ? [...selPeriods, m] : selPeriods.filter(x => x !== m))}
                            className="w-3 h-3 accent-indigo-600" />
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
    </Card>
  )
}
