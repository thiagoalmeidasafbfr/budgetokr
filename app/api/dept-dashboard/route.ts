import { NextRequest, NextResponse } from 'next/server'
import { getAnalise, getDRE, getMedidas, getDRELinhas, getDeptMedidas, getMedidaResultados } from '@/lib/query'
import { getUserFromHeaders } from '@/lib/session'
import type { Medida } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const periodosRaw = sp.get('periodos')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : undefined
    const ano = sp.get('ano') ?? undefined

    const user = getUserFromHeaders(req)
    const forcedDept = user?.role === 'dept' ? user.department : undefined

    // dept users só podem ver o próprio departamento
    const departamento = forcedDept || sp.get('departamento')

    if (!departamento) {
      return NextResponse.json({ error: 'departamento required' }, { status: 400 })
    }

    // Get analysis rows filtered by department
    const byPeriodo = getAnalise([], [departamento], periodos, false, ano)

    // Get DRE data for the department and aggregate by dre name
    const dreRows = getDRE(periodos, [departamento], undefined, ano)
    const dreMap: Record<string, { dre: string; budget: number; razao: number; ordem_dre: number }> = {}
    for (const row of dreRows) {
      if (!dreMap[row.dre]) {
        dreMap[row.dre] = { dre: row.dre, budget: 0, razao: 0, ordem_dre: row.ordem_dre ?? 999 }
      }
      dreMap[row.dre].budget += row.budget
      dreMap[row.dre].razao  += row.razao
      if ((row.ordem_dre ?? 999) < dreMap[row.dre].ordem_dre) {
        dreMap[row.dre].ordem_dre = row.ordem_dre ?? 999
      }
    }

    // Sort by the same order used in the main DRE page: dre_linhas.ordem
    // Fall back to ordem_dre if a group isn't in dre_linhas
    const dreLinhas = getDRELinhas()
    const linhasOrder: Record<string, number> = {}
    for (const l of dreLinhas) {
      if (l.tipo === 'grupo') linhasOrder[l.nome] = l.ordem
    }

    const dreGrupos = Object.values(dreMap).sort((a, b) => {
      const oa = linhasOrder[a.dre] ?? (1000 + a.ordem_dre)
      const ob = linhasOrder[b.dre] ?? (1000 + b.ordem_dre)
      return oa - ob
    })

    // Pinned medidas for this dept — compute sparklines grouped by period
    const allMedidas = getMedidas()
    const medidaById: Record<number, Medida> = {}
    for (const m of allMedidas) medidaById[m.id] = m

    const deptMedidas = getDeptMedidas(departamento)
    const medidaCards = deptMedidas.map(dm => {
      const medida = medidaById[dm.medida_id]
      if (!medida) return null
      // Skip medidas not assigned to this department
      const mDepts: string[] = Array.isArray(medida.departamentos) ? medida.departamentos : []
      if (mDepts.length > 0 && !mDepts.includes(departamento)) return null
      const isRatio = medida.tipo_medida === 'ratio'
      const resultados = getMedidaResultados(dm.medida_id, {
        groupByDept: false,
        groupByPeriod: true,
        periodos: periodos ?? [],
        extraFiltros: [{ column: 'nome_departamento', operator: '=', value: departamento }],
      })

      type PeriodoData = {
        budget: number; razao: number
        num_razao: number; num_budget: number
        den_razao: number; den_budget: number
      }
      const byPeriodoMedida = resultados.reduce<Record<string, PeriodoData>>((acc, r) => {
        if (!acc[r.periodo]) acc[r.periodo] = { budget: 0, razao: 0, num_razao: 0, num_budget: 0, den_razao: 0, den_budget: 0 }
        if (isRatio) {
          acc[r.periodo].num_razao  += r.numerador_razao  ?? 0
          acc[r.periodo].num_budget += r.numerador_budget ?? 0
          acc[r.periodo].den_razao  += r.denominador_razao  ?? 0
          acc[r.periodo].den_budget += r.denominador_budget ?? 0
          // recompute ratio for the period (in case multiple rows aggregate)
          const dr = acc[r.periodo].den_razao,  db = acc[r.periodo].den_budget
          acc[r.periodo].razao  = dr ? acc[r.periodo].num_razao  / Math.abs(dr) * 100 : 0
          acc[r.periodo].budget = db ? acc[r.periodo].num_budget / Math.abs(db) * 100 : 0
        } else {
          acc[r.periodo].budget += r.budget
          acc[r.periodo].razao  += r.razao
        }
        return acc
      }, {})

      return { medida, isRatio, byPeriodo: byPeriodoMedida }
    }).filter(Boolean)

    return NextResponse.json({ byPeriodo, dreGrupos, medidaCards })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
