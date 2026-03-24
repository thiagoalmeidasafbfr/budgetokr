'use client'
import { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { formatCurrency, formatPeriodo } from '@/lib/utils'
import { X, TrendingUp } from 'lucide-react'

interface TrendPoint { periodo: string; budget: number; razao: number }
interface ForecastPoint { periodo: string; value: number }

interface Props {
  title: string
  conta?: string
  agrupamento?: string
  dre?: string
  departamentos?: string[]
  onClose: () => void
}

export default function TrendChart({ title, conta, agrupamento, dre, departamentos, onClose }: Props) {
  const [series, setSeries]   = useState<TrendPoint[]>([])
  const [fcBudget, setFcBudget] = useState<ForecastPoint[]>([])
  const [fcRazao, setFcRazao]   = useState<ForecastPoint[]>([])
  const [lastClosed, setLastClosed] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showForecast, setShowForecast] = useState(true)
  const [forecastMonths, setForecastMonths] = useState(6)

  useEffect(() => {
    const p = new URLSearchParams()
    if (conta) p.set('conta', conta)
    if (agrupamento) p.set('agrupamento', agrupamento)
    if (dre) p.set('dre', dre)
    if (departamentos?.length) p.set('departamentos', departamentos.join(','))
    p.set('forecastMonths', String(forecastMonths))

    fetch(`/api/dre/trend?${p}`)
      .then(r => r.json())
      .then(data => {
        setSeries(data.series ?? [])
        setLastClosed(data.lastClosed ?? '')
        setFcBudget(data.forecast?.budget ?? [])
        setFcRazao(data.forecast?.razao ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [conta, agrupamento, dre, departamentos, forecastMonths])

  const chartData = useMemo(() => {
    type Point = { periodo: string; raw: string; budget?: number; razao?: number; budgetFc?: number; razaoFc?: number }
    const combined: Point[] = series.map(s => ({
      periodo: formatPeriodo(s.periodo),
      raw: s.periodo,
      budget: s.budget,
      // Hide razao for periods beyond the last closed month (incomplete data)
      razao: lastClosed && s.periodo > lastClosed ? undefined : s.razao,
    }))

    if (showForecast && fcRazao.length > 0) {
      // Bridge: anchor at the last closed month, not the last series point
      const bridgePoint = lastClosed
        ? combined.find(p => p.raw === lastClosed)
        : combined[combined.length - 1]

      if (bridgePoint) {
        bridgePoint.budgetFc = bridgePoint.budget
        bridgePoint.razaoFc = bridgePoint.razao
      }

      for (let i = 0; i < fcRazao.length; i++) {
        // Only add forecast point if not already present in series
        if (!combined.find(p => p.raw === fcRazao[i].periodo)) {
          combined.push({
            periodo: formatPeriodo(fcRazao[i].periodo),
            raw: fcRazao[i].periodo,
            budgetFc: fcBudget[i]?.value ?? undefined,
            razaoFc: fcRazao[i]?.value ?? undefined,
          })
        } else {
          const existing = combined.find(p => p.raw === fcRazao[i].periodo)!
          existing.budgetFc = fcBudget[i]?.value ?? undefined
          existing.razaoFc = fcRazao[i]?.value ?? undefined
        }
      }
    }
    return combined
  }, [series, fcBudget, fcRazao, showForecast, lastClosed])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide flex items-center gap-1">
              <TrendingUp size={12} /> Tendência
            </p>
            <h2 className="text-base font-bold text-gray-900 mt-0.5">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={showForecast} onChange={e => setShowForecast(e.target.checked)}
                className="w-3 h-3 accent-indigo-600" />
              Forecast
            </label>
            {showForecast && (
              <select value={forecastMonths} onChange={e => setForecastMonths(Number(e.target.value))}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1">
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
              </select>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><X size={16} /></button>
          </div>
        </div>

        <div className="flex-1 p-5 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-[400px]">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : series.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] text-gray-400 text-sm">Sem dados para exibir</div>
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(v) => (v != null ? formatCurrency(Number(v)) : '')} />
                <Legend />
                <Line type="monotone" dataKey="budget" name="Budget" stroke="#6366f1" strokeWidth={2}
                  dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="razao" name="Realizado" stroke="#10b981" strokeWidth={2}
                  dot={{ r: 3 }} connectNulls={false} />
                {showForecast && (
                  <>
                    <Line type="monotone" dataKey="budgetFc" name="Budget (Forecast)" stroke="#6366f1"
                      strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                    <Line type="monotone" dataKey="razaoFc" name="Real (Forecast)" stroke="#10b981"
                      strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
