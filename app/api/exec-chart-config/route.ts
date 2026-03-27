import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Ensures the table exists. Called lazily on first error.
async function ensureTable() {
  const supabase = getSupabase()
  // Use rpc if available, otherwise the upsert below will fail gracefully
  try {
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS exec_chart_configs (
          id          BIGSERIAL PRIMARY KEY,
          dept_name   TEXT NOT NULL UNIQUE,
          configs     JSONB NOT NULL DEFAULT '[]',
          updated_at  TIMESTAMPTZ DEFAULT NOW()
        );
        ALTER TABLE exec_chart_configs DISABLE ROW LEVEL SECURITY;
      `,
    })
  } catch {
    // exec_sql function may not exist — user must create table manually
  }
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
// Only master users can write
export async function POST(req: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'master') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { dept_name, configs } = await req.json() as { dept_name: string; configs: unknown[] }
    if (!dept_name) return NextResponse.json({ error: 'dept_name required' }, { status: 400 })

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
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
