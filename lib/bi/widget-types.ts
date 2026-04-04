// lib/bi/widget-types.ts — BI Canvas type system

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Dimensional scope ────────────────────────────────────────────────────────

export interface BiScope {
  departamento_id?: string       // undefined = all departments
  centros_custo?: string[]       // undefined/[] = all in scope
  periodo: BiPeriodo
  comparativo?: 'budget' | 'mes_anterior' | 'ano_anterior' | null
}

export type BiPeriodo =
  | { tipo: 'mes';   mes: number; ano: number }
  | { tipo: 'ytd';   ano: number }
  | { tipo: 'range'; de: string; ate: string } // 'YYYY-MM'

// ─── What the widget shows ────────────────────────────────────────────────────

export type BiMetrica =
  | { tipo: 'linha_dre';       linha_nome: string }
  | { tipo: 'grupo_dre';       grupo_nome: string }
  | { tipo: 'topN_grupo';      grupo_nome: string; n: number; ordem: 'asc' | 'desc' }
  | { tipo: 'serie_temporal';  linha_nome: string }
  | { tipo: 'breakdown_cc';    linha_nome: string }
  | { tipo: 'breakdown_dpto';  linha_nome: string }
  | { tipo: 'dre_completa' }
  | { tipo: 'dre_parcial';     linhas: string[] }

// ─── Visual type ──────────────────────────────────────────────────────────────

export type WidgetVisual =
  | 'kpi_card'
  | 'waterfall'
  | 'bar_vertical'
  | 'bar_horizontal'
  | 'line_area'
  | 'donut'
  | 'pie'
  | 'table'
  | 'text_label'

// ─── Style ────────────────────────────────────────────────────────────────────

export interface WidgetEstilo {
  mostrar_titulo:   boolean
  mostrar_legenda:  boolean
  mostrar_eixos:    boolean
  mostrar_grid:     boolean
  mostrar_valores:  boolean
  mostrar_variacao: boolean
  tamanho_fonte:    'xs' | 'sm' | 'md' | 'lg' | 'xl'
  negrito:          boolean
  italico:          boolean
  cor_primaria?:    string
  formato_numero:   'inteiro' | 'decimal' | 'milhares' | 'milhoes' | 'percentual'
  prefixo?:         string
  sufixo?:          string
}

// ─── Grid layout ──────────────────────────────────────────────────────────────

export interface WidgetLayout {
  x: number   // col (0–11)
  y: number   // row
  w: number   // width in cols (1–12)
  h: number   // height in row units
}

// ─── Full widget config ───────────────────────────────────────────────────────

export interface WidgetConfig {
  id:      string
  visual:  WidgetVisual
  titulo?: string
  metrica: BiMetrica
  scope:   BiScope
  estilo:  WidgetEstilo
  layout:  WidgetLayout
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface BiDashboard {
  id:             string
  user_id:        string
  nome:           string
  periodo_global: BiPeriodo
  widgets:        WidgetConfig[]
  atualizado_em:  string
}

// ─── Query result variants ────────────────────────────────────────────────────

export type BiQueryResult =
  | {
      tipo: 'escalar'
      valor: number
      comparativo: number | null
      variacao_pct: number | null
    }
  | {
      tipo: 'serie'
      pontos: Array<{ periodo: string; realizado: number; budget: number | null }>
    }
  | {
      tipo: 'breakdown'
      itens: Array<{
        label: string
        realizado: number
        budget: number | null
        desvio_pct: number | null
        participacao_pct: number
      }>
    }
  | {
      tipo: 'dre'
      linhas: DreLine[]
    }
  | {
      tipo: 'topN'
      itens: Array<{ label: string; valor: number }>
      n: number
      ordem: 'asc' | 'desc'
    }

export interface DreLine {
  estrutura: DreStructureLine
  realizado: number
  budget: number | null
  desvio: number | null
  desvio_pct: number | null
  por_cc?: Array<{ id: string; nome: string; realizado: number; budget: number | null }>
}

export interface DreStructureLine {
  ordem:     number
  nome:      string
  tipo:      'grupo' | 'subtotal' | 'calculada'
  sinal:     number
  negrito:   boolean
  separador: boolean
}

// ─── Estilo defaults ──────────────────────────────────────────────────────────

export const DEFAULT_ESTILO: WidgetEstilo = {
  mostrar_titulo:   true,
  mostrar_legenda:  true,
  mostrar_eixos:    true,
  mostrar_grid:     true,
  mostrar_valores:  true,
  mostrar_variacao: true,
  tamanho_fonte:    'md',
  negrito:          false,
  italico:          false,
  formato_numero:   'inteiro',
}

// ─── Widget visual meta ───────────────────────────────────────────────────────

export interface WidgetMeta {
  visual:      WidgetVisual
  label:       string
  descricao:   string
  icon:        string
  defaultW:    number
  defaultH:    number
  defaultMetrica: BiMetrica
}

export const WIDGET_META: WidgetMeta[] = [
  { visual: 'kpi_card',       label: 'KPI Card',          descricao: 'Valor único em destaque',        icon: '🎯', defaultW: 3,  defaultH: 2, defaultMetrica: { tipo: 'linha_dre', linha_nome: 'EBIT' } },
  { visual: 'waterfall',      label: 'Cascata DRE',        descricao: 'Cascata de linhas da DRE',       icon: '🌊', defaultW: 6,  defaultH: 5, defaultMetrica: { tipo: 'dre_parcial', linhas: [] } },
  { visual: 'bar_vertical',   label: 'Barras Verticais',   descricao: 'Comparativo por período/dim.',   icon: '📊', defaultW: 6,  defaultH: 4, defaultMetrica: { tipo: 'breakdown_dpto', linha_nome: 'Receita Bruta' } },
  { visual: 'bar_horizontal', label: 'Barras Horizontais', descricao: 'Ranking de entidades',           icon: '📶', defaultW: 6,  defaultH: 4, defaultMetrica: { tipo: 'topN_grupo', grupo_nome: 'Receita Bruta', n: 10, ordem: 'desc' } },
  { visual: 'line_area',      label: 'Linha / Área',       descricao: 'Evolução no tempo',              icon: '📈', defaultW: 8,  defaultH: 4, defaultMetrica: { tipo: 'serie_temporal', linha_nome: 'EBIT' } },
  { visual: 'donut',          label: 'Rosca',              descricao: 'Distribuição percentual',        icon: '🍩', defaultW: 4,  defaultH: 4, defaultMetrica: { tipo: 'breakdown_dpto', linha_nome: 'Receita Bruta' } },
  { visual: 'pie',            label: 'Pizza',              descricao: 'Participação por fatia',         icon: '🥧', defaultW: 4,  defaultH: 4, defaultMetrica: { tipo: 'breakdown_cc', linha_nome: 'Receita Bruta' } },
  { visual: 'table',          label: 'Tabela DRE',         descricao: 'Tabela analítica com desvio',    icon: '📋', defaultW: 12, defaultH: 5, defaultMetrica: { tipo: 'dre_completa' } },
  { visual: 'text_label',     label: 'Texto Livre',        descricao: 'Título, nota ou legenda',        icon: '✏️', defaultW: 4,  defaultH: 1, defaultMetrica: { tipo: 'dre_completa' } },
]
