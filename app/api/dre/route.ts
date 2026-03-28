import { NextRequest, NextResponse } from 'next/server'
import { getDRE, getDREByAccount, getDREHierarchy, getDRELinhas, getDistinctValues, getCentrosByDepartamentos, getUserCentros } from '@/lib/query'
import { getSession } from '@/lib/session'
import type { FilterColumn } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Para dept users: intersecta os depts solicitados com os permitidos.
 *  Se nenhum solicitado → retorna todos os permitidos.
 *  Para master users (forcedDepts = undefined) → retorna solicitados como estão. */
function resolveDepts(forcedDepts: string[] | undefined, requested: string[]): string[] | undefined {
  if (!forcedDepts?.length) return requested.length ? requested : undefined
  if (!requested.length) return forcedDepts
  const intersected = requested.filter(d => forcedDepts.includes(d))
  return intersected.length > 0 ? intersected : forcedDepts
}

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const type = sp.get('type') ?? 'dre'

    // hierarchy, linhas e distinct são dados estruturais públicos — não precisam
    // de permissões de usuário, então pulamos getSession/getUserCentros aqui
    // para evitar queries desnecessárias ao banco em cada requisição de inicialização.
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

    // Para os demais tipos, verifica sessão e permissões
    const user = await getSession()
    const forcedDepts = user?.role === 'dept'
      ? (user.departments ?? (user.department ? [user.department] : []))
      : undefined

    // Permissões de centros de custo individuais (N:N)
    // null = sem restrição por centro; string[] = lista de centros permitidos
    const userCentros = (user?.role === 'dept' && user.userId)
      ? await getUserCentros(user.userId)
      : null

    if (type === 'centros') {
      const depts = resolveDepts(forcedDepts, sp.get('departamentos')?.split(',').filter(Boolean) ?? [])
      let result = await getCentrosByDepartamentos(depts)
      // Aplica restrição individual de centros se configurada
      if (userCentros !== null) {
        result = result.filter(c => userCentros.includes(c.cc))
      }
      return NextResponse.json(result)
    }

    const periodos      = sp.get('periodos')?.split(',').filter(Boolean)
    const departamentos = resolveDepts(forcedDepts, sp.get('departamentos')?.split(',').filter(Boolean) ?? [])

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
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
