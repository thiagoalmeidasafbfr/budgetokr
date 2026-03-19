import { NextRequest, NextResponse } from 'next/server'
import { getDeptMedidas, upsertDeptMedida, deleteDeptMedida, getMedidas } from '@/lib/query'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req)
  const forcedDept = user?.role === 'dept' ? user.department : undefined
  const dept = forcedDept || req.nextUrl.searchParams.get('departamento') || ''
  const pinned  = getDeptMedidas(dept)
  const allMedidas = getMedidas()
  // Filter medidas by department: only show medidas assigned to this dept or unassigned (available to all)
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
  upsertDeptMedida(departamento, Number(medidaId))
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { departamento, medidaId } = await req.json()
  deleteDeptMedida(departamento, Number(medidaId))
  return NextResponse.json({ ok: true })
}
