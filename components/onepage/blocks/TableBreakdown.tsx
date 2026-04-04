'use client'
import { useState } from 'react'
import { BRAND, FONTS, fmtBRL, fmtPct } from '@/lib/brand'
import type { BlockConfig } from '@/lib/analysis/templates'
import type { AnalysisResult, BreakdownItem } from '@/lib/analysis/engine'

interface BlockProps {
  config: BlockConfig
  data: AnalysisResult
  onEdit?: (newConfig: BlockConfig) => void
}

type SortKey = 'label' | 'valor_realizado' | 'valor_budget' | 'desvio' | 'desvio_pct' | 'participacao_pct'

export function TableBreakdown({ config, data, onEdit }: BlockProps) {
  const titulo = config.titulo ?? 'Detalhamento'
  const [sortKey, setSortKey] = useState<SortKey>('valor_realizado')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const items: BreakdownItem[] = [...(data.breakdown ?? [])]

  const sorted = items.sort((a, b) => {
    let av: string | number = a[sortKey] ?? 0
    let bv: string | number = b[sortKey] ?? 0
    if (sortKey === 'label') {
      av = String(av); bv = String(bv)
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    av = Math.abs(av as number); bv = Math.abs(bv as number)
    return sortDir === 'asc' ? av - bv : bv - av
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-3 py-2 text-left cursor-pointer select-none hover:bg-gray-50"
      onClick={() => toggleSort(k)}
      style={{ fontFamily: FONTS.mono, fontSize: 9, color: BRAND.muted, whiteSpace: 'nowrap' }}
    >
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  function desvioColor(v: number | null) {
    if (v == null) return BRAND.muted
    return v > 0 ? BRAND.positive : BRAND.negative
  }

  return (
    <div className="onepage-block bg-white rounded-xl border border-[#E4DFD5] overflow-hidden">
      <div
        className="px-4 py-2 border-b border-[#E4DFD5] text-[11px] font-semibold tracking-wide uppercase"
        style={{ fontFamily: FONTS.heading, color: BRAND.muted }}
      >
        {titulo}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-[#E4DFD5]">
            <tr>
              <Th k="label" label="Descrição" />
              <Th k="valor_realizado" label="Realizado" />
              <Th k="valor_budget" label="Budget" />
              <Th k="desvio" label="Desvio R$" />
              <Th k="desvio_pct" label="Desvio %" />
              <Th k="participacao_pct" label="Part. %" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-6 text-sm text-gray-400">Sem dados</td>
              </tr>
            )}
            {sorted.map((item, i) => (
              <tr
                key={item.id ?? i}
                className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]'}
              >
                <td className="px-3 py-2 text-xs font-medium max-w-[200px] truncate" style={{ color: BRAND.ink }}>
                  {item.label}
                </td>
                <td
                  className="px-3 py-2 text-xs text-right"
                  style={{ fontFamily: FONTS.mono, color: BRAND.ink }}
                >
                  {fmtBRL(item.valor_realizado)}
                </td>
                <td
                  className="px-3 py-2 text-xs text-right"
                  style={{ fontFamily: FONTS.mono, color: BRAND.muted }}
                >
                  {item.valor_budget != null ? fmtBRL(item.valor_budget) : '—'}
                </td>
                <td
                  className="px-3 py-2 text-xs text-right font-medium"
                  style={{ fontFamily: FONTS.mono, color: desvioColor(item.desvio) }}
                >
                  {item.desvio != null ? fmtBRL(item.desvio) : '—'}
                </td>
                <td
                  className="px-3 py-2 text-xs text-right font-medium"
                  style={{ fontFamily: FONTS.mono, color: desvioColor(item.desvio_pct) }}
                >
                  {item.desvio_pct != null ? fmtPct(item.desvio_pct) : '—'}
                </td>
                <td
                  className="px-3 py-2 text-xs text-right"
                  style={{ fontFamily: FONTS.mono, color: BRAND.muted }}
                >
                  {item.participacao_pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onEdit && (
        <div className="px-4 py-2 border-t border-[#E4DFD5]">
          <button onClick={() => onEdit(config)} className="text-xs text-gray-400">⚙ Configurar</button>
        </div>
      )}
    </div>
  )
}
