import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json(null)

    const { data, error } = await getSupabase()
      .from('one_page_layouts')
      .select('*')
      .eq('user_id', session.userId)
      .eq('name', 'Meu Dashboard')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { name = 'Meu Dashboard', widgets = [], layout = [] } = await req.json()

    const { data, error } = await getSupabase()
      .from('one_page_layouts')
      .upsert(
        {
          user_id: session.userId,
          name,
          widgets,
          layout,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,name' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
