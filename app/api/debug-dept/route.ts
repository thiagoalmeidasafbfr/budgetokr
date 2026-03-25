import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  const supabase = getSupabase()

  const dept = session?.role === 'dept' ? session.department : undefined

  // Test 1: get_dre with the session dept
  const { data: dreData, error: dreError } = await supabase.rpc('get_dre', {
    p_periodos:      ['2026-01', '2026-02'],
    p_departamentos: dept ? [dept] : [],
    p_centros:       [],
  })

  // Test 2: verify dept name from centros_custo table
  const { data: ccData, error: ccError } = await supabase
    .from('centros_custo')
    .select('nome_departamento')
    .limit(5)

  return NextResponse.json({
    session,
    dept_used: dept,
    dre_row_count: Array.isArray(dreData) ? dreData.length : (dreData ? 'non-array' : 'null'),
    dre_first_row: Array.isArray(dreData) ? dreData[0] : dreData,
    dre_error: dreError?.message ?? null,
    dre_raw_type: typeof dreData,
    centros_sample: ccData?.slice(0, 5) ?? null,
    cc_error: ccError?.message ?? null,
  })
}
