// ─── Shared DRE tree-building utilities ──────────────────────────────────────
// Used by app/dre/page.tsx and app/dept/page.tsx

export interface DRELinha {
  id: number; ordem: number; nome: string; tipo: 'grupo' | 'subtotal'
  sinal: number; formula_grupos: string; formula_sinais: string
  negrito: number; separador: number
}

export interface TreeNode {
  name: string
  isGroup: boolean
  isSubtotal?: boolean
  isSeparator?: boolean
  isBold?: boolean
  depth: number
  ordem: number
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
  children: TreeNode[]
  byPeriod: Record<string, { budget: number; razao: number }>
  dre?: string
  agrupamento?: string
}

// ── Quarter utilities ─────────────────────────────────────────────────────────

export function toQuarterLabel(periodo: string): string {
  const [y, m] = periodo.split('-')
  const q = Math.ceil(parseInt(m) / 3)
  return `${q}T${y.slice(2)}`
}

/** Group a byPeriod map (YYYY-MM → values) into byQuarter (1T24 → summed values) */
export function groupByQuarter(
  byPeriod: Record<string, { budget: number; razao: number }>
): Record<string, { budget: number; razao: number }> {
  const result: Record<string, { budget: number; razao: number }> = {}
  for (const [p, v] of Object.entries(byPeriod)) {
    const q = toQuarterLabel(p)
    if (!result[q]) result[q] = { budget: 0, razao: 0 }
    result[q].budget += v.budget
    result[q].razao  += v.razao
  }
  return result
}

/** Sort quarter labels chronologically (1T24, 2T24, ..., 1T25, ...) */
export function sortQuarterLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    // format: "NTyy" where N=1-4, yy=year digits
    const [qa, ya] = [parseInt(a[0]), parseInt(a.slice(2))]
    const [qb, yb] = [parseInt(b[0]), parseInt(b.slice(2))]
    return ya !== yb ? ya - yb : qa - qb
  })
}

// ── Tree building with dre_linhas structure ───────────────────────────────────

export interface DRERow {
  dre: string
  agrupamento_arvore: string
  ordem_dre: number
  periodo: string
  budget: number
  razao: number
}

export function buildTreeFromLinhas(
  data: DRERow[],
  hierarchy: Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>,
  dreLinhas: DRELinha[]
): TreeNode[] {
  const lineAgg = new Map<string, {
    budget: number; razao: number
    byPeriod: Record<string, { budget: number; razao: number }>
  }>()
  for (const row of data) {
    const key = `${row.dre}||${row.agrupamento_arvore}`
    if (!lineAgg.has(key)) lineAgg.set(key, { budget: 0, razao: 0, byPeriod: {} })
    const agg = lineAgg.get(key)!
    agg.budget += row.budget
    agg.razao  += row.razao
    if (row.periodo) {
      if (!agg.byPeriod[row.periodo]) agg.byPeriod[row.periodo] = { budget: 0, razao: 0 }
      agg.byPeriod[row.periodo].budget += row.budget
      agg.byPeriod[row.periodo].razao  += row.razao
    }
  }

  const dreAgg = new Map<string, {
    budget: number; razao: number
    byPeriod: Record<string, { budget: number; razao: number }>
    children: Array<{ agrupamento: string; budget: number; razao: number; byPeriod: Record<string, { budget: number; razao: number }> }>
  }>()
  for (const [key, agg] of lineAgg) {
    const [dre, agrup] = key.split('||')
    if (!dreAgg.has(dre)) dreAgg.set(dre, { budget: 0, razao: 0, byPeriod: {}, children: [] })
    const g = dreAgg.get(dre)!
    g.budget += agg.budget
    g.razao  += agg.razao
    for (const [p, v] of Object.entries(agg.byPeriod)) {
      if (!g.byPeriod[p]) g.byPeriod[p] = { budget: 0, razao: 0 }
      g.byPeriod[p].budget += v.budget
      g.byPeriod[p].razao  += v.razao
    }
    if (agrup) g.children.push({ agrupamento: agrup, budget: agg.budget, razao: agg.razao, byPeriod: agg.byPeriod })
  }

  const hierMap = new Map<string, Set<string>>()
  for (const h of hierarchy) {
    if (!h.dre) continue
    if (!hierMap.has(h.dre)) hierMap.set(h.dre, new Set())
    if (h.agrupamento_arvore) hierMap.get(h.dre)!.add(h.agrupamento_arvore)
  }

  const result: TreeNode[] = []
  for (const linha of dreLinhas) {
    if (linha.tipo === 'subtotal') {
      let subBudget = 0, subRazao = 0
      const subByPeriod: Record<string, { budget: number; razao: number }> = {}
      for (const prevLinha of dreLinhas) {
        if (prevLinha.tipo !== 'grupo' || prevLinha.ordem >= linha.ordem) continue
        const agg = dreAgg.get(prevLinha.nome)
        if (!agg) continue
        const sinal = prevLinha.sinal ?? 1
        subBudget += agg.budget * sinal
        subRazao  += agg.razao  * sinal
        for (const [p, v] of Object.entries(agg.byPeriod)) {
          if (!subByPeriod[p]) subByPeriod[p] = { budget: 0, razao: 0 }
          subByPeriod[p].budget += v.budget * sinal
          subByPeriod[p].razao  += v.razao  * sinal
        }
      }
      subBudget *= linha.sinal
      subRazao  *= linha.sinal
      for (const p of Object.keys(subByPeriod)) {
        subByPeriod[p].budget *= linha.sinal
        subByPeriod[p].razao  *= linha.sinal
      }
      const var_ = subRazao - subBudget
      result.push({
        name: linha.nome, isGroup: true, isSubtotal: true, isBold: true,
        isSeparator: linha.separador === 1, depth: 0, ordem: linha.ordem,
        budget: subBudget, razao: subRazao, variacao: var_,
        variacao_pct: subBudget ? (var_ / Math.abs(subBudget)) * 100 : 0,
        children: [], byPeriod: subByPeriod,
      })
    } else {
      const agg = dreAgg.get(linha.nome)
      const budget = (agg?.budget ?? 0) * linha.sinal
      const razao  = (agg?.razao  ?? 0) * linha.sinal
      const byPeriod: Record<string, { budget: number; razao: number }> = {}
      if (agg) {
        for (const [p, v] of Object.entries(agg.byPeriod)) {
          byPeriod[p] = { budget: v.budget * linha.sinal, razao: v.razao * linha.sinal }
        }
      }
      const childSet = hierMap.get(linha.nome) ?? new Set<string>()
      const children: TreeNode[] = []
      for (const child of childSet) {
        const cAgg = lineAgg.get(`${linha.nome}||${child}`)
        if (!cAgg) continue
        const cb = cAgg.budget * linha.sinal
        const cr = cAgg.razao  * linha.sinal
        const cByP: Record<string, { budget: number; razao: number }> = {}
        for (const [p, v] of Object.entries(cAgg.byPeriod)) {
          cByP[p] = { budget: v.budget * linha.sinal, razao: v.razao * linha.sinal }
        }
        const cv = cr - cb
        children.push({
          name: child, isGroup: false, depth: 1, ordem: 999,
          budget: cb, razao: cr, variacao: cv,
          variacao_pct: cb ? (cv / Math.abs(cb)) * 100 : 0,
          children: [], byPeriod: cByP, dre: linha.nome, agrupamento: child,
        })
      }
      const var_ = razao - budget
      result.push({
        name: linha.nome, isGroup: true, isBold: linha.negrito === 1,
        isSeparator: linha.separador === 1, depth: 0, ordem: linha.ordem,
        budget, razao, variacao: var_,
        variacao_pct: budget ? (var_ / Math.abs(budget)) * 100 : 0,
        children: children.sort((a, b) => a.name.localeCompare(b.name)),
        byPeriod, dre: linha.nome,
      })
    }
  }
  return result
}

// ── Tree building (fallback without dre_linhas) ───────────────────────────────

export function buildTree(
  data: DRERow[],
  hierarchy: Array<{ agrupamento_arvore: string; dre: string; ordem_dre: number }>
): TreeNode[] {
  const groupMap = new Map<string, { ordem: number; children: Set<string> }>()
  for (const h of hierarchy) {
    const parent = h.dre || ''
    if (!parent) continue
    if (!groupMap.has(parent)) groupMap.set(parent, { ordem: h.ordem_dre ?? 999, children: new Set() })
    else if ((h.ordem_dre ?? 999) < groupMap.get(parent)!.ordem) {
      groupMap.get(parent)!.ordem = h.ordem_dre ?? 999
    }
    if (h.agrupamento_arvore) groupMap.get(parent)!.children.add(h.agrupamento_arvore)
  }

  const lineAgg = new Map<string, {
    budget: number; razao: number; ordem_dre: number
    byPeriod: Record<string, { budget: number; razao: number }>
  }>()
  for (const row of data) {
    const key = `${row.dre}||${row.agrupamento_arvore}`
    if (!lineAgg.has(key)) lineAgg.set(key, { budget: 0, razao: 0, ordem_dre: row.ordem_dre ?? 999, byPeriod: {} })
    const agg = lineAgg.get(key)!
    agg.budget += row.budget
    agg.razao  += row.razao
    if (row.periodo) {
      if (!agg.byPeriod[row.periodo]) agg.byPeriod[row.periodo] = { budget: 0, razao: 0 }
      agg.byPeriod[row.periodo].budget += row.budget
      agg.byPeriod[row.periodo].razao  += row.razao
    }
  }

  const tree: TreeNode[] = []
  const usedKeys = new Set<string>()

  for (const [parent, { ordem: groupOrdem, children: childSet }] of groupMap) {
    const children: TreeNode[] = []
    let groupBudget = 0, groupRazao = 0
    const groupByPeriod: Record<string, { budget: number; razao: number }> = {}

    for (const child of childSet) {
      const key = `${parent}||${child}`
      usedKeys.add(key)
      const agg = lineAgg.get(key) ?? { budget: 0, razao: 0, ordem_dre: 999, byPeriod: {} }
      groupBudget += agg.budget
      groupRazao  += agg.razao
      for (const [p, vals] of Object.entries(agg.byPeriod)) {
        if (!groupByPeriod[p]) groupByPeriod[p] = { budget: 0, razao: 0 }
        groupByPeriod[p].budget += vals.budget
        groupByPeriod[p].razao  += vals.razao
      }
      const variacao = agg.razao - agg.budget
      children.push({
        name: child, isGroup: false, depth: 1, ordem: agg.ordem_dre,
        budget: agg.budget, razao: agg.razao, variacao,
        variacao_pct: agg.budget ? (variacao / Math.abs(agg.budget)) * 100 : 0,
        children: [], byPeriod: agg.byPeriod, dre: parent, agrupamento: child,
      })
    }

    const bareKey = `${parent}||`
    if (lineAgg.has(bareKey)) {
      usedKeys.add(bareKey)
      const agg = lineAgg.get(bareKey)!
      groupBudget += agg.budget
      groupRazao  += agg.razao
      for (const [p, vals] of Object.entries(agg.byPeriod)) {
        if (!groupByPeriod[p]) groupByPeriod[p] = { budget: 0, razao: 0 }
        groupByPeriod[p].budget += vals.budget
        groupByPeriod[p].razao  += vals.razao
      }
    }

    const variacao = groupRazao - groupBudget
    tree.push({
      name: parent, isGroup: true, depth: 0, ordem: groupOrdem,
      budget: groupBudget, razao: groupRazao, variacao,
      variacao_pct: groupBudget ? (variacao / Math.abs(groupBudget)) * 100 : 0,
      children: children.sort((a, b) => (a.ordem - b.ordem) || a.name.localeCompare(b.name)),
      byPeriod: groupByPeriod, dre: parent,
    })
  }

  for (const [key, agg] of lineAgg) {
    if (usedKeys.has(key)) continue
    const [dre, agrup] = key.split('||')
    const name = agrup || dre || 'Sem classificação'
    const variacao = agg.razao - agg.budget
    tree.push({
      name, isGroup: false, depth: 0, ordem: agg.ordem_dre,
      budget: agg.budget, razao: agg.razao, variacao,
      variacao_pct: agg.budget ? (variacao / Math.abs(agg.budget)) * 100 : 0,
      children: [], byPeriod: agg.byPeriod, dre, agrupamento: agrup,
    })
  }

  return tree.sort((a, b) => (a.ordem - b.ordem) || a.name.localeCompare(b.name))
}

export function flattenTree(tree: TreeNode[], expanded: Set<string>): TreeNode[] {
  const result: TreeNode[] = []
  for (const node of tree) {
    result.push(node)
    if (node.isGroup && expanded.has(node.name)) {
      for (const child of node.children) result.push(child)
    }
  }
  return result
}
