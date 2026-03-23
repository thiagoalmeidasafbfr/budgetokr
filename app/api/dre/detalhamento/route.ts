import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Retorna os lançamentos individuais que compõem um valor da DRE
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const dre              = searchParams.get('dre')             ?? ''
  const agrupamento      = searchParams.get('agrupamento')     ?? ''
  const conta            = searchParams.get('conta')           ?? ''
  const periodo          = searchParams.get('periodo')         ?? ''
  const tipo             = searchParams.get('tipo')            ?? 'ambos'
  const departamento     = searchParams.get('departamento')    ?? ''
  const periodosRaw      = searchParams.get('periodos')        ?? ''
  const departamentosRaw = searchParams.get('departamentos')   ?? ''
  const centrosRaw       = searchParams.get('centros')         ?? ''
  const unidadesRaw      = searchParams.get('unidades')        ?? ''

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('get_dre_detalhamento', {
      p_dre:          dre || null,
      p_agrupamento:  agrupamento || null,
      p_conta:        conta || null,
      p_periodo:      periodo || null,
      p_tipo:         tipo === 'ambos' ? null : tipo,
      p_departamento: departamento || null,
      p_periodos:     periodosRaw ? periodosRaw.split(',').filter(Boolean) : [],
      p_departamentos: departamentosRaw ? departamentosRaw.split(',').filter(Boolean) : [],
      p_centros:      centrosRaw ? centrosRaw.split(',').filter(Boolean) : [],
      p_unidades:     unidadesRaw ? unidadesRaw.split(',').filter(Boolean) : [],
    })
    if (error) throw new Error(error.message)

    const LIMIT = 50000
    const rows = (data ?? []) as unknown[]
    const truncated = rows.length >= LIMIT
    return NextResponse.json({ rows, truncated })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
