import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface ContaRow {
  numero_conta_contabil: string
  nome_conta_contabil: string
  agrupamento_arvore: string
  dre: string
  nivel: number
}

interface LancamentoAgg {
  numero_conta_contabil: string
  budget: number
  razao: number
}

/**
 * GET /api/plano-contas
 *
 * Retorna a árvore hierárquica do plano de contas com valores de budget/razão.
 *
 * Query params:
 * - tipo: 'budget' | 'razao' | 'ambos' (default: 'ambos')
 * - periodos: comma-separated YYYY-MM (optional filter)
 * - departamentos: comma-separated names (optional filter)
 */
/**
 * PUT /api/plano-contas
 *
 * Upsert a conta contábil (create parent accounts or rename existing ones).
 * Body: { numero_conta_contabil: string, nome_conta_contabil: string }
 */
export async function PUT(req: NextRequest) {
  try {
    const db = getDb()
    const body = await req.json()
    const { numero_conta_contabil, nome_conta_contabil } = body

    if (!numero_conta_contabil || typeof numero_conta_contabil !== 'string') {
      return NextResponse.json({ error: 'numero_conta_contabil é obrigatório' }, { status: 400 })
    }

    const nivel = numero_conta_contabil.split('.').length

    // Upsert: insert or update name
    db.prepare(`
      INSERT INTO contas_contabeis (numero_conta_contabil, nome_conta_contabil, nivel)
      VALUES (?, ?, ?)
      ON CONFLICT(numero_conta_contabil)
      DO UPDATE SET nome_conta_contabil = excluded.nome_conta_contabil
    `).run(numero_conta_contabil, nome_conta_contabil ?? '', nivel)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[plano-contas PUT]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    const sp = new URL(req.url).searchParams
    const tipo = sp.get('tipo') ?? 'ambos'
    const periodosRaw = sp.get('periodos')
    const deptosRaw = sp.get('departamentos')
    const periodos = periodosRaw ? periodosRaw.split(',').filter(Boolean) : []
    const deptos = deptosRaw ? deptosRaw.split(',').filter(Boolean) : []

    // 1. Load all contas
    const contas = db.prepare(`
      SELECT numero_conta_contabil, nome_conta_contabil, agrupamento_arvore, dre,
        COALESCE(nivel, LENGTH(numero_conta_contabil) - LENGTH(REPLACE(numero_conta_contabil, '.', '')) + 1) as nivel
      FROM contas_contabeis
      ORDER BY numero_conta_contabil
    `).all() as ContaRow[]

    // 2. Load aggregated lancamento values per conta (leaf level)
    const conditions: string[] = []
    const params: unknown[] = []
    if (tipo === 'budget') {
      conditions.push(`l.tipo = 'budget'`)
    } else if (tipo === 'razao') {
      conditions.push(`l.tipo = 'razao'`)
    }
    if (periodos.length) {
      conditions.push(`strftime('%Y-%m', l.data_lancamento) IN (${periodos.map(() => '?').join(',')})`)
      params.push(...periodos)
    }
    if (deptos.length) {
      conditions.push(`cc.nome_departamento IN (${deptos.map(() => '?').join(',')})`)
      params.push(...deptos)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const lancamentos = db.prepare(`
      SELECT
        l.numero_conta_contabil,
        SUM(CASE WHEN l.tipo = 'budget' THEN l.debito_credito ELSE 0 END) as budget,
        SUM(CASE WHEN l.tipo = 'razao'  THEN l.debito_credito ELSE 0 END) as razao
      FROM lancamentos l
      LEFT JOIN centros_custo cc ON l.centro_custo = cc.centro_custo
      ${whereClause}
      GROUP BY l.numero_conta_contabil
    `).all(...params) as LancamentoAgg[]

    // Build value map from leaf accounts
    const valueMap = new Map<string, { budget: number; razao: number }>()
    for (const l of lancamentos) {
      if (l.numero_conta_contabil) {
        valueMap.set(l.numero_conta_contabil, { budget: l.budget, razao: l.razao })
      }
    }

    // 3. Build name map from contas (leaf accounts)
    const nameMap = new Map<string, { nome: string; agrupamento: string; dre: string }>()
    for (const c of contas) {
      nameMap.set(c.numero_conta_contabil, {
        nome: c.nome_conta_contabil || '',
        agrupamento: c.agrupamento_arvore || '',
        dre: c.dre || '',
      })
    }

    // 4. Derive all parent prefixes from existing accounts
    // and aggregate values up the hierarchy
    const allPrefixes = new Map<string, {
      nome: string
      nivel: number
      budget: number
      razao: number
      contaCount: number
      agrupamento: string
      dre: string
    }>()

    for (const conta of contas) {
      const num = conta.numero_conta_contabil
      const parts = num.split('.')
      const vals = valueMap.get(num) ?? { budget: 0, razao: 0 }

      // Register every prefix level
      for (let lvl = 1; lvl <= parts.length; lvl++) {
        const prefix = parts.slice(0, lvl).join('.')
        const existing = allPrefixes.get(prefix)
        if (existing) {
          existing.budget += vals.budget
          existing.razao += vals.razao
          if (lvl === parts.length) existing.contaCount++
        } else {
          // Name: use the dimension name if this prefix matches a known account
          const info = nameMap.get(prefix)
          allPrefixes.set(prefix, {
            nome: info?.nome || '',
            nivel: lvl,
            budget: vals.budget,
            razao: vals.razao,
            contaCount: lvl === parts.length ? 1 : 0,
            agrupamento: info?.agrupamento || '',
            dre: info?.dre || '',
          })
        }
      }
    }

    // 5. Build tree structure
    interface TreeNode {
      numero: string
      nome: string
      nivel: number
      budget: number
      razao: number
      variacao: number
      variacao_pct: number
      contaCount: number
      agrupamento: string
      dre: string
      children: TreeNode[]
    }

    const buildNode = (prefix: string): TreeNode => {
      const data = allPrefixes.get(prefix)!
      const variacao = data.razao - data.budget
      return {
        numero: prefix,
        nome: data.nome,
        nivel: data.nivel,
        budget: data.budget,
        razao: data.razao,
        variacao,
        variacao_pct: data.budget ? (variacao / Math.abs(data.budget)) * 100 : 0,
        contaCount: data.contaCount,
        agrupamento: data.agrupamento,
        dre: data.dre,
        children: [],
      }
    }

    // Group prefixes by parent
    const rootNodes: TreeNode[] = []
    const nodeMap = new Map<string, TreeNode>()

    // Sort by prefix to ensure parents come before children
    const sortedPrefixes = [...allPrefixes.keys()].sort()

    for (const prefix of sortedPrefixes) {
      const node = buildNode(prefix)
      nodeMap.set(prefix, node)

      // Find parent
      const lastDot = prefix.lastIndexOf('.')
      if (lastDot === -1) {
        // Root level
        rootNodes.push(node)
      } else {
        const parentPrefix = prefix.substring(0, lastDot)
        const parent = nodeMap.get(parentPrefix)
        if (parent) {
          parent.children.push(node)
        } else {
          // No parent found — this is a root
          rootNodes.push(node)
        }
      }
    }

    // 6. Also return metadata
    const maxLevel = contas.reduce((max, c) => Math.max(max, c.nivel), 0)
    const totalContas = contas.length

    // Get available filters
    const departamentos = db.prepare(`
      SELECT DISTINCT nome_departamento FROM centros_custo
      WHERE nome_departamento IS NOT NULL AND nome_departamento != ''
      ORDER BY nome_departamento
    `).all() as Array<{ nome_departamento: string }>

    const allPeriodos = db.prepare(`
      SELECT DISTINCT strftime('%Y-%m', data_lancamento) as periodo
      FROM lancamentos
      WHERE data_lancamento IS NOT NULL
      ORDER BY periodo
    `).all() as Array<{ periodo: string }>

    return NextResponse.json({
      tree: rootNodes,
      maxLevel,
      totalContas,
      departamentos: departamentos.map(d => d.nome_departamento),
      periodos: allPeriodos.map(p => p.periodo),
    })
  } catch (e) {
    console.error('[plano-contas GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
