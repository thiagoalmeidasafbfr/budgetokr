import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

const UNAUTHORIZED = NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
const FORBIDDEN    = NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

// GET /api/dimensoes?tipo=centros_custo|contas_contabeis&q=...
export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (!user) return UNAUTHORIZED
  try {
    const sp   = new URL(req.url).searchParams
    const tipo = sp.get('tipo') ?? 'centros_custo'
    const q    = sp.get('q') ?? ''
    const supabase = getSupabase()

    if (tipo === 'centros_custo') {
      let query = supabase.from('centros_custo').select('*').order('centro_custo').limit(500)
      if (q) {
        query = query.or(`centro_custo.ilike.%${q}%,nome_centro_custo.ilike.%${q}%,departamento.ilike.%${q}%`)
      }
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return NextResponse.json(data ?? [])
    }

    if (tipo === 'contas_contabeis') {
      let query = supabase.from('contas_contabeis').select('*').order('numero_conta_contabil').limit(500)
      if (q) {
        query = query.or(`numero_conta_contabil.ilike.%${q}%,nome_conta_contabil.ilike.%${q}%,agrupamento_arvore.ilike.%${q}%,dre.ilike.%${q}%`)
      }
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return NextResponse.json(data ?? [])
    }

    if (tipo === 'unidades_negocio') {
      let query = supabase.from('unidades_negocio').select('*').order('id_cc_cc').limit(500)
      if (q) {
        query = query.or(`id_cc_cc.ilike.%${q}%,unidade.ilike.%${q}%,management_report.ilike.%${q}%,centros_custo.ilike.%${q}%`)
      }
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return NextResponse.json(data ?? [])
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  } catch (e) {
    console.error('[dimensoes]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// POST: upsert single dimension row (master only)
export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (!user) return UNAUTHORIZED
  if (user.role !== 'master') return FORBIDDEN
  try {
    const { tipo, ...body } = await req.json()
    const supabase = getSupabase()

    if (tipo === 'centros_custo') {
      const { data, error } = await supabase
        .from('centros_custo')
        .upsert({
          centro_custo:       body.centro_custo ?? '',
          nome_centro_custo:  body.nome_centro_custo ?? '',
          departamento:       body.departamento ?? '',
          nome_departamento:  body.nome_departamento ?? '',
          area:               body.area ?? '',
          nome_area:          body.nome_area ?? '',
        }, { onConflict: 'centro_custo' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (tipo === 'contas_contabeis') {
      const { data, error } = await supabase
        .from('contas_contabeis')
        .upsert({
          numero_conta_contabil: body.numero_conta_contabil ?? '',
          nome_conta_contabil:   body.nome_conta_contabil ?? '',
          agrupamento_arvore:    body.agrupamento_arvore ?? '',
          dre:                   body.dre ?? '',
        }, { onConflict: 'numero_conta_contabil' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    if (tipo === 'unidades_negocio') {
      const { data, error } = await supabase
        .from('unidades_negocio')
        .upsert({
          id_cc_cc:          body.id_cc_cc ?? '',
          management_report: body.management_report ?? '',
          conta:             body.conta ?? '',
          centros_custo:     body.centros_custo ?? '',
          unidade:           body.unidade ?? '',
        }, { onConflict: 'id_cc_cc' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  } catch (e) {
    console.error('[dimensoes]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// DELETE (master only)
export async function DELETE(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (!user) return UNAUTHORIZED
  if (user.role !== 'master') return FORBIDDEN
  try {
    const sp   = new URL(req.url).searchParams
    const tipo = sp.get('tipo')
    const key  = sp.get('key')
    const supabase = getSupabase()

    if (tipo === 'centros_custo')    await supabase.from('centros_custo').delete().eq('centro_custo', key!)
    if (tipo === 'contas_contabeis') await supabase.from('contas_contabeis').delete().eq('numero_conta_contabil', key!)
    if (tipo === 'unidades_negocio') await supabase.from('unidades_negocio').delete().eq('id_cc_cc', key!)

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[dimensoes]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
