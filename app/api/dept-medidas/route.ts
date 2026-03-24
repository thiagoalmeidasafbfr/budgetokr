import { NextRequest, NextResponse } from 'next/server'
import { getDeptMedidas, upsertDeptMedida, deleteDeptMedida, getMedidas } from '@/lib/query'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSession()
  const forcedDept = user?.role === 'dept' ? user.department : undefined
  const dept = forcedDept || req.nextUrl.searchParams.get('departamento') || ''
  const [pinned, allMedidas] = await Promise.all([getDeptMedidas(dept), getMedidas()])
  const medidas = dept
    ? allMedidas.filter(m => {
        const depts: string[] = Array.isArray(m.departamentos) ? m.departamentos : JSON.parse(m.departamentos || '[]')
        return depts.length === 0 || depts.includes(dept)
      })
    : allMedidas
  return NextResponse.json({ pinned, medidas })
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
