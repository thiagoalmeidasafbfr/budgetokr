import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logAudit, logBulkAudit } from '@/lib/audit'

const PAGE_SIZE = 100

// GET /api/lancamentos?tipo=budget&page=1&q=texto&departamento=X&periodo=2024-01
export async function GET(req: NextRequest) {
  try {
    const sp    = new URL(req.url).searchParams
    const tipo  = sp.get('tipo')
    const page  = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const q     = sp.get('q') ?? ''
    const per   = sp.get('periodo')
    const ano   = sp.get('ano')

    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    // Para múltiplos departamentos, passa o primeiro (RPC suporta apenas um dept por query)
    const dept = user?.role === 'dept'
      ? ((user.departments?.[0] ?? user.department) ?? null)
      : sp.get('departamento')

    const supabase = getSupabase()

    // We use a PostgreSQL function to handle complex joins and filtering
    const { data, error } = await supabase.rpc('get_lancamentos_paged', {
      p_tipo:        tipo ?? null,
      p_departamento: dept ?? null,
      p_periodo:     per ?? null,
      p_ano:         ano ?? null,
      p_q:           q || null,
      p_page:        page,
      p_page_size:   PAGE_SIZE,
    })
    if (error) throw new Error(error.message)

    const result = data as { rows: unknown[]; total: number } | null
    const rows  = result?.rows ?? []
    const total = result?.total ?? 0

    return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE, pages: Math.ceil(total / PAGE_SIZE) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST: insert single row (master only)
export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (user.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const body = await req.json()
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('lancamentos')
      .insert({
        tipo:                     body.tipo ?? 'budget',
        data_lancamento:          body.data_lancamento ?? null,
        nome_conta_contabil:      body.nome_conta_contabil ?? '',
        numero_conta_contabil:    body.numero_conta_contabil ?? '',
        centro_custo:             body.centro_custo ?? '',
        nome_conta_contrapartida: body.nome_conta_contrapartida ?? '',
        fonte:                    body.fonte ?? '',
        observacao:               body.observacao ?? '',
        debito_credito:           parseFloat(body.debito_credito) || 0,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH: update single field(s) — with audit logging (master only)
export async function PATCH(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (user.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const { id, ...fields } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const allowed = [
      'tipo','data_lancamento','nome_conta_contabil','numero_conta_contabil',
      'centro_custo','nome_conta_contrapartida','fonte','observacao','debito_credito',
    ]
    const keys = Object.keys(fields).filter(k => allowed.includes(k))
    if (!keys.length) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    const supabase = getSupabase()

    // Capture old values for audit
    const { data: oldRow, error: fetchError } = await supabase
      .from('lancamentos').select('*').eq('id', id).single()
    if (fetchError || !oldRow) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    for (const k of keys) updateData[k] = fields[k]

    const { data: updated, error: updateError } = await supabase
      .from('lancamentos').update(updateData).eq('id', id).select().single()
    if (updateError) throw new Error(updateError.message)

    // Log changes
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    for (const k of keys) {
      if (String((oldRow as Record<string, unknown>)[k] ?? '') !== String(fields[k] ?? '')) {
        changes[k] = { old: (oldRow as Record<string, unknown>)[k], new: fields[k] }
      }
    }
    if (Object.keys(changes).length > 0) {
      await logBulkAudit('lancamentos', id, 'UPDATE', changes, user?.userId ?? null)
    }

    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE: remove row — with audit logging (master only)
export async function DELETE(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (user.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = getSupabase()
    const { data: oldRow } = await supabase.from('lancamentos').select('*').eq('id', id).single()

    const { error } = await supabase.from('lancamentos').delete().eq('id', id)
    if (error) throw new Error(error.message)

    if (oldRow) {
      await logAudit('lancamentos', parseInt(id), 'DELETE', null,
        JSON.stringify(oldRow), null, user?.userId ?? null)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
