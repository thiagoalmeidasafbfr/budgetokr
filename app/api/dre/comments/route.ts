import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp       = new URL(req.url).searchParams
    const context  = sp.get('context') ?? 'dre'
    const periodos = sp.get('periodos')

    const user     = getUserFromHeaders(req)
    const supabase = getSupabase()

    let query = supabase.from('dre_comments').select('*').order('created_at', { ascending: false })

    if (context === 'log') {
      if (user?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
      // no extra conditions
    } else if (context === 'dept-log') {
      const depts = user?.role === 'dept'
        ? (user.departments ?? (user.department ? [user.department] : []))
        : sp.get('dept') ? [sp.get('dept')!] : []
      if (!depts.length) return NextResponse.json([])
      query = depts.length === 1
        ? query.eq('departamento', depts[0])
        : query.in('departamento', depts)
    } else {
      // 'dre' context
      if (user?.role === 'dept') {
        const depts = user.departments ?? (user.department ? [user.department] : [])
        query = depts.length === 1
          ? query.eq('departamento', depts[0])
          : query.in('departamento', depts)
      } else {
        query = query.eq('user_role', 'master').is('parent_id', null).is('departamento', null)
      }
    }

    if (periodos) {
      const list = periodos.split(',').filter(Boolean)
      if (list.length) {
        query = query.or(`periodo.in.(${list.join(',')}),periodo.is.null`)
      }
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('[dre/comments]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const body = await req.json()
    const { dre_linha, agrupamento, conta, periodo, tipo_valor, texto, parent_id, filter_state, lancamento_id } = body
    if (!dre_linha || !texto) return NextResponse.json({ error: 'dre_linha e texto obrigatórios' }, { status: 400 })

    const supabase = getSupabase()

    let departamento = user?.department ?? null
    if (parent_id) {
      const { data: parent } = await supabase
        .from('dre_comments').select('departamento').eq('id', parent_id).single()
      if (parent) departamento = parent.departamento
      await supabase
        .from('dre_comments')
        .update({ status: 'replied' })
        .eq('id', parent_id)
    }

    const { data, error } = await supabase
      .from('dre_comments')
      .insert({
        dre_linha,
        agrupamento:  agrupamento  ?? null,
        conta:        conta        ?? null,
        periodo:      periodo      ?? null,
        tipo_valor:   tipo_valor   ?? 'realizado',
        texto,
        usuario:      user?.userId ?? null,
        user_role:    user?.role   ?? 'master',
        departamento,
        parent_id:    parent_id    ?? null,
        status:       'open',
        filter_state: filter_state ?? {},
        lancamento_id: lancamento_id ?? null,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dre/comments]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const { id, action, texto, motivo } = await req.json()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const supabase = getSupabase()

    if (action === 'close') {
      let query = supabase.from('dre_comments').update({
        status: 'closed',
        resolved_at: new Date().toISOString(),
        resolved_by: user?.userId ?? 'master',
        resolved_motivo: motivo ?? '',
      }).eq('id', id)
      // dept users can only close comments from their own department
      if (user?.role === 'dept') {
        query = query.eq('departamento', user.department ?? '')
      }
      const { error } = await query
      if (error) throw new Error(error.message)
    } else {
      if (!texto) return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 })
      // users can only edit their own comments
      const { error } = await supabase.from('dre_comments')
        .update({ texto })
        .eq('id', id)
        .eq('usuario', user?.userId ?? '')
      if (error) throw new Error(error.message)
    }

    const { data } = await supabase.from('dre_comments').select('*').eq('id', id).single()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[dre/comments]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = getUserFromHeaders(req)
    const id   = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

    const supabase = getSupabase()
    if (user?.role === 'dept') {
      // Get IDs of comments that have replies
      const { data: replies } = await supabase
        .from('dre_comments')
        .select('parent_id')
        .not('parent_id', 'is', null)
      const parentIds = new Set((replies ?? []).map((r: { parent_id: number }) => r.parent_id))
      if (parentIds.has(parseInt(id))) {
        return NextResponse.json({ error: 'Não pode excluir ticket com respostas' }, { status: 400 })
      }
      await supabase.from('dre_comments')
        .delete()
        .eq('id', id)
        .eq('usuario', user.userId ?? '')
        .is('parent_id', null)
    } else {
      await supabase.from('dre_comments').delete().eq('id', id)
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[dre/comments]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
