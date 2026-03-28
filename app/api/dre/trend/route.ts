import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'
import { forecast, seasonalForecast, type TimePoint } from '@/lib/forecast'

// GET /api/dre/trend?conta=X&agrupamento=Y&dre=Z&departamentos=A,B&forecastMonths=6
export async function GET(req: NextRequest) {
  if (!getUserFromHeaders(req)) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = new URL(req.url).searchParams
    const conta       = sp.get('conta')
    const agrupamento = sp.get('agrupamento')
    const dre         = sp.get('dre')
    const depts       = sp.get('departamentos')
    const fMonths     = parseInt(sp.get('forecastMonths') ?? '6')

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('get_dre_trend', {
      p_conta:       conta || null,
      p_agrupamento: agrupamento || null,
      p_dre:         dre || null,
      p_departamentos: depts ? depts.split(',').filter(Boolean) : [],
    })
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as Array<{ periodo: string; tipo: string; total: number }>

    const byPeriod: Record<string, { budget: number; razao: number }> = {}
    for (const r of rows) {
      if (!r.periodo) continue
      if (!byPeriod[r.periodo]) byPeriod[r.periodo] = { budget: 0, razao: 0 }
      if (r.tipo === 'budget') byPeriod[r.periodo].budget += r.total
      else byPeriod[r.periodo].razao += r.total
    }

    const series = Object.entries(byPeriod)
      .map(([periodo, vals]) => ({ periodo, ...vals }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))

    // For razão: only use data up to the last closed month (month - 1) so the
    // trend line doesn't start from an incomplete current-month figure.
    const now = new Date()
    const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastClosed = `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}`

    const razaoData: TimePoint[]  = series
      .filter(s => s.periodo <= lastClosed)
      .map(s => ({ period: s.periodo, value: s.razao }))
    const budgetData: TimePoint[] = series.map(s => ({ period: s.periodo, value: s.budget }))

    const razaoForecast  = razaoData.length >= 12  ? seasonalForecast(razaoData,  fMonths) : forecast(razaoData,  fMonths)
    const budgetForecast = budgetData.length >= 12 ? seasonalForecast(budgetData, fMonths) : forecast(budgetData, fMonths)

    return NextResponse.json({
      series,
      lastClosed,
      forecast: {
        razao:  razaoForecast.map(f  => ({ periodo: f.period, value: f.value })),
        budget: budgetForecast.map(f => ({ periodo: f.period, value: f.value })),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
