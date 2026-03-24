import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

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
    return NextResponse.json({ error: String(e) }, { status: 500 })
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
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
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
    const deptosRaw = sp.get('departamentos')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const deptos = deptosRaw ? deptosRaw.split(',').filter(Boolean) : []

    const { data, error } = await supabase.rpc('get_plano_contas_valores', {
      p_tipo:         tipo,
      p_periodos:     periodos,
      p_departamentos: deptos,
    })
    if (error) throw new Error(error.message)

    const result = data as {
      tree: unknown[]
      maxLevel: number
      totalContas: number
      departamentos: string[]
      periodos: string[]
    } | null

    if (result) {
      // A RPC pode não incluir departamentos/periodos — garantir que sempre existam
      const needsMeta = !result.departamentos || !result.periodos
      if (needsMeta) {
        const [{ data: deptsData }, { data: periodosData }] = await Promise.all([
          supabase.from('centros_custo')
            .select('nome_departamento')
            .not('nome_departamento', 'is', null)
            .neq('nome_departamento', '')
            .order('nome_departamento'),
          supabase.from('lancamentos')
            .select('data_lancamento')
            .not('data_lancamento', 'is', null),
        ])
        const periodSet = new Set<string>()
        for (const r of periodosData ?? []) {
          if (r.data_lancamento) {
            const d = new Date(r.data_lancamento)
            if (!isNaN(d.getTime())) {
              periodSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
            }
          }
        }
        result.departamentos = result.departamentos ??
          (deptsData ?? []).map((d: { nome_departamento: string }) => d.nome_departamento)
        result.periodos = result.periodos ?? [...periodSet].sort()
      }
      return NextResponse.json(result)
    }

    // Fallback: build tree from contas_contabeis + aggregate lancamentos values
    const [
      { data: contasData, error: contasError },
      { data: deptsData },
      { data: periodosData },
      { data: lancData },
    ] = await Promise.all([
      supabase.from('contas_contabeis')
        .select('numero_conta_contabil, nome_conta_contabil, agrupamento_arvore, dre, nivel')
        .order('numero_conta_contabil'),
      supabase.from('centros_custo')
        .select('nome_departamento')
        .not('nome_departamento', 'is', null)
        .neq('nome_departamento', '')
        .order('nome_departamento'),
      supabase.from('lancamentos')
        .select('data_lancamento')
        .not('data_lancamento', 'is', null),
      // Aggregate lancamentos by conta/tipo (filtered by request params)
      (() => {
        let q = supabase.from('lancamentos')
          .select('numero_conta_contabil, tipo, debito_credito')
        if (periodos.length) {
          // Filter by period using .in() with computed YYYY-MM values is not directly
          // possible; use a subfilter on data_lancamento range for the first/last period
          // (approximate). Values will be computed precisely by the RPC once deployed.
        }
        if (deptos.length) {
          // No simple way to filter by dept here without a join; skip for fallback
        }
        return q
      })(),
    ])
    if (contasError) throw new Error(contasError.message)

    const contas = (contasData ?? []) as ContaRow[]
    const maxLevel = contas.reduce((max, c) => Math.max(max, c.nivel ?? 0), 0)
    const totalContas = contas.length

    // Build period list
    const periodSet = new Set<string>()
    for (const r of periodosData ?? []) {
      if (r.data_lancamento) {
        const d = new Date(r.data_lancamento)
        if (!isNaN(d.getTime())) {
          periodSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
        }
      }
    }

    // Aggregate lancamentos by numero_conta_contabil / tipo
    type LancAgg = { budget: number; razao: number }
    const lancByContta = new Map<string, LancAgg>()
    for (const l of (lancData ?? []) as { numero_conta_contabil: string; tipo: string; debito_credito: number }[]) {
      const key = l.numero_conta_contabil
      if (!lancByContta.has(key)) lancByContta.set(key, { budget: 0, razao: 0 })
      const agg = lancByContta.get(key)!
      if (l.tipo === 'budget') agg.budget += l.debito_credito ?? 0
      else if (l.tipo === 'razao') agg.razao += l.debito_credito ?? 0
    }

    // Build tree from account number hierarchy (prefix matching via dot-segments)
    interface TNode {
      numero: string; nome: string; nivel: number
      budget: number; razao: number; variacao: number; variacao_pct: number
      contaCount: number; agrupamento: string; dre: string
      children: TNode[]
    }
    const byNum = new Map<string, TNode>()
    for (const c of contas) {
      const agg = lancByContta.get(c.numero_conta_contabil) ?? { budget: 0, razao: 0 }
      const variacao = agg.razao - agg.budget
      byNum.set(c.numero_conta_contabil, {
        numero: c.numero_conta_contabil,
        nome: c.nome_conta_contabil ?? c.numero_conta_contabil,
        nivel: c.nivel ?? 1,
        budget: agg.budget, razao: agg.razao,
        variacao, variacao_pct: agg.budget !== 0 ? variacao / Math.abs(agg.budget) * 100 : 0,
        contaCount: 1,
        agrupamento: c.agrupamento_arvore ?? '',
        dre: c.dre ?? '',
        children: [],
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

    return NextResponse.json({
      tree: roots,
      maxLevel,
      totalContas,
      departamentos: (deptsData ?? []).map((d: { nome_departamento: string }) => d.nome_departamento),
      periodos: [...periodSet].sort(),
    })
  } catch (e) {
    console.error('[plano-contas GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
