import { NextRequest, NextResponse } from 'next/server'
import { getAnalise, getMedidaResultados, getDistinctValues, getSummary } from '@/lib/query'
import type { FilterCondition, FilterColumn } from '@/lib/types'

export async function GET(req: NextRequest) {
  try {
    const sp     = new URL(req.url).searchParams
    const type   = sp.get('type') ?? 'analise'
    const medidaId = sp.get('medidaId')

    if (type === 'summary') {
      return NextResponse.json(getSummary())
    }

    if (type === 'distinct') {
      const col = sp.get('col') as FilterColumn
      if (!col) return NextResponse.json({ error: 'col required' }, { status: 400 })
      return NextResponse.json(getDistinctValues(col))
    }

    if (type === 'medida' && medidaId) {
      const results = getMedidaResultados(parseInt(medidaId))
      return NextResponse.json(results)
    }

    // Default: full comparison
    const departamentos = sp.get('departamentos')?.split(',').filter(Boolean)
    const periodos      = sp.get('periodos')?.split(',').filter(Boolean)
    const filtersRaw    = sp.get('filtros')
    const filtros: FilterCondition[] = filtersRaw ? JSON.parse(filtersRaw) : []

    const data = getAnalise(filtros, departamentos, periodos)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
