import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { forecast, seasonalForecast, type TimePoint } from '@/lib/forecast'

// GET /api/dre/trend?conta=X&agrupamento=Y&dre=Z&departamentos=A,B&forecastMonths=6
export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const conta       = sp.get('conta')
    const agrupamento = sp.get('agrupamento')
    const dre         = sp.get('dre')
    const depts       = sp.get('departamentos')
    const fMonths     = parseInt(sp.get('forecastMonths') ?? '6')

    const db = getDb()
    const conditions: string[] = []
    const params: unknown[] = []

    if (conta)       { conditions.push('l.numero_conta_contabil = ?'); params.push(conta) }
    if (agrupamento) { conditions.push('ca.agrupamento_arvore = ?'); params.push(agrupamento) }
    if (dre)         { conditions.push('ca.dre = ?'); params.push(dre) }
    if (depts) {
      const list = depts.split(',').filter(Boolean)
      if (list.length) { conditions.push(`cc.departamento IN (${list.map(() => '?').join(',')})`); params.push(...list) }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const sql = `
      SELECT
        strftime('%Y-%m', l.data_lancamento) as periodo,
        l.tipo,
        SUM(l.debito_credito) as total
      FROM lancamentos l
      LEFT JOIN centros_custo cc ON l.centro_custo = cc.centro_custo
      LEFT JOIN contas_contabeis ca ON l.numero_conta_contabil = ca.numero_conta_contabil
      ${where}
      GROUP BY periodo, l.tipo
      ORDER BY periodo
    `
    const rows = db.prepare(sql).all(...params) as Array<{ periodo: string; tipo: string; total: number }>

    // Group by period, separate budget vs razao
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

    // Forecast
    const razaoData: TimePoint[] = series.map(s => ({ period: s.periodo, value: s.razao }))
    const budgetData: TimePoint[] = series.map(s => ({ period: s.periodo, value: s.budget }))

    const razaoForecast = razaoData.length >= 12
      ? seasonalForecast(razaoData, fMonths)
      : forecast(razaoData, fMonths)
    const budgetForecast = budgetData.length >= 12
      ? seasonalForecast(budgetData, fMonths)
      : forecast(budgetData, fMonths)

    return NextResponse.json({
      series,
      forecast: {
        razao: razaoForecast.map(f => ({ periodo: f.period, value: f.value })),
        budget: budgetForecast.map(f => ({ periodo: f.period, value: f.value })),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
