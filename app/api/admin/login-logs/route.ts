import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const sp      = new URL(req.url).searchParams
  const page    = Math.max(1, parseInt(sp.get('page') ?? '1'))
  const q       = sp.get('q') ?? ''
  const success = sp.get('success') // '0' | '1' | null
  const limit   = 100
  const offset  = (page - 1) * limit

  const supabase = getSupabase()

  let query = supabase
    .from('login_logs')
    .select('id, user_id, role, department, success, ip, user_agent, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q) {
    query = query.or(`user_id.ilike.%${q}%,ip.ilike.%${q}%`)
  }
  if (success !== null && success !== '') {
    query = query.eq('success', success === '1')
  }

  const { data: rows, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = count ?? 0
  return NextResponse.json({ rows: rows ?? [], total, page, pages: Math.ceil(total / limit) })
}
