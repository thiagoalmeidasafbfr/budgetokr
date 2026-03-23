import { NextRequest, NextResponse } from 'next/server'
import { getAnalise, getDRE, getMedidas, getDRELinhas, getDeptMedidas, getMedidaResultados } from '@/lib/query'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'
import type { Medida } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const periodosRaw = sp.get('periodos')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : undefined

    const user = getUserFromHeaders(req)
    const forcedDept = user?.role === 'dept' ? user.department : undefined

    const departamento = forcedDept || sp.get('departamento')

    if (!departamento) {
      return NextResponse.json({ error: 'departamento required' }, { status: 400 })
    }

    const [byPeriodo, dreRows, allMedidas, dreLinhas, deptMedidas] = await Promise.all([
      getAnalise([], [departamento], periodos, false),
      getDRE(periodos, [departamento]),
      getMedidas(),
      getDRELinhas(),
      getDeptMedidas(departamento),
    ])

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

    const linhasOrder: Record<string, number> = {}
    for (const l of dreLinhas) {
      if (l.tipo === 'grupo') linhasOrder[l.nome] = l.ordem
    }

    const dreGrupos = Object.values(dreMap).sort((a, b) => {
      const oa = linhasOrder[a.dre] ?? (1000 + a.ordem_dre)
      const ob = linhasOrder[b.dre] ?? (1000 + b.ordem_dre)
      return oa - ob
    })

    const medidaById: Record<number, Medida> = {}
    for (const m of allMedidas) medidaById[m.id] = m

    const medidaCards = await Promise.all(deptMedidas.map(async dm => {
      const medida = medidaById[dm.medida_id]
      if (!medida) return null
      const mDepts: string[] = Array.isArray(medida.departamentos) ? medida.departamentos : []
      if (mDepts.length > 0 && !mDepts.includes(departamento)) return null
      const isRatio = medida.tipo_medida === 'ratio'
      const resultados = await getMedidaResultados(dm.medida_id, {
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
          const dr = acc[r.periodo].den_razao, db2 = acc[r.periodo].den_budget
          acc[r.periodo].razao  = dr  ? acc[r.periodo].num_razao  / Math.abs(dr)  * 100 : 0
          acc[r.periodo].budget = db2 ? acc[r.periodo].num_budget / Math.abs(db2) * 100 : 0
        } else {
          acc[r.periodo].budget += r.budget
          acc[r.periodo].razao  += r.razao
        }
        return acc
      }, {})

      return { medida, isRatio, byPeriodo: byPeriodoMedida }
    }))

    // CAPEX summary by project for this department
    const supabase = getSupabase()
    const { data: capexData, error: capexError } = await supabase.rpc('get_capex_by_dept', {
      p_departamento: departamento,
      p_periodos:     periodos ?? [],
    })
    if (capexError) throw new Error(capexError.message)

    const capexRows = ((capexData ?? []) as Array<{ nome_projeto: string; budget: number; razao: number }>).map(r => ({
      ...r,
      budget: r.budget ?? 0,
      razao: r.razao ?? 0,
      variacao: (r.razao ?? 0) - (r.budget ?? 0),
      variacao_pct: r.budget ? (((r.razao ?? 0) - r.budget) / Math.abs(r.budget)) * 100 : 0,
    }))

    return NextResponse.json({
      byPeriodo,
      dreGrupos,
      medidaCards: medidaCards.filter(Boolean),
      capexProjetos: capexRows,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
