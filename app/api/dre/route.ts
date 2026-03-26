import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getDREByAccount, getDREHierarchy, getDRELinhas, getDistinctValues, getCentrosByDepartamentos, getUserCentros } from '@/lib/query'
import { getSession } from '@/lib/session'
import type { FilterColumn } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const type = sp.get('type') ?? 'dre'

    const user = await getSession()
    const forcedDepts = user?.role === 'dept'
      ? (user.departments ?? (user.department ? [user.department] : []))
      : undefined

    // Permissões de centros de custo individuais (N:N)
    // null = sem restrição por centro; string[] = lista de centros permitidos
    const userCentros = (user?.role === 'dept' && user.userId)
      ? await getUserCentros(user.userId)
      : null

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
      const depts = forcedDepts?.length
        ? forcedDepts
        : sp.get('departamentos')?.split(',').filter(Boolean) ?? []
      let result = await getCentrosByDepartamentos(depts)
      // Aplica restrição individual de centros se configurada
      if (userCentros !== null) {
        result = result.filter(c => userCentros.includes(c.cc))
      }
      return NextResponse.json(result)
    }

    const periodos      = sp.get('periodos')?.split(',').filter(Boolean)
    const departamentos = forcedDepts?.length
      ? forcedDepts
      : sp.get('departamentos')?.split(',').filter(Boolean)

    // Aplica permissões individuais de centros:
    // intersecta com o que o usuário selecionou na UI (se houver)
    let centros = sp.get('centros')?.split(',').filter(Boolean)
    if (userCentros !== null) {
      centros = centros?.length
        ? centros.filter(c => userCentros.includes(c))
        : userCentros
    }

    if (type === 'accounts') {
      const data = await getDREByAccount(periodos, departamentos, centros)
      return NextResponse.json(data)
    }

    const data = await getDRE(periodos, departamentos, centros)
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
