import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('user_favorites')
      .select('*')
      .eq('usuario', user.userId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { nome, url, filtros, icone } = await req.json()
    if (!nome || !url) return NextResponse.json({ error: 'nome e url obrigatórios' }, { status: 400 })

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('user_favorites')
      .insert({ usuario: user.userId, nome, url, filtros: filtros ?? {}, icone: icone ?? 'star' })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const supabase = getSupabase()
    const { error } = await supabase.from('user_favorites').delete().eq('id', id).eq('usuario', user.userId)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
