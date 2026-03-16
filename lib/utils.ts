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
