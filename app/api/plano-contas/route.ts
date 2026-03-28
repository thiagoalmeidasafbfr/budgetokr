import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'
import { getDistinctValues } from '@/lib/query'

export const dynamic = 'force-dynamic'

interface ContaRow {
  numero_conta_contabil: string
  nome_conta_contabil: string
  agrupamento_arvore: string
  dre: string
  nivel: number
}

/**
 * POST /api/plano-contas/import
 *
 * Bulk import/update account names from CSV.
 */
export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { rows } = body as { rows: Array<{ numero: string; nome: string; agrupamento?: string; dre?: string }> }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha para importar' }, { status: 400 })
    }

    const upsertRows = rows
      .filter(row => row.numero)
      .map(row => ({
        numero_conta_contabil: row.numero,
        nome_conta_contabil:   row.nome || '',
        agrupamento_arvore:    row.agrupamento || '',
        dre:                   row.dre || '',
        nivel:                 row.numero.split('.').length,
      }))

    const CHUNK = 500
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('contas_contabeis')
        .upsert(chunk, { onConflict: 'numero_conta_contabil' })
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ ok: true, updated: upsertRows.length })
  } catch (e) {
    console.error('[plano-contas POST]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

/**
 * PUT /api/plano-contas
 *
 * Upsert a conta contábil (create parent accounts or rename existing ones).
 */
export async function PUT(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { numero_conta_contabil, nome_conta_contabil } = body

    if (!numero_conta_contabil || typeof numero_conta_contabil !== 'string') {
      return NextResponse.json({ error: 'numero_conta_contabil é obrigatório' }, { status: 400 })
    }

    const nivel = numero_conta_contabil.split('.').length

    const { error } = await supabase
      .from('contas_contabeis')
      .upsert({
        numero_conta_contabil,
        nome_conta_contabil: nome_conta_contabil ?? '',
        nivel,
      }, { onConflict: 'numero_conta_contabil' })
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[plano-contas PUT]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// Shared helper: build a tree from flat conta rows + lancamentos aggregation.
// Works both when data comes from the RPC (flat array) and from the fallback
// (direct contas_contabeis query).
interface TNode {
  numero: string; nome: string; nivel: number
  budget: number; razao: number; variacao: number; variacao_pct: number
  contaCount: number; agrupamento: string; dre: string
  children: TNode[]
}

function buildContaTree(
  rows: { numero_conta_contabil: string; nome_conta_contabil: string; nivel: number; agrupamento_arvore: string; dre: string; budget: number; razao: number }[]
): TNode[] {
  const byNum = new Map<string, TNode>()
  for (const c of rows) {
    const budget   = c.budget   ?? 0
    const razao    = c.razao    ?? 0
    const variacao = razao - budget
    byNum.set(c.numero_conta_contabil, {
      numero:      c.numero_conta_contabil,
      nome:        c.nome_conta_contabil ?? c.numero_conta_contabil,
      nivel:       c.nivel ?? 1,
      budget, razao, variacao,
      variacao_pct: budget !== 0 ? variacao / Math.abs(budget) * 100 : 0,
      contaCount:  1,
      agrupamento: c.agrupamento_arvore ?? '',
      dre:         c.dre ?? '',
      children:    [],
    })
  }
  const roots: TNode[] = []
  for (const [num, node] of byNum) {
    const parts = num.split('.')
    let placed = false
    for (let i = parts.length - 1; i > 0; i--) {
      const parentNum = parts.slice(0, i).join('.')
      if (byNum.has(parentNum)) {
        byNum.get(parentNum)!.children.push(node)
        placed = true
        break
      }
    }
    if (!placed) roots.push(node)
  }

  // Roll up children sums into parent nodes
  function rollup(node: TNode): void {
    for (const child of node.children) rollup(child)
    if (node.children.length > 0) {
      node.budget = node.children.reduce((s, c) => s + c.budget, 0)
      node.razao  = node.children.reduce((s, c) => s + c.razao,  0)
      node.variacao = node.razao - node.budget
      node.variacao_pct = node.budget !== 0 ? node.variacao / Math.abs(node.budget) * 100 : 0
    }
  }
  for (const r of roots) rollup(r)

  return roots
}

export async function GET(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  try {
    const supabase = getSupabase()
    const sp = new URL(req.url).searchParams
    const tipo = sp.get('tipo') ?? 'ambos'
    const periodosRaw = sp.get('periodos')
    const deptosRaw   = sp.get('departamentos')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const deptos   = deptosRaw   ? deptosRaw.split(',').filter(Boolean)   : []

    // Fetch meta (departamentos + all distinct periods) in parallel with the main data query
    const [rpcRes, deptsRes, rawDates] = await Promise.all([
      supabase.rpc('get_plano_contas_valores', {
        p_tipo:          tipo,
        p_periodos:      periodos,
        p_departamentos: deptos,
      }),
      supabase.from('centros_custo')
        .select('nome_departamento')
        .not('nome_departamento', 'is', null)
        .neq('nome_departamento', '')
        .order('nome_departamento'),
      // Use the same RPC as DRE/Análise to get all distinct periods without row-limit issues
      getDistinctValues('data_lancamento'),
    ])

    const departamentos = [...new Set((deptsRes.data ?? []).map((d: { nome_departamento: string }) => d.nome_departamento))]
    const periodosAll   = [...new Set(rawDates.map(d => d.substring(0, 7)).filter(Boolean))].sort()

    // The RPC returns a flat JSONB array of rows — build the tree here
    type RpcRow = {
      numero_conta_contabil: string
      nome_conta_contabil:   string
      nivel:                 number
      agrupamento_arvore:    string
      dre:                   string
      budget:                number
      razao:                 number
    }
    const rpcRows = Array.isArray(rpcRes.data) ? (rpcRes.data as RpcRow[]) : null

    if (rpcRows !== null && !rpcRes.error) {
      const tree     = buildContaTree(rpcRows)
      const maxLevel = rpcRows.reduce((m, r) => Math.max(m, r.nivel ?? 0), 0)
      return NextResponse.json({ tree, maxLevel, totalContas: rpcRows.length, departamentos, periodos: periodosAll })
    }

    // Fallback: RPC unavailable — query contas_contabeis directly (no value aggregation)
    if (rpcRes.error) console.warn('[plano-contas] RPC error:', rpcRes.error.message)

    const { data: contasData, error: contasError } = await supabase
      .from('contas_contabeis')
      .select('numero_conta_contabil, nome_conta_contabil, agrupamento_arvore, dre, nivel')
      .order('numero_conta_contabil')
    if (contasError) throw new Error(contasError.message)

    const contas = (contasData ?? []) as ContaRow[]
    const fallbackRows = contas.map(c => ({
      numero_conta_contabil: c.numero_conta_contabil,
      nome_conta_contabil:   c.nome_conta_contabil,
      nivel:                 c.nivel ?? 1,
      agrupamento_arvore:    c.agrupamento_arvore ?? '',
      dre:                   c.dre ?? '',
      budget: 0, razao: 0,
    }))
    const tree     = buildContaTree(fallbackRows)
    const maxLevel = contas.reduce((m, c) => Math.max(m, c.nivel ?? 0), 0)
    return NextResponse.json({ tree, maxLevel, totalContas: contas.length, departamentos, periodos: periodosAll })
  } catch (e) {
    console.error('[plano-contas GET]', e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
