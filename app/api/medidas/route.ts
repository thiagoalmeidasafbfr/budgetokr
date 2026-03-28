import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

const UNAUTHORIZED = NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
const FORBIDDEN    = NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

function parseRow(m: Record<string, unknown>) {
  return {
    id: m.id as number,
    nome: m.nome as string,
    descricao: (m.descricao ?? '') as string,
    unidade: (m.unidade ?? '') as string,
    cor: (m.cor ?? '#6366f1') as string,
    tipo_fonte: (m.tipo_fonte ?? 'ambos') as string,
    tipo_medida: (m.tipo_medida || 'simples') as string,
    filtros: Array.isArray(m.filtros) ? m.filtros : JSON.parse((m.filtros as string) || '[]'),
    filtros_operador: (m.filtros_operador || 'AND') as string,
    denominador_filtros: Array.isArray(m.denominador_filtros) ? m.denominador_filtros : JSON.parse((m.denominador_filtros as string) || '[]'),
    denominador_filtros_operador: (m.denominador_filtros_operador || 'AND') as string,
    denominador_tipo_fonte: (m.denominador_tipo_fonte || 'ambos') as string,
    departamentos: Array.isArray(m.departamentos) ? m.departamentos as string[] : JSON.parse((m.departamentos as string) || '[]') as string[],
    created_at: m.created_at as string,
    updated_at: m.updated_at as string,
  }
}

export async function GET(req: NextRequest) {
  if (!getUserFromHeaders(req)) return UNAUTHORIZED
  try {
    const dept = new URL(req.url).searchParams.get('departamento') ?? ''
    const supabase = getSupabase()
    const { data, error } = await supabase.from('medidas').select('*').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const parsed = (data ?? []).map(r => parseRow(r as Record<string, unknown>))
    const filtered = dept
      ? parsed.filter(m => m.departamentos.length === 0 || m.departamentos.includes(dept))
      : parsed
    return NextResponse.json(filtered)
  } catch (e) {
    console.error('[medidas GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userP = getUserFromHeaders(req)
  if (!userP) return UNAUTHORIZED
  if (userP.role !== 'master') return FORBIDDEN
  try {
    const body = await req.json()
    const { nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros,
            filtros_operador, denominador_filtros, denominador_filtros_operador,
            denominador_tipo_fonte, departamentos } = body
    if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('medidas')
      .insert({
        nome, descricao: descricao ?? '', unidade: unidade ?? '',
        cor: cor ?? '#6366f1',
        tipo_fonte: tipo_fonte ?? 'ambos', tipo_medida: tipo_medida ?? 'simples',
        filtros: filtros ?? [],
        filtros_operador: filtros_operador ?? 'AND',
        denominador_filtros: denominador_filtros ?? [],
        denominador_filtros_operador: denominador_filtros_operador ?? 'AND',
        denominador_tipo_fonte: denominador_tipo_fonte ?? 'ambos',
        departamentos: departamentos ?? [],
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json(parseRow(data as Record<string, unknown>))
  } catch (e) {
    console.error('[medidas POST]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const userU = getUserFromHeaders(req)
  if (!userU) return UNAUTHORIZED
  if (userU.role !== 'master') return FORBIDDEN
  try {
    const body = await req.json()
    const { id, nome, descricao, unidade, cor, tipo_fonte, tipo_medida, filtros,
            filtros_operador, denominador_filtros, denominador_filtros_operador,
            denominador_tipo_fonte, departamentos } = body
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('medidas')
      .update({
        nome, descricao: descricao ?? '', unidade: unidade ?? '',
        cor: cor ?? '#6366f1',
        tipo_fonte: tipo_fonte ?? 'ambos', tipo_medida: tipo_medida ?? 'simples',
        filtros: filtros ?? [],
        filtros_operador: filtros_operador ?? 'AND',
        denominador_filtros: denominador_filtros ?? [],
        denominador_filtros_operador: denominador_filtros_operador ?? 'AND',
        denominador_tipo_fonte: denominador_tipo_fonte ?? 'ambos',
        departamentos: departamentos ?? [],
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json(parseRow(data as Record<string, unknown>))
  } catch (e) {
    console.error('[medidas PUT]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const userPa = getUserFromHeaders(req)
  if (!userPa) return UNAUTHORIZED
  if (userPa.role !== 'master') return FORBIDDEN
  try {
    const { id, unidade } = await req.json()
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('medidas')
      .update({ unidade: unidade ?? '' })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json(parseRow(data as Record<string, unknown>))
  } catch (e) {
    console.error('[medidas PATCH]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const userD = getUserFromHeaders(req)
  if (!userD) return UNAUTHORIZED
  if (userD.role !== 'master') return FORBIDDEN
  try {
    const id = new URL(req.url).searchParams.get('id')
    const supabase = getSupabase()
    const { error } = await supabase.from('medidas').delete().eq('id', id!)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[medidas DELETE]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
