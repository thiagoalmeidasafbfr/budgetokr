import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getDREByAccount, getDREHierarchy, getDRELinhas, getDistinctValues, getCentrosByDepartamentos } from '@/lib/query'
import { getUserFromHeaders } from '@/lib/session'
import type { FilterColumn } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const type = sp.get('type') ?? 'dre'

    const user = getUserFromHeaders(req)
    const forcedDept = user?.role === 'dept' ? user.department : undefined

    if (type === 'hierarchy') {
      return NextResponse.json(await getDREHierarchy())
    }

    if (type === 'linhas') {
      return NextResponse.json(await getDRELinhas())
    }

    if (type === 'distinct') {
      const col = sp.get('col') as FilterColumn
      if (!col) return NextResponse.json({ error: 'col required' }, { status: 400 })
      return NextResponse.json(await getDistinctValues(col))
    }

    if (type === 'centros') {
      const depts = sp.get('departamentos')?.split(',').filter(Boolean) ?? []
      return NextResponse.json(await getCentrosByDepartamentos(depts))
    }

    const periodos      = sp.get('periodos')?.split(',').filter(Boolean)
    const departamentos = forcedDept
      ? [forcedDept]
      : sp.get('departamentos')?.split(',').filter(Boolean)
    const centros       = sp.get('centros')?.split(',').filter(Boolean)

    // Convert dept filter → centros filter before calling the SQL function.
    // get_dre/get_dre_by_account filter dept via a LEFT JOIN on centros_custo
    // (cc.nome_departamento = ANY(...)), which can silently return empty when
    // there are join mismatches. The detalhamento uses a safer 2-step approach:
    // resolve dept→centros first, then filter lancamentos by centro_custo directly.
    // We replicate that here so both views are consistent.
    let finalCentros = centros
    if (departamentos && departamentos.length > 0) {
      const ccList = (await getCentrosByDepartamentos(departamentos)) as Array<{ cc: string; nome: string }>
      const deptCentros = ccList.map(r => r.cc)
      if (deptCentros.length === 0) {
        return NextResponse.json([])
      }
      finalCentros = centros?.length
        ? centros.filter(c => deptCentros.includes(c))
        : deptCentros
    }

    if (type === 'accounts') {
      const data = await getDREByAccount(periodos, undefined, finalCentros)
      return NextResponse.json(data)
    }

    const data = await getDRE(periodos, undefined, finalCentros)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
