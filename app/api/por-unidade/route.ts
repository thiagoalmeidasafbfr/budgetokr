import { NextRequest, NextResponse } from 'next/server'
import { getPorUnidade, getUnidadesDistintas } from '@/lib/query'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const user = await getSession()
    const forcedDept = user?.role === 'dept' ? user.department : undefined

    const type = sp.get('type') ?? 'data'

    if (type === 'distinct') {
      const [unidades, periodosData] = await Promise.all([
        getUnidadesDistintas(),
        getSupabase()
          .from('lancamentos')
          .select('data_lancamento')
          .not('data_lancamento', 'is', null)
          .then(r => r.data ?? []),
      ])

      const periodSet = new Set<string>()
      for (const r of periodosData) {
        if (r.data_lancamento) {
          const d = new Date(r.data_lancamento)
          if (!isNaN(d.getTime())) {
            periodSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }
        }
      }

      return NextResponse.json({
        unidades,
        periodos: [...periodSet].sort(),
      })
    }

    // type === 'data' — return flat rows for the tree
    const periodosRaw = sp.get('periodos')
    const unidadesRaw = sp.get('unidades')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const unidades = forcedDept
      ? [forcedDept]
      : unidadesRaw ? unidadesRaw.split(',').filter(Boolean) : []

    const rows = await getPorUnidade(periodos, unidades)
    return NextResponse.json({ rows })
  } catch (e) {
    console.error('[por-unidade GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
