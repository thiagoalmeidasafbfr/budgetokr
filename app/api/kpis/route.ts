import { NextRequest, NextResponse } from 'next/server'
import { getKpisManuais, upsertKpiManual, updateKpiManual, deleteKpiManual } from '@/lib/query'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

const UNAUTHORIZED = NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
const FORBIDDEN    = NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

export async function GET(req: NextRequest) {
  if (!getUserFromHeaders(req)) return UNAUTHORIZED
  try {
    const sp = new URL(req.url).searchParams
    const departamento = sp.get('departamento') ?? undefined
    const kpis = await getKpisManuais(departamento)
    return NextResponse.json(kpis)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (!user) return UNAUTHORIZED
  if (user.role !== 'master') return FORBIDDEN
  try {
    const body = await req.json()
    const { nome, unidade, descricao, departamento, cor, ordem, tem_budget } = body
    const kpi = await upsertKpiManual({
      nome: nome ?? '',
      unidade: unidade ?? '',
      descricao: descricao ?? '',
      departamento: departamento ?? '',
      cor: cor ?? '#6366f1',
      ordem: ordem ?? 999,
      tem_budget: tem_budget ?? 0,
    })
    return NextResponse.json(kpi, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (!user) return UNAUTHORIZED
  if (user.role !== 'master') return FORBIDDEN
  try {
    const body = await req.json()
    const { id, nome, unidade, descricao, departamento, cor, ordem, tem_budget } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const kpi = await updateKpiManual(Number(id), {
      nome: nome ?? '',
      unidade: unidade ?? '',
      descricao: descricao ?? '',
      departamento: departamento ?? '',
      cor: cor ?? '#6366f1',
      ordem: ordem ?? 999,
      tem_budget: tem_budget ?? 0,
    })
    return NextResponse.json(kpi)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (!user) return UNAUTHORIZED
  if (user.role !== 'master') return FORBIDDEN
  try {
    const sp = new URL(req.url).searchParams
    const id = sp.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await deleteKpiManual(Number(id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
