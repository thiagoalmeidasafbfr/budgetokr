import { NextRequest, NextResponse } from 'next/server'
import { getDRE } from '@/lib/query'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp          = new URL(req.url).searchParams
    const topN        = Math.min(Math.max(parseInt(sp.get('topN') ?? '5'), 1), 30)
    const field       = (sp.get('field') ?? 'razao') as 'budget' | 'razao' | 'variacao'
    const dreGroup    = sp.get('dreGroup') ?? ''
    const periodosRaw = sp.get('periodos') ?? ''
    const deptsRaw    = sp.get('departamentos') ?? ''

    const periodos     = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const departamentos = deptsRaw   ? deptsRaw.split(',').filter(Boolean)   : []

    // Auth: dept users can only see their own departments
    const user = await getSession()
    const forcedDepts = user?.role === 'dept'
      ? (user.departments ?? (user.department ? [user.department] : []))
      : undefined

    const activeDepts = forcedDepts?.length
      ? departamentos.length
        ? departamentos.filter(d => forcedDepts.includes(d)).length
          ? departamentos.filter(d => forcedDepts.includes(d))
          : forcedDepts
        : forcedDepts
      : departamentos.length ? departamentos : undefined

    const rows = await getDRE(periodos, activeDepts ?? [], [])

    // Aggregate by agrupamento_arvore, optionally filtering by DRE group
    const acc: Record<string, { budget: number; razao: number }> = {}
    for (const r of rows) {
      if (dreGroup && r.dre !== dreGroup) continue
      if (!acc[r.agrupamento_arvore]) acc[r.agrupamento_arvore] = { budget: 0, razao: 0 }
      acc[r.agrupamento_arvore].budget += r.budget
      acc[r.agrupamento_arvore].razao  += r.razao
    }

    const getValue = (b: number, r: number) =>
      field === 'budget'   ? b
      : field === 'razao'  ? r
      : r - b

    const sorted = Object.entries(acc)
      .map(([name, { budget, razao }]) => ({
        name,
        budget,
        razao,
        variacao: razao - budget,
        value: getValue(budget, razao),
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

    const top    = sorted.slice(0, topN)
    const rest   = sorted.slice(topN)

    if (rest.length > 0) {
      const othBudget   = rest.reduce((s, r) => s + r.budget,   0)
      const othRazao    = rest.reduce((s, r) => s + r.razao,    0)
      top.push({
        name:     `Outros (${rest.length})`,
        budget:   othBudget,
        razao:    othRazao,
        variacao: othRazao - othBudget,
        value:    getValue(othBudget, othRazao),
      })
    }

    // Also return available DRE groups for the filter selector
    const dreGroups = [...new Set(rows.map(r => r.dre))].filter(Boolean).sort()

    return NextResponse.json({ items: top, dreGroups })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
