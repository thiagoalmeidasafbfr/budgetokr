// ─── Brand constants — Glorioso Finance ──────────────────────────────────────
// Single source of truth for colors, fonts, and design tokens.

export const BRAND = {
  // Backgrounds
  base:       '#F7F6F2',
  surface:    '#FFFFFF',
  // Accent
  gold:       '#B8924A',
  goldBg:     '#FBF7EE',
  goldDeep:   '#6B4E18',
  // Text
  ink:        '#1A1A1A',
  muted:      '#6B7280',
  // Semantic
  positive:   '#2D6A4F',
  negative:   '#C1292E',
  neutral:    '#6B7280',
  // Borders
  border:     '#E4DFD5',
} as const

export const FONTS = {
  display:  "'Cormorant Garamond', serif",
  heading:  "'Big Shoulders Display', sans-serif",
  mono:     "'IBM Plex Mono', monospace",
  body:     "'Inter', system-ui, sans-serif",
} as const

// Paleta para gráficos (ouro + variações)
export const CHART_PALETTE = [
  '#B8924A', '#8B6914', '#D4A96A', '#6B4E18',
  '#E8C89A', '#4A3510', '#C4A870', '#F0DDB8',
]

export const CHART_COLORS = {
  realizado:  '#B8924A',
  budget:     '#9CA3AF',
  positivo:   '#2D6A4F',
  negativo:   '#C1292E',
  neutro:     '#6B7280',
} as const

// Formata número em BRL
export function fmtBRL(value: number | null | undefined, compact = false): string {
  if (value == null) return '—'
  const opts: Intl.NumberFormatOptions = compact && Math.abs(value) >= 1_000_000
    ? { notation: 'compact', compactDisplay: 'short', minimumFractionDigits: 1, maximumFractionDigits: 1 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 0 }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', ...opts }).format(value)
}

export function fmtPct(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function fmtNum(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)
}

// Formats a value according to WidgetEstilo settings
export function fmtValue(
  value: number | null | undefined,
  opts?: {
    formato_numero?: 'inteiro' | 'decimal' | 'milhares' | 'milhoes' | 'percentual'
    prefixo?: string
    sufixo?: string
  }
): string {
  if (value == null) return '—'
  const fmt = opts?.formato_numero ?? 'inteiro'
  let formatted: string
  if (fmt === 'percentual') {
    formatted = `${value.toFixed(1)}%`
  } else if (fmt === 'milhoes') {
    formatted = new Intl.NumberFormat('pt-BR', {
      notation: 'compact', compactDisplay: 'short',
      minimumFractionDigits: 1, maximumFractionDigits: 1
    }).format(value / 1_000_000) + ' M'
  } else if (fmt === 'milhares') {
    formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value / 1_000) + ' K'
  } else if (fmt === 'decimal') {
    formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(value)
  } else {
    // inteiro (default)
    formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value)
  }
  const pre  = opts?.prefixo ? `${opts.prefixo} ` : ''
  const suf  = opts?.sufixo  ? ` ${opts.sufixo}`  : ''
  return `${pre}${formatted}${suf}`
}
