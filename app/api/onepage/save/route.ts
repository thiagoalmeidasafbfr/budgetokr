import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import type { AnalysisConfig } from '@/lib/analysis/engine'
import type { BlockConfig } from '@/lib/analysis/templates'

export const dynamic = 'force-dynamic'

interface SaveBody {
  config: AnalysisConfig
  blocks: BlockConfig[]
  nome: string
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body: SaveBody = await req.json()
    const { config, blocks, nome } = body

    if (!nome?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Upsert by user_id + nome
    const { data, error } = await supabase
      .from('onepage_analyses')
      .upsert(
        {
          user_id: user.userId,
          nome: nome.trim(),
          config: config as unknown as Record<string, unknown>,
          blocks: blocks as unknown as Record<string, unknown>[],
          otica: config.otica,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,nome' }
      )
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ id: data?.id })
  } catch (e) {
    console.error('[onepage/save]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro interno' },
      { status: 500 }
    )
  }
}
