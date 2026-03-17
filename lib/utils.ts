import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPct(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/** Converte "yyyy-mm-dd" → "dd/mm/yyyy" para exibição no formato brasileiro */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return String(iso) // já está em outro formato — devolve como está
}

/** Converte "dd/mm/yyyy" → "yyyy-mm-dd" para salvar no banco */
export function dateToISO(br: string): string {
  const m = String(br).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return br
}

/** Converte "yyyy-mm" → "mm/yyyy" para exibição de períodos */
export function formatPeriodo(p: string | null | undefined): string {
  if (!p) return '—'
  const m = String(p).match(/^(\d{4})-(\d{2})$/)
  return m ? `${m[2]}/${m[1]}` : String(p)
}

export function colorForVariance(variance: number): string {
  if (variance > 0) return 'text-emerald-600'
  if (variance < 0) return 'text-red-500'
  return 'text-gray-500'
}

export function bgColorForVariance(variance: number): string {
  if (variance > 0) return 'bg-emerald-50 text-emerald-700'
  if (variance < 0) return 'bg-red-50 text-red-700'
  return 'bg-gray-50 text-gray-600'
}
