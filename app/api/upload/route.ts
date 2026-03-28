import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getSupabase } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export const maxDuration = 60

/**
 * Converte qualquer valor vindo do Excel para número JS correto.
 */
function parseNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v

  let s = String(v)
    .trim()
    .replace(/[\u2212\u2010\u2011\u2013\u2014\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\s\u00A0\u202F\u2009]/g, '')

  if (s.startsWith('(') && s.endsWith(')')) {
    s = '-' + s.slice(1, -1)
  }

  if (s === '' || s === '-' || s === '') return 0

  const negative = s.startsWith('-')
  if (negative) s = s.slice(1)

  let result: number

  const lastDot   = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')

  if (lastComma > lastDot) {
    // Vírgula é decimal (BR: "1.234,56" ou "1234,56")
    result = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  } else if (lastDot > lastComma) {
    // Ponto é decimal (US: "1,234.56" ou "1234.56")
    result = parseFloat(s.replace(/,/g, ''))
  } else {
    // Sem separador
    result = parseFloat(s) || 0
  }

  if (isNaN(result)) return 0
  return negative ? -result : result
}

function parseDate(v: unknown): string {
  if (!v) return ''
  const s = String(v).trim()
  if (!s) return ''

  if (/^\d{4,6}$/.test(s)) {
    try {
      const dd = XLSX.SSF.parse_date_code(parseInt(s))
      if (dd && dd.y > 1900) return `${dd.y}-${String(dd.m).padStart(2,'0')}-${String(dd.d).padStart(2,'0')}`
    } catch { /* not a serial */ }
  }

  const iso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`

  const br = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/)
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`

  const brShort = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/)
  if (brShort) {
    const yr = parseInt(brShort[3])
    const y4 = yr + (yr <= 30 ? 2000 : 1900)
    return `${y4}-${brShort[2].padStart(2,'0')}-${brShort[1].padStart(2,'0')}`
  }

  const mmyyyy = s.match(/^(\d{1,2})[-\/](\d{4})$/)
  if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1].padStart(2,'0')}-01`

  const yyyymm = s.match(/^(\d{4})[-\/](\d{1,2})$/)
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2].padStart(2,'0')}-01`

  return s
}

const CHUNK_SIZE = 1000

async function insertInChunks(
  table: string,
  rows: Record<string, unknown>[],
  supabase: ReturnType<typeof getSupabase>
) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw new Error(error.message)
  }
}

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (user.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const sp = new URL(req.url).searchParams
    const ct = req.headers.get('content-type') ?? ''

    let raw: Record<string, unknown>[] | null = null
    let tipo:    string
    let mapping: string | null
    let modeFromQuery: string | null

    if (ct.includes('application/json')) {
      // Client-side parsed rows — no Excel binary needed
      const body     = await req.json()
      tipo          = body.tipo    ?? ''
      mapping       = body.mapping ?? null
      modeFromQuery = body.mode    ?? null
      raw = body.rows as Record<string, unknown>[]
      if (!raw?.length) return NextResponse.json({ error: 'Nenhuma linha recebida' }, { status: 400 })
    } else {
      let bytes: ArrayBuffer
      if (ct.includes('application/octet-stream')) {
        bytes         = await req.arrayBuffer()
        tipo          = sp.get('tipo') ?? ''
        mapping       = sp.get('mapping')
        modeFromQuery = sp.get('mode')
      } else {
        const formData = await req.formData()
        const file     = formData.get('file') as File
        tipo           = (formData.get('tipo') as string) ?? ''
        mapping        = formData.get('mapping') as string | null
        modeFromQuery  = formData.get('mode') as string | null
        if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
        bytes = await file.arrayBuffer()
      }

      if (!bytes || bytes.byteLength === 0)
        return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

      const workbook = XLSX.read(bytes, { type: 'array', cellNF: true })
      const sheet    = workbook.Sheets[workbook.SheetNames[0]]

      for (const key of Object.keys(sheet)) {
        if (key.startsWith('!')) continue
        const cell = sheet[key]
        if (!cell || cell.t !== 'n') continue
        const fmt = String(cell.z ?? '')
        const fmtClean = fmt.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
        if (!/[yYdD]/.test(fmtClean)) continue
        try {
          const dd = XLSX.SSF.parse_date_code(cell.v as number)
          if (dd && dd.y > 1900 && dd.y < 2200) {
            cell.w = `${dd.y}-${String(dd.m).padStart(2,'0')}-${String(dd.d).padStart(2,'0')}`
          }
        } catch { /* não é serial de data */ }
      }

      raw = XLSX.utils.sheet_to_json(sheet, {
        defval:     '',
        rawNumbers: false,
      }) as Record<string, unknown>[]

      if (!raw.length) return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })

      const columns = Object.keys(raw[0])

      if (!mapping) {
        return NextResponse.json({ columns, sample: raw.slice(0, 5), total: raw.length })
      }
    }

    const map: Record<string, string> = JSON.parse(mapping)
    const get = (row: Record<string, unknown>, key: string) => map[key] ? row[map[key]] : ''

    const supabase = getSupabase()

    // ── Lançamentos Budget ou Razão ──────────────────────────────────────────
    if (tipo === 'lancamentos_budget' || tipo === 'lancamentos_razao') {
      const tipoVal = tipo === 'lancamentos_budget' ? 'budget' : 'razao'
      const modeRaw = modeFromQuery ?? 'append'

      if (modeRaw === 'replace') {
        const { error } = await supabase.from('lancamentos').delete().eq('tipo', tipoVal)
        if (error) throw new Error(error.message)
      }

      const rows = raw.map(row => {
        const anoRaw = get(row, 'data_ano')
        const mesRaw = get(row, 'data_mes')
        let dataFinal: string
        if (anoRaw && mesRaw) {
          const ano = parseInt(String(anoRaw), 10)
          const mes = parseInt(String(mesRaw), 10)
          if (ano > 1900 && mes >= 1 && mes <= 12) {
            dataFinal = `${ano}-${String(mes).padStart(2, '0')}-01`
          } else {
            dataFinal = parseDate(get(row, 'data_lancamento'))
          }
        } else {
          dataFinal = parseDate(get(row, 'data_lancamento'))
        }
        const idCcCc      = String(get(row, 'id_cc_cc')      ?? '').trim() || null
        const numTransacao = String(get(row, 'num_transacao') ?? '').trim() || null
        return {
          tipo:                     tipoVal,
          data_lancamento:          dataFinal || null,
          numero_transacao:         String(get(row, 'numero_transacao')         ?? '') || null,
          nome_conta_contabil:      String(get(row, 'nome_conta_contabil')      ?? ''),
          numero_conta_contabil:    String(get(row, 'numero_conta_contabil')    ?? ''),
          centro_custo:             String(get(row, 'centro_custo')             ?? ''),
          nome_conta_contrapartida: String(get(row, 'nome_conta_contrapartida') ?? ''),
          fonte:                    String(get(row, 'fonte')                    ?? ''),
          observacao:               String(get(row, 'observacao')               ?? ''),
          debito_credito:           parseNumber(get(row, 'debito_credito')),
          ...(idCcCc       ? { id_cc_cc:      idCcCc      } : {}),
          ...(numTransacao ? { num_transacao: numTransacao } : {}),
        }
      })

      await insertInChunks('lancamentos', rows, supabase)
      return NextResponse.json({ success: true, rowCount: raw.length, tipo: tipoVal })
    }

    // ── CAPEX Budget ou Razão ─────────────────────────────────────────────────
    if (tipo === 'capex_budget' || tipo === 'capex_razao') {
      const tipoVal = tipo === 'capex_budget' ? 'budget' : 'razao'
      const modeRaw = modeFromQuery ?? 'append'

      if (modeRaw === 'replace') {
        const { error } = await supabase.from('capex').delete().eq('tipo', tipoVal)
        if (error) throw new Error(error.message)
      }

      const rows = raw.map(row => {
        const anoRaw = get(row, 'data_ano')
        const mesRaw = get(row, 'data_mes')
        let dataFinal: string
        if (anoRaw && mesRaw) {
          const ano = parseInt(String(anoRaw), 10)
          const mes = parseInt(String(mesRaw), 10)
          if (ano > 1900 && mes >= 1 && mes <= 12) {
            dataFinal = `${ano}-${String(mes).padStart(2, '0')}-01`
          } else {
            dataFinal = parseDate(get(row, 'data_lancamento'))
          }
        } else {
          dataFinal = parseDate(get(row, 'data_lancamento'))
        }
        return {
          tipo:                     tipoVal,
          data_lancamento:          dataFinal || null,
          nome_projeto:             String(get(row, 'nome_projeto')              ?? ''),
          nome_conta_contabil:      String(get(row, 'nome_conta_contabil')       ?? ''),
          numero_conta_contabil:    String(get(row, 'numero_conta_contabil')     ?? ''),
          centro_custo:             String(get(row, 'centro_custo')              ?? ''),
          nome_conta_contrapartida: String(get(row, 'nome_conta_contrapartida')  ?? ''),
          fonte:                    String(get(row, 'fonte')                     ?? ''),
          observacao:               String(get(row, 'observacao')                ?? ''),
          debito_credito:           parseNumber(get(row, 'debito_credito')),
        }
      })

      await insertInChunks('capex', rows, supabase)
      return NextResponse.json({ success: true, rowCount: raw.length, tipo: tipoVal })
    }

    // ── Centros de Custo ─────────────────────────────────────────────────────
    if (tipo === 'centros_custo') {
      const rows = raw
        .map(row => ({
          centro_custo:       String(get(row, 'centro_custo')       ?? '').trim(),
          nome_centro_custo:  String(get(row, 'nome_centro_custo')  ?? ''),
          departamento:       String(get(row, 'departamento')        ?? ''),
          nome_departamento:  String(get(row, 'nome_departamento')   ?? ''),
          area:               String(get(row, 'area')                ?? ''),
          nome_area:          String(get(row, 'nome_area')           ?? ''),
        }))
        .filter(r => r.centro_custo)

      // deduplica pelo campo chave (mantém última ocorrência)
      const deduped = Object.values(
        Object.fromEntries(rows.map(r => [r.centro_custo, r]))
      )

      for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
        const chunk = deduped.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase
          .from('centros_custo')
          .upsert(chunk, { onConflict: 'centro_custo' })
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ success: true, rowCount: deduped.length, tipo })
    }

    // ── Contas Contábeis ─────────────────────────────────────────────────────
    if (tipo === 'contas_contabeis') {
      const rows = raw
        .map(row => {
          const num = String(get(row, 'numero_conta_contabil') ?? '').trim()
          if (!num) return null
          const ordemRaw = get(row, 'ordem_dre')
          const ordem = ordemRaw !== '' && ordemRaw !== null && ordemRaw !== undefined
            ? parseInt(String(ordemRaw), 10) || 999
            : 999
          return {
            numero_conta_contabil: num,
            nome_conta_contabil:   String(get(row, 'nome_conta_contabil') ?? ''),
            agrupamento_arvore:    String(get(row, 'agrupamento_arvore')  ?? ''),
            dre:                   String(get(row, 'dre')                 ?? ''),
            ordem_dre:             ordem,
          }
        })
        .filter(Boolean) as Array<Record<string, unknown>>

      // deduplica pelo campo chave
      const deduped = Object.values(
        Object.fromEntries(rows.map(r => [r.numero_conta_contabil, r]))
      )

      for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
        const chunk = deduped.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase
          .from('contas_contabeis')
          .upsert(chunk, { onConflict: 'numero_conta_contabil' })
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ success: true, rowCount: deduped.length, tipo })
    }

    // ── Estrutura DRE (linhas + subtotais) ───────────────────────────────────
    if (tipo === 'dre_linhas') {
      const modeRaw = modeFromQuery ?? 'replace'
      if (modeRaw === 'replace') {
        const { error } = await supabase.from('dre_linhas').delete().neq('id', 0)
        if (error) throw new Error(error.message)
      }

      const rows = raw
        .map(row => {
          const nome = String(get(row, 'nome') ?? '').trim()
          if (!nome) return null
          return {
            ordem:          parseInt(String(get(row, 'ordem') ?? '999'), 10) || 999,
            nome,
            tipo:           String(get(row, 'tipo') ?? 'grupo').trim() || 'grupo',
            sinal:          parseInt(String(get(row, 'sinal') ?? '1'), 10) || 1,
            formula_grupos: (() => { try { return JSON.parse(String(get(row, 'formula_grupos') ?? '[]')) } catch { return [] } })(),
            formula_sinais: (() => { try { return JSON.parse(String(get(row, 'formula_sinais') ?? '[]')) } catch { return [] } })(),
            negrito:        parseInt(String(get(row, 'negrito') ?? '0'), 10) ? true : false,
            separador:      parseInt(String(get(row, 'separador') ?? '0'), 10) ? true : false,
          }
        })
        .filter(Boolean) as Array<Record<string, unknown>>

      // deduplica pelo campo chave
      const deduped = Object.values(
        Object.fromEntries(rows.map(r => [r.nome, r]))
      )

      for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
        const chunk = deduped.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase
          .from('dre_linhas')
          .upsert(chunk, { onConflict: 'nome' })
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ success: true, rowCount: deduped.length, tipo })
    }

    // ── Unidades de Negócio ──────────────────────────────────────────────────
    if (tipo === 'unidades_negocio') {
      const rows = raw
        .map(row => ({
          id_cc_cc:          String(get(row, 'id_cc_cc')          ?? '').trim(),
          management_report: String(get(row, 'management_report') ?? ''),
          conta:             String(get(row, 'conta')             ?? ''),
          centros_custo:     String(get(row, 'centros_custo')     ?? ''),
          unidade:           String(get(row, 'unidade')           ?? ''),
        }))
        .filter(r => r.id_cc_cc)

      const deduped = Object.values(
        Object.fromEntries(rows.map(r => [r.id_cc_cc, r]))
      )

      for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
        const chunk = deduped.slice(i, i + CHUNK_SIZE)
        const { error } = await supabase
          .from('unidades_negocio')
          .upsert(chunk, { onConflict: 'id_cc_cc' })
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ success: true, rowCount: deduped.length, tipo })
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
