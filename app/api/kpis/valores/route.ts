import { NextRequest, NextResponse } from 'next/server'
import { getKpiValores, upsertKpiValores } from '@/lib/query'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { kpiId, valores } = body
    if (!kpiId) return NextResponse.json({ error: 'kpiId required' }, { status: 400 })
    if (!Array.isArray(valores)) return NextResponse.json({ error: 'valores must be an array' }, { status: 400 })
    await upsertKpiValores(Number(kpiId), valores)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
