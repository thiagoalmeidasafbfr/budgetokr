import { NextRequest, NextResponse } from 'next/server'
import { getAnalise, getMedidaResultados, getDistinctValues, getSummary, getRazaoPeriods } from '@/lib/query'
import { getSession } from '@/lib/session'
import type { FilterCondition, FilterColumn } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const type     = sp.get('type') ?? 'analise'
    const medidaId = sp.get('medidaId')

    const user = await getSession()
    const forcedDept = user?.role === 'dept' ? user.department : undefined

    if (type === 'summary') {
      return NextResponse.json(await getSummary())
    }

    if (type === 'razao-periods') {
      return NextResponse.json(await getRazaoPeriods())
    }

    if (type === 'distinct') {
      const col = sp.get('col') as FilterColumn
      if (!col) return NextResponse.json({ error: 'col required' }, { status: 400 })
      return NextResponse.json(await getDistinctValues(col))
    }

    if (type === 'medida' && medidaId) {
      const groupByDept        = sp.get('groupByDept')        !== 'false'
      const groupByPeriod      = sp.get('groupByPeriod')      !== 'false'
      const groupByCentroCusto = sp.get('groupByCentroCusto') === 'true'
      const periodosRaw        = sp.get('periodos')
      const periodos           = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []

      const extraFiltros = forcedDept
        ? [{ column: 'nome_departamento' as FilterColumn, operator: '=' as const, value: forcedDept }]
        : []

      const results = await getMedidaResultados(parseInt(medidaId), {
        groupByDept,
        groupByPeriod,
        groupByCentroCusto,
        periodos,
        extraFiltros,
      })
      return NextResponse.json(results)
    }

    const departamentos = forcedDept
      ? [forcedDept]
      : sp.get('departamentos')?.split(',').filter(Boolean)
    const periodos       = sp.get('periodos')?.split(',').filter(Boolean)
    const filtersRaw     = sp.get('filtros')
    const filtros: FilterCondition[] = filtersRaw ? JSON.parse(filtersRaw) : []
    const groupByCentro  = sp.get('groupByCentro') === 'true'

    const data = await getAnalise(filtros, departamentos, periodos, groupByCentro)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
