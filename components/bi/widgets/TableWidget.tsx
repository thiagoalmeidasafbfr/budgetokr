'use client'
import { BRAND, FONTS, fmtBRL, fmtPct, fmtValue } from '@/lib/brand'
import type { WidgetConfig, BiQueryResult } from '@/lib/bi/widget-types'

interface WidgetProps {
  config: WidgetConfig
  data: BiQueryResult
  isEditing: boolean
  onConfigChange: (c: WidgetConfig) => void
}

import { useState } from 'react'

type SortCol = 'nome' | 'realizado' | 'budget' | 'desvio' | 'desvio_pct'

export function TableWidget({ config, data }: WidgetProps) {
  const [sortCol, setSortCol] = useState<SortCol>('realizado')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const { mostrar_titulo } = config.estilo
  const fmt = (v: number | null) => v == null ? '—' : fmtValue(v, config.estilo)

  if (data.tipo === 'breakdown') {
    const sorted = [...data.itens].sort((a, b) => {
      const av = sortCol === 'nome' ? a.label : (a as Record<string,unknown>)[sortCol] as number ?? 0
      const bv = sortCol === 'nome' ? b.label : (b as Record<string,unknown>)[sortCol] as number ?? 0
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

    const Th = ({ col, label }: { col: SortCol; label: string }) => (
      <th className="px-2 py-1.5 text-left cursor-pointer hover:bg-gray-50 whitespace-nowrap"
          onClick={() => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc') } }}
          style={{ fontFamily: FONTS.mono, fontSize: 9, color: BRAND.muted }}>
        {label}{sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )

    return (
      <div className="h-full flex flex-col overflow-hidden">
        {mostrar_titulo && config.titulo && (
          <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase shrink-0 border-b"
             style={{ fontFamily: FONTS.heading, color: BRAND.muted, borderColor: '#E4DFD5' }}>{config.titulo}</p>
        )}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <Th col="nome"      label="Descrição" />
                <Th col="realizado" label="Realizado" />
                <Th col="budget"    label="Budget" />
                <Th col="desvio"    label="Desvio R$" />
                <Th col="desvio_pct" label="Desvio %" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => {
                const desvio = item.realizado - (item.budget ?? item.realizado)
                const desvioColor = desvio >= 0 ? BRAND.positive : BRAND.danger
                return (
                  <tr key={i} className={i % 2 ? 'bg-[#FAFAF8]' : 'bg-white'}>
                    <td className="px-2 py-1.5 max-w-[160px] truncate" style={{ color: BRAND.ink }}>{item.label}</td>
                    <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono }}>{fmt(item.realizado)}</td>
                    <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono, color: BRAND.muted }}>{item.budget != null ? fmt(item.budget) : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-medium" style={{ fontFamily: FONTS.mono, color: desvioColor }}>{fmt(desvio)}</td>
                    <td className="px-2 py-1.5 text-right font-medium" style={{ fontFamily: FONTS.mono, color: desvioColor }}>{item.desvio_pct != null ? fmtPct(item.desvio_pct) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (data.tipo === 'dre') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {mostrar_titulo && config.titulo && (
          <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase shrink-0 border-b"
             style={{ fontFamily: FONTS.heading, color: BRAND.muted, borderColor: '#E4DFD5' }}>{config.titulo}</p>
        )}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Linha DRE','Realizado','Budget','Desvio R$','Desvio %'].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left whitespace-nowrap"
                      style={{ fontFamily: FONTS.mono, fontSize: 9, color: BRAND.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.linhas.map((linha, i) => {
                const desvio = linha.desvio ?? 0
                const bold   = linha.estrutura.negrito
                const sep    = linha.estrutura.separador
                const desvioColor = desvio >= 0 ? BRAND.positive : BRAND.danger
                return (
                  <tr key={i}
                      className={`${i % 2 ? 'bg-[#FAFAF8]' : 'bg-white'} ${sep ? 'border-t-2' : ''}`}
                      style={sep ? { borderColor: BRAND.border } : undefined}>
                    <td className="px-2 py-1.5 max-w-[180px] truncate"
                        style={{ color: BRAND.ink, fontWeight: bold ? 700 : 400, fontFamily: FONTS.mono }}>
                      {linha.estrutura.nome}
                    </td>
                    <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono, fontWeight: bold ? 700 : 400 }}>{fmt(linha.realizado)}</td>
                    <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono, color: BRAND.muted }}>{linha.budget != null ? fmt(linha.budget) : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-medium" style={{ fontFamily: FONTS.mono, color: desvioColor }}>{fmt(desvio)}</td>
                    <td className="px-2 py-1.5 text-right font-medium" style={{ fontFamily: FONTS.mono, color: desvioColor }}>{linha.desvio_pct != null ? fmtPct(linha.desvio_pct) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (data.tipo === 'escalar') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {mostrar_titulo && config.titulo && (
          <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase shrink-0 border-b"
             style={{ fontFamily: FONTS.heading, color: BRAND.muted, borderColor: '#E4DFD5' }}>{config.titulo}</p>
        )}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Realizado', 'Comparativo', 'Variação %'].map(h => (
                  <th key={h} className="px-2 py-1.5 text-right whitespace-nowrap"
                      style={{ fontFamily: FONTS.mono, fontSize: 9, color: BRAND.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono }}>{fmt(data.valor)}</td>
                <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono, color: BRAND.muted }}>{data.comparativo != null ? fmt(data.comparativo) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-medium"
                    style={{ fontFamily: FONTS.mono, color: data.variacao_pct != null && data.variacao_pct >= 0 ? BRAND.positive : BRAND.danger }}>
                  {data.variacao_pct != null ? fmtPct(data.variacao_pct) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (data.tipo === 'serie') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {mostrar_titulo && config.titulo && (
          <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase shrink-0 border-b"
             style={{ fontFamily: FONTS.heading, color: BRAND.muted, borderColor: '#E4DFD5' }}>{config.titulo}</p>
        )}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Período','Realizado','Budget'].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left whitespace-nowrap"
                      style={{ fontFamily: FONTS.mono, fontSize: 9, color: BRAND.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.pontos.map((ponto, i) => (
                <tr key={i} className={i % 2 ? 'bg-[#FAFAF8]' : 'bg-white'}>
                  <td className="px-2 py-1.5" style={{ fontFamily: FONTS.mono, color: BRAND.ink }}>{ponto.periodo}</td>
                  <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono }}>{fmt(ponto.realizado)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono, color: BRAND.muted }}>{ponto.budget != null ? fmt(ponto.budget) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (data.tipo === 'topN') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {mostrar_titulo && config.titulo && (
          <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase shrink-0 border-b"
             style={{ fontFamily: FONTS.heading, color: BRAND.muted, borderColor: '#E4DFD5' }}>{config.titulo}</p>
        )}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['#','Descrição','Valor'].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left whitespace-nowrap"
                      style={{ fontFamily: FONTS.mono, fontSize: 9, color: BRAND.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.itens.map((item, i) => (
                <tr key={i} className={i % 2 ? 'bg-[#FAFAF8]' : 'bg-white'}>
                  <td className="px-2 py-1.5 w-8" style={{ fontFamily: FONTS.mono, color: BRAND.muted }}>{i + 1}</td>
                  <td className="px-2 py-1.5 max-w-[160px] truncate" style={{ color: BRAND.ink }}>{item.label}</td>
                  <td className="px-2 py-1.5 text-right" style={{ fontFamily: FONTS.mono }}>{fmt(item.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return <p className="text-sm text-gray-400 text-center p-4">Tipo de dado incompatível com tabela</p>
}
