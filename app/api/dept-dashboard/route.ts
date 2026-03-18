import { NextRequest, NextResponse } from 'next/server'
import { getAnalise, getDRE, getMedidas } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const departamento = sp.get('departamento')
    const periodosRaw = sp.get('periodos')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : undefined

    if (!departamento) {
      return NextResponse.json({ error: 'departamento required' }, { status: 400 })
    }

    // Get analysis rows filtered by department
    const byPeriodo = getAnalise([], [departamento], periodos, false)

    // Get DRE data for the department and aggregate by dre name
    const dreRows = getDRE(periodos, [departamento])
    const dreMap: Record<string, { dre: string; budget: number; razao: number }> = {}
    for (const row of dreRows) {
      if (!dreMap[row.dre]) {
        dreMap[row.dre] = { dre: row.dre, budget: 0, razao: 0 }
      }
      dreMap[row.dre].budget += row.budget
      dreMap[row.dre].razao  += row.razao
    }
    const dreGrupos = Object.values(dreMap)

    // All medidas
    const medidas = getMedidas()

    return NextResponse.json({ byPeriodo, dreGrupos, medidas })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
