import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getDREHierarchy, getDistinctValues } from '@/lib/query'
import type { FilterColumn } from '@/lib/types'

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const type = sp.get('type') ?? 'dre'

    if (type === 'hierarchy') {
      return NextResponse.json(getDREHierarchy())
    }

    if (type === 'distinct') {
      const col = sp.get('col') as FilterColumn
      if (!col) return NextResponse.json({ error: 'col required' }, { status: 400 })
      return NextResponse.json(getDistinctValues(col))
    }

    const periodos     = sp.get('periodos')?.split(',').filter(Boolean)
    const departamentos = sp.get('departamentos')?.split(',').filter(Boolean)

    const data = getDRE(periodos, departamentos)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
