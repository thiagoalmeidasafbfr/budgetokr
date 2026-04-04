import { NextRequest, NextResponse } from 'next/server'
import { getBoardData, getDistinctValues, getCentrosByDepartamentos, getUserCentros } from '@/lib/query'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function resolveDepts(forcedDepts: string[] | undefined, requested: string[]): string[] | undefined {
  if (!forcedDepts?.length) return requested.length ? requested : undefined
  if (!requested.length) return forcedDepts
  const intersected = requested.filter(d => forcedDepts.includes(d))
  return intersected.length > 0 ? intersected : forcedDepts
}

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const type = sp.get('type') ?? 'board'

    // ── Dados estruturais sem autenticação ──────────────────────────────────
    if (type === 'dre_groups') {
      const data = await getDistinctValues('dre')
      return NextResponse.json(data)
    }

    // ── Demais tipos exigem sessão ──────────────────────────────────────────
    const user = await getSession()
    const forcedDepts = user?.role === 'dept'
      ? (user.departments ?? (user.department ? [user.department] : []))
      : undefined

    const userCentros = (user?.role === 'dept' && user.userId)
      ? await getUserCentros(user.userId)
      : null

    // ── Listar centros de custo acessíveis ──────────────────────────────────
    if (type === 'centros') {
      const depts = resolveDepts(forcedDepts, sp.get('departamentos')?.split(',').filter(Boolean) ?? [])
      let result = await getCentrosByDepartamentos(depts ?? [])
      if (userCentros !== null) result = result.filter(c => userCentros.includes(c.cc))
      return NextResponse.json(result)
    }

    // ── Board data (get_board_data) ─────────────────────────────────────────
    const periodos = sp.get('periodos')?.split(',').filter(Boolean)

    // Resolve centros: aplica restrições individuais (userCentros) sobre o que foi pedido
    let centros = sp.get('centros')?.split(',').filter(Boolean)

    // Se dept user, forçar filtro para os centros do departamento
    if (forcedDepts?.length) {
      const deptCentros = await getCentrosByDepartamentos(forcedDepts)
      const deptCentroIds = deptCentros.map(c => c.cc)
      if (centros?.length) {
        centros = centros.filter(c => deptCentroIds.includes(c))
      } else {
        centros = deptCentroIds
      }
    }

    // Aplica restrições individuais de centros
    if (userCentros !== null) {
      centros = centros?.length
        ? centros.filter(c => userCentros.includes(c))
        : userCentros
    }

    const data = await getBoardData(periodos, centros)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[onepage-insights]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
