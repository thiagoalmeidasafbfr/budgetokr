import { NextRequest, NextResponse } from 'next/server'
import { getKpiValores, upsertKpiValores } from '@/lib/query'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!getUserFromHeaders(req)) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const sp = new URL(req.url).searchParams
    const kpiId = sp.get('kpiId')
    if (!kpiId) return NextResponse.json({ error: 'kpiId required' }, { status: 400 })
    const periodosRaw = sp.get('periodos')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : undefined
    const valores = await getKpiValores(Number(kpiId), periodos)
    return NextResponse.json(valores)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (user.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const body = await req.json()
    const { kpiId, valores } = body
    if (!kpiId) return NextResponse.json({ error: 'kpiId required' }, { status: 400 })
    if (!Array.isArray(valores)) return NextResponse.json({ error: 'valores must be an array' }, { status: 400 })
    await upsertKpiValores(Number(kpiId), valores)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
