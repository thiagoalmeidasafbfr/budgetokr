'use client'
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { formatPeriodo } from '@/lib/utils'
import { useBiStore } from '@/lib/bi/store'
import { periodosFromBiPeriodo } from '@/lib/bi/engine'

export function BiSidebar() {
  const { dashboard, setPeriodoGlobal } = useBiStore()
  const [allPeriodos, setAllPeriodos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())

  // Load available periods; auto-apply default selection if current global period
  // has no intersection with available data (fresh dashboard / year mismatch).
  useEffect(() => {
    fetch('/api/bi/dimensoes')
      .then(r => r.json())
      .then(d => {
        const ps: string[] = Array.isArray(d.periodos) ? d.periodos : []
        setAllPeriodos(ps)

        if (ps.length === 0) { setLoading(false); return }

        // Expand the most recent year with data
        const latestYear = ps[ps.length - 1].substring(0, 4)
        setExpandedYears(new Set([latestYear]))

        // Helper: apply YTD up to previous month (same as other pages)
        function applyYtdDefault() {
          const now = new Date()
          const prevM = now.getMonth() === 0 ? 12 : now.getMonth()
          const prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
          const curMonthStr = `${prevY}-${String(prevM).padStart(2, '0')}`
          const yearToUse = ps.some(p => p.startsWith(String(prevY))) ? String(prevY) : latestYear
          const ytd = ps.filter(p => p.startsWith(yearToUse) && p <= curMonthStr)
          const finalSel = ytd.length > 0 ? ytd : ps.filter(p => p.startsWith(yearToUse))
          if (finalSel.length === 1) {
            const [y, m] = finalSel[0].split('-').map(Number)
            useBiStore.getState().setPeriodoGlobal({ tipo: 'mes', mes: m, ano: y })
          } else if (finalSel.length > 1) {
            useBiStore.getState().setPeriodoGlobal({ tipo: 'lista', periodos: finalSel })
          }
        }

        // Normalize: trim current selection to only periods with actual data.
        // This removes future months that a saved "ytd" or full-year selection might include.
        const available = new Set(ps)
        const currentSel = periodosFromBiPeriodo(
          useBiStore.getState().dashboard.periodo_global
        )
        const trimmed = currentSel.filter(p => available.has(p))

        if (trimmed.length === 0) {
          // No overlap at all — apply default
          applyYtdDefault()
        } else if (trimmed.length !== currentSel.length) {
          // Some periods (likely future months) were trimmed — update selection
          if (trimmed.length === 1) {
            const [y, m] = trimmed[0].split('-').map(Number)
            useBiStore.getState().setPeriodoGlobal({ tipo: 'mes', mes: m, ano: y })
          } else {
            useBiStore.getState().setPeriodoGlobal({ tipo: 'lista', periodos: trimmed.sort() })
          }
        }

        setLoading(false)
      })
      .catch(() => setLoading(false))
  // Run once on mount — intentionally no deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Currently selected periods as a flat string[] (derived from periodo_global)
  const selPeriods: string[] = periodosFromBiPeriodo(dashboard.periodo_global)

  function onPeriodsChange(next: string[]) {
    if (next.length === 0) {
      setPeriodoGlobal({ tipo: 'lista', periodos: [] })
      return
    }
    const sorted = [...next].sort()
    if (sorted.length === 1) {
      const [y, m] = sorted[0].split('-').map(Number)
      setPeriodoGlobal({ tipo: 'mes', mes: m, ano: y })
    } else {
      setPeriodoGlobal({ tipo: 'lista', periodos: sorted })
    }
  }

  // Group by year
  const byYear = allPeriodos.reduce<Record<string, string[]>>((acc, p) => {
    const y = p.substring(0, 4)
    if (!acc[y]) acc[y] = []
    acc[y].push(p)
    return acc
  }, {})
  const years = Object.keys(byYear).sort()

  const activeCount = selPeriods.length

  return (
    <aside
      className="w-52 shrink-0 h-full overflow-y-auto border-r bg-white"
      style={{ borderColor: '#E4DFD5' }}
      data-no-print
    >
      <div className="p-3 space-y-3">
        {/* Header */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
          <Filter size={11} /> Filtros
          {activeCount > 0 && (
            <span className="ml-1 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </p>

        {/* Period filter */}
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Períodos</p>

          {loading ? (
            <div className="space-y-1">
              {[1,2,3].map(i => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : years.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Sem dados</p>
          ) : (
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {years.map(year => {
                const months = byYear[year]
                const selInYear = months.filter(m => selPeriods.includes(m))
                const allSel  = selInYear.length === months.length
                const someSel = selInYear.length > 0
                const isOpen  = expandedYears.has(year)

                return (
                  <div key={year}>
                    {/* Year row */}
                    <div
                      className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-gray-50 cursor-pointer select-none"
                      onClick={() => setExpandedYears(prev => {
                        const s = new Set(prev)
                        s.has(year) ? s.delete(year) : s.add(year)
                        return s
                      })}
                    >
                      {isOpen
                        ? <ChevronDown  size={10} className="text-gray-400 flex-shrink-0" />
                        : <ChevronRight size={10} className="text-gray-400 flex-shrink-0" />}
                      <input
                        type="checkbox"
                        checked={allSel}
                        ref={el => { if (el) el.indeterminate = someSel && !allSel }}
                        onClick={e => e.stopPropagation()}
                        onChange={e => onPeriodsChange(
                          e.target.checked
                            ? [...new Set([...selPeriods, ...months])]
                            : selPeriods.filter(p => !months.includes(p))
                        )}
                        className="w-3 h-3 accent-gray-800 flex-shrink-0"
                      />
                      <span className="text-xs font-semibold text-gray-700">{year}</span>
                      {someSel && (
                        <span className="ml-auto text-[10px] text-gray-500 tabular-nums">
                          {selInYear.length}/{months.length}
                        </span>
                      )}
                    </div>

                    {/* Month rows */}
                    {isOpen && (
                      <div className="ml-4 space-y-0.5">
                        {months.map(m => (
                          <label
                            key={m}
                            className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
                          >
                            <input
                              type="checkbox"
                              checked={selPeriods.includes(m)}
                              onChange={e => onPeriodsChange(
                                e.target.checked
                                  ? [...selPeriods, m]
                                  : selPeriods.filter(x => x !== m)
                              )}
                              className="w-3 h-3 accent-gray-800"
                            />
                            <span className="text-xs text-gray-600">{formatPeriodo(m)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Clear / select all shortcuts */}
          {selPeriods.length > 0 && (
            <button
              onClick={() => {
                // Keep only the first selected month
                const first = [...selPeriods].sort()[0]
                const [y, m] = first.split('-').map(Number)
                setPeriodoGlobal({ tipo: 'mes', mes: m, ano: y })
              }}
              className="text-[10px] text-gray-400 hover:text-gray-600 mt-1 block"
            >
              Limpar seleção múltipla
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
