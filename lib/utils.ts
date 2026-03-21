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

// ─── Department colors ────────────────────────────────────────────────────────
// Deterministic color assignment per department name

const DEPT_COLORS = [
  { dot: 'bg-sky-500',     text: 'text-sky-700',     bg: 'bg-sky-50',     border: 'border-sky-100'     },
  { dot: 'bg-violet-500',  text: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-100'  },
  { dot: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-100'    },
  { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100'   },
  { dot: 'bg-teal-500',    text: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-100'    },
  { dot: 'bg-pink-500',    text: 'text-pink-700',    bg: 'bg-pink-50',    border: 'border-pink-100'    },
  { dot: 'bg-lime-600',    text: 'text-lime-700',    bg: 'bg-lime-50',    border: 'border-lime-100'    },
  { dot: 'bg-cyan-500',    text: 'text-cyan-700',    bg: 'bg-cyan-50',    border: 'border-cyan-100'    },
  { dot: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-100'  },
  { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  { dot: 'bg-indigo-500',  text: 'text-indigo-700',  bg: 'bg-indigo-50',  border: 'border-indigo-100'  },
  { dot: 'bg-fuchsia-500', text: 'text-fuchsia-700', bg: 'bg-fuchsia-50', border: 'border-fuchsia-100' },
]

export function getDeptColor(dept?: string | null) {
  if (!dept) return DEPT_COLORS[0]
  let hash = 0
  for (let i = 0; i < dept.length; i++) hash = (hash * 31 + dept.charCodeAt(i)) % DEPT_COLORS.length
  return DEPT_COLORS[Math.abs(hash)]
}
