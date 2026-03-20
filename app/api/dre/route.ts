import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getDREByAccount, getDREHierarchy, getDRELinhas, getDistinctValues, getCentrosByDepartamentos } from '@/lib/query'
import { getUserFromHeaders } from '@/lib/session'
import type { FilterColumn } from '@/lib/types'

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const type = sp.get('type') ?? 'dre'

    const user = getUserFromHeaders(req)
    const forcedDept = user?.role === 'dept' ? user.department : undefined

    if (type === 'hierarchy') {
      return NextResponse.json(getDREHierarchy())
    }

    if (type === 'linhas') {
      return NextResponse.json(getDRELinhas())
    }

    if (type === 'distinct') {
      const col = sp.get('col') as FilterColumn
      if (!col) return NextResponse.json({ error: 'col required' }, { status: 400 })
      return NextResponse.json(getDistinctValues(col))
    }

    if (type === 'centros') {
      const depts = sp.get('departamentos')?.split(',').filter(Boolean) ?? []
      return NextResponse.json(getCentrosByDepartamentos(depts))
    }

    const periodos      = sp.get('periodos')?.split(',').filter(Boolean)
    const departamentos = forcedDept
      ? [forcedDept]
      : sp.get('departamentos')?.split(',').filter(Boolean)
    const centros       = sp.get('centros')?.split(',').filter(Boolean)

    if (type === 'accounts') {
      const data = getDREByAccount(periodos, departamentos, centros)
      return NextResponse.json(data)
    }

    const data = getDRE(periodos, departamentos, centros)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
