import { NextRequest, NextResponse } from 'next/server'
import { getDeptMedidas, upsertDeptMedida, deleteDeptMedida, getMedidas } from '@/lib/query'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSession()
  const forcedDepts = user?.role === 'dept'
    ? (user.departments ?? (user.department ? [user.department] : []))
    : undefined
  const paramDept = req.nextUrl.searchParams.get('departamento') || ''

  const [allMedidas] = await Promise.all([getMedidas()])

  if (forcedDepts?.length) {
    // Agrega pinned e medidas de todos os departamentos atribuídos
    const pinnedResults = await Promise.all(forcedDepts.map(d => getDeptMedidas(d)))
    const seen = new Set<number>()
    const pinned = pinnedResults.flat().filter(p => { if (seen.has(p.medida_id)) return false; seen.add(p.medida_id); return true })
    const medidas = allMedidas.filter(m => {
      const depts: string[] = Array.isArray(m.departamentos) ? m.departamentos : JSON.parse(m.departamentos || '[]')
      return depts.length === 0 || depts.some(d => forcedDepts.includes(d))
    })
    return NextResponse.json({ pinned, medidas })
  }

  const dept = paramDept
  const [pinned, medidas2] = await Promise.all([
    dept ? getDeptMedidas(dept) : Promise.resolve([]),
    Promise.resolve(
      dept
        ? allMedidas.filter(m => {
            const depts: string[] = Array.isArray(m.departamentos) ? m.departamentos : JSON.parse(m.departamentos || '[]')
            return depts.length === 0 || depts.includes(dept)
          })
        : allMedidas
    ),
  ])
  return NextResponse.json({ pinned, medidas: medidas2 })
}

export async function POST(req: NextRequest) {
  const { departamento, medidaId } = await req.json()
  await upsertDeptMedida(departamento, Number(medidaId))
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { departamento, medidaId } = await req.json()
  await deleteDeptMedida(departamento, Number(medidaId))
  return NextResponse.json({ ok: true })
}
