import { NextRequest, NextResponse } from 'next/server'
import { getPorUnidade, getUnidadesDistintas } from '@/lib/query'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type        = searchParams.get('type')       ?? 'data'
  const periodosRaw = searchParams.get('periodos')   ?? ''
  const unidadesRaw = searchParams.get('unidades')   ?? ''

  try {
    if (type === 'distinct') {
      const [unidades, periodosData] = await Promise.all([
        getUnidadesDistintas(),
        (async () => {
          const supabase = getSupabase()
          const { data, error } = await supabase
            .from('lancamentos')
            .select('data_lancamento')
            .not('data_lancamento', 'is', null)
          if (error) throw new Error(error.message)
          const set = new Set<string>()
          for (const row of data ?? []) {
            if (row.data_lancamento) {
              const d = new Date(row.data_lancamento)
              if (!isNaN(d.getTime())) {
                set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
              }
            }
          }
          return [...set].sort()
        })(),
      ])
      return NextResponse.json({ unidades, periodos: periodosData })
    }

    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const unidades = unidadesRaw ? unidadesRaw.split(',').filter(Boolean) : []
    const rows = await getPorUnidade(periodos, unidades)
    return NextResponse.json({ rows })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
