/**
 * Utilitários para hierarquia do plano de contas.
 *
 * Extrai níveis a partir do numero_conta_contabil usando o separador "."
 * Ex: "3.1.01.01.001" → 5 níveis:
 *   1: "3"
 *   2: "3.1"
 *   3: "3.1.01"
 *   4: "3.1.01.01"
 *   5: "3.1.01.01.001"
 */

/** Retorna o nível de uma conta (número de segmentos separados por ".") */
export function getAccountLevel(numero: string): number {
  if (!numero) return 0
  return numero.split('.').length
}

/** Retorna o prefixo de uma conta no nível desejado */
export function getAccountPrefix(numero: string, level: number): string {
  if (!numero) return ''
  const parts = numero.split('.')
  return parts.slice(0, level).join('.')
}

/** Retorna o nível máximo presente em uma lista de números de conta */
export function getMaxLevel(numeros: string[]): number {
  return numeros.reduce((max, n) => Math.max(max, getAccountLevel(n)), 0)
}

/** Tipo de nó na árvore do plano de contas */
export interface PlanoContasNode {
  /** Prefixo/número neste nível (ex: "3.1") */
  numero: string
  /** Nome da conta (vindo da dimensão, ou inferido) */
  nome: string
  /** Nível na hierarquia (1-based) */
  nivel: number
  /** Valores agregados */
  budget: number
  razao: number
  variacao: number
  variacao_pct: number
  /** Filhos */
  children: PlanoContasNode[]
  /** Se expandido na UI */
  isExpanded?: boolean
  /** Número de contas-folha sob este nó */
  contaCount: number
}
