import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Ensures the table exists. Called lazily on first error.
async function ensureTable() {
  const supabase = getSupabase()
  // Try via exec_sql RPC (may not exist in all projects)
  try {
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS exec_chart_configs (
          id          BIGSERIAL PRIMARY KEY,
          dept_name   TEXT NOT NULL UNIQUE,
          configs     JSONB NOT NULL DEFAULT '[]',
          updated_at  TIMESTAMPTZ DEFAULT NOW()
        );
      `,
    })
    return // success
  } catch {
    // exec_sql RPC does not exist — fall through
  }
  // Table likely missing: log a clear warning so it's visible in server logs.
  console.error(
    '[exec-chart-config] Table exec_chart_configs not found and could not be auto-created.' +
    ' Run supabase/migrations/001_exec_chart_configs.sql in the Supabase SQL Editor.'
  )
}

// GET /api/exec-chart-config?dept_name=X
export async function GET(req: NextRequest) {
  const deptName = new URL(req.url).searchParams.get('dept_name') ?? '__dashboard__'
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('exec_chart_configs')
    .select('configs')
    .eq('dept_name', deptName)
    .maybeSingle()
  if (error) {
    // Table may not exist yet — try to create it and return empty for now
    await ensureTable()
    return NextResponse.json({ configs: [] })
  }
  return NextResponse.json({ configs: data?.configs ?? [] })
}

// POST /api/exec-chart-config
// Body: { dept_name: string, configs: ExecChartConfig[] }
// Master users can write for any dept_name.
// Dept users can only write for their own department(s).
export async function POST(req: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { dept_name, configs } = await req.json() as { dept_name: string; configs: unknown[] }
    if (!dept_name) return NextResponse.json({ error: 'dept_name required' }, { status: 400 })

    // Dept users may only save their own dept configs
    if (user.role === 'dept') {
      const allowed = user.departments ?? (user.department ? [user.department] : [])
      if (!allowed.includes(dept_name) && dept_name !== '__dashboard__') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const supabase = getSupabase()
    const { error } = await supabase
      .from('exec_chart_configs')
      .upsert(
        { dept_name, configs, updated_at: new Date().toISOString() },
        { onConflict: 'dept_name' }
      )
    if (error) {
      // Table may not exist — try to create it
      await ensureTable()
      // Retry once
      const { error: err2 } = await supabase
        .from('exec_chart_configs')
        .upsert(
          { dept_name, configs, updated_at: new Date().toISOString() },
          { onConflict: 'dept_name' }
        )
      if (err2) { console.error('[exec-chart-config]', err2.message); return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 }) }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[exec-chart-config]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
