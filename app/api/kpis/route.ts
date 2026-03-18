import { NextRequest, NextResponse } from 'next/server'
import { getKpisManuais, upsertKpiManual, updateKpiManual, deleteKpiManual } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const departamento = sp.get('departamento') ?? undefined
    const kpis = getKpisManuais(departamento)
    return NextResponse.json(kpis)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { nome, unidade, descricao, departamento, cor, ordem, tem_budget } = body
    const kpi = upsertKpiManual({
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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, nome, unidade, descricao, departamento, cor, ordem, tem_budget } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const kpi = updateKpiManual(Number(id), {
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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const id = sp.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    deleteKpiManual(Number(id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
