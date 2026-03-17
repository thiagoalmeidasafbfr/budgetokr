import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getDb } from '@/lib/db'

export const maxDuration = 60

/**
 * Converte qualquer valor vindo do Excel para número JS correto.
 *
 * Casos cobertos:
 *   número nativo float  →  retorna direto (xlsx já parseou certo)
 *   "-4.425,04"          →  -4425.04   (pt-BR: ponto=milhar, vírgula=decimal)
 *   "-23.076,28"         →  -23076.28
 *   "-0,02"              →  -0.02
 *   "1,234.56"           →  1234.56    (en-US)
 *   "825.70"             →  825.70
 *   "-0,00002"           →  -0.00002
 *
 * Problema raiz anterior: Excel exporta o sinal de menos como Unicode
 * MINUS SIGN (U+2212 −) em vez do hífen ASCII (U+002D -). Isso quebrava
 * todas as regexes de detecção de formato.
 */
function parseNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0

  // Número nativo: xlsx já leu como float — retorna direto, sem escala
  if (typeof v === 'number') return isNaN(v) ? 0 : v

  let s = String(v)
    .trim()
    // Normaliza QUALQUER variante de sinal negativo para hífen ASCII
    .replace(/[\u2212\u2010\u2011\u2013\u2014\uFE58\uFE63\uFF0D]/g, '-')
    // Remove espaços e caracteres invisíveis
    .replace(/[\s\u00A0\u202F\u2009]/g, '')

  // Formato contábil: (1.234,56) → -1.234,56
  if (s.startsWith('(') && s.endsWith(')')) {
    s = '-' + s.slice(1, -1)
  }

  if (s === '' || s === '-' || s === '') return 0

  const negative = s.startsWith('-')
  if (negative) s = s.slice(1)

  let result: number

  // Caso 1 — pt-BR: tem vírgula (decimal) e pode ter pontos (milhar)
  // Ex: "4.425,04" | "23.076,28" | "0,02" | "1.234.567,89"
  if (s.includes(',')) {
    // Remove todos os pontos (separadores de milhar) e troca vírgula por ponto
    result = parseFloat(s.replace(/\./g, '').replace(',', '.'))

  // Caso 2 — en-US: tem ponto decimal e pode ter vírgulas (milhar)
  // Ex: "4,425.04" | "1,234.56"
  } else if (s.includes(',') === false && s.includes('.')) {
    // Vírgulas são milhares; ponto é decimal — remove as vírgulas
    result = parseFloat(s.replace(/,/g, ''))

  // Caso 3 — inteiro puro ou ponto como decimal sem ambiguidade
  } else {
    result = parseFloat(s) || 0
  }

  if (isNaN(result)) return 0
  return negative ? -result : result
}

function parseDate(v: unknown): string {
  if (!v) return ''

  const s = String(v).trim()
  if (!s) return ''

  // Excel serial number como string inteira (ex: "45658")
  if (/^\d{4,6}$/.test(s)) {
    try {
      const dd = XLSX.SSF.parse_date_code(parseInt(s))
      if (dd && dd.y > 1900) return `${dd.y}-${String(dd.m).padStart(2,'0')}-${String(dd.d).padStart(2,'0')}`
    } catch { /* not a serial */ }
  }

  // ISO: yyyy-mm-dd or yyyy/mm/dd
  const iso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`

  // Formato Brasileiro (padrão): dd/mm/aaaa  → "01/02/2025" = 1 de Fevereiro
  const br = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/)
  if (br) return `${br[3]}-${br[2].padStart(2,'0')}-${br[1].padStart(2,'0')}`

  // Brasileiro curto: dd/mm/aa
  const brShort = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/)
  if (brShort) {
    const yr = parseInt(brShort[3])
    const y4 = yr + (yr <= 30 ? 2000 : 1900)
    return `${y4}-${brShort[2].padStart(2,'0')}-${brShort[1].padStart(2,'0')}`
  }

  // Apenas mês/ano: MM/YYYY ou M/YYYY (orçamento sem dia, ex: "01/2025")
  // Assume dia 01 para compatibilidade com strftime
  const mmyyyy = s.match(/^(\d{1,2})[-\/](\d{4})$/)
  if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1].padStart(2,'0')}-01`

  // Apenas ano/mês: YYYY/MM ou YYYY-MM
  const yyyymm = s.match(/^(\d{4})[-\/](\d{1,2})$/)
  if (yyyymm) return `${yyyymm[1]}-${yyyymm[2].padStart(2,'0')}-01`

  return s
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File
    const tipo     = formData.get('tipo') as string
    const mapping  = formData.get('mapping') as string

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const bytes    = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array' })
    const sheet    = workbook.Sheets[workbook.SheetNames[0]]

    // rawNumbers: false → TODAS as células (incluindo datas) vêm como string
    // formatada pelo Excel (ex: "01/02/2025", "-4.425,04"). Sem cellDates,
    // não há conversão para Date objects nem problemas de timezone.
    const raw = XLSX.utils.sheet_to_json(sheet, {
      defval:     '',
      rawNumbers: false,
    }) as Record<string, unknown>[]

    if (!raw.length) return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })

    const columns = Object.keys(raw[0])

    if (!mapping) {
      return NextResponse.json({ columns, sample: raw.slice(0, 5), total: raw.length })
    }

    const map: Record<string, string> = JSON.parse(mapping)
    const get = (row: Record<string, unknown>, key: string) => map[key] ? row[map[key]] : ''

    const db = getDb()

    // ── Lançamentos Budget ou Razão ──────────────────────────────────────────
    if (tipo === 'lancamentos_budget' || tipo === 'lancamentos_razao') {
      const tipoVal = tipo === 'lancamentos_budget' ? 'budget' : 'razao'
      const modeRaw = (formData.get('mode') as string) ?? 'append'

      if (modeRaw === 'replace') {
        db.prepare(`DELETE FROM lancamentos WHERE tipo = ?`).run(tipoVal)
      }

      const insert = db.prepare(`
        INSERT INTO lancamentos
          (tipo, data_lancamento, nome_conta_contabil, numero_conta_contabil,
           centro_custo, nome_conta_contrapartida, fonte, observacao, debito_credito)
        VALUES (?,?,?,?,?,?,?,?,?)
      `)

      const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
        for (const row of rows) {
          insert.run(
            tipoVal,
            parseDate(get(row, 'data_lancamento')),
            String(get(row, 'nome_conta_contabil')      ?? ''),
            String(get(row, 'numero_conta_contabil')    ?? ''),
            String(get(row, 'centro_custo')             ?? ''),
            String(get(row, 'nome_conta_contrapartida') ?? ''),
            String(get(row, 'fonte')                    ?? ''),
            String(get(row, 'observacao')               ?? ''),
            parseNumber(get(row, 'debito_credito')),
          )
        }
      })

      insertMany(raw)
      return NextResponse.json({ success: true, rowCount: raw.length, tipo: tipoVal })
    }

    // ── Centros de Custo ─────────────────────────────────────────────────────
    if (tipo === 'centros_custo') {
      const upsert = db.prepare(`
        INSERT INTO centros_custo (centro_custo, nome_centro_custo, departamento, nome_departamento, area, nome_area)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(centro_custo) DO UPDATE SET
          nome_centro_custo=excluded.nome_centro_custo,
          departamento=excluded.departamento,
          nome_departamento=excluded.nome_departamento,
          area=excluded.area,
          nome_area=excluded.nome_area
      `)
      const upsertMany = db.transaction((rows: Record<string, unknown>[]) => {
        for (const row of rows) {
          const cc = String(get(row, 'centro_custo') ?? '').trim()
          if (!cc) continue
          upsert.run(
            cc,
            String(get(row, 'nome_centro_custo')   ?? ''),
            String(get(row, 'departamento')         ?? ''),
            String(get(row, 'nome_departamento')    ?? ''),
            String(get(row, 'area')                 ?? ''),
            String(get(row, 'nome_area')            ?? ''),
          )
        }
      })
      upsertMany(raw)
      return NextResponse.json({ success: true, rowCount: raw.length, tipo })
    }

    // ── Contas Contábeis ─────────────────────────────────────────────────────
    if (tipo === 'contas_contabeis') {
      const upsert = db.prepare(`
        INSERT INTO contas_contabeis (numero_conta_contabil, nome_conta_contabil, agrupamento_arvore, dre)
        VALUES (?,?,?,?)
        ON CONFLICT(numero_conta_contabil) DO UPDATE SET
          nome_conta_contabil=excluded.nome_conta_contabil,
          agrupamento_arvore=excluded.agrupamento_arvore,
          dre=excluded.dre
      `)
      const upsertMany = db.transaction((rows: Record<string, unknown>[]) => {
        for (const row of rows) {
          const num = String(get(row, 'numero_conta_contabil') ?? '').trim()
          if (!num) continue
          upsert.run(
            num,
            String(get(row, 'nome_conta_contabil') ?? ''),
            String(get(row, 'agrupamento_arvore')  ?? ''),
            String(get(row, 'dre')                 ?? ''),
          )
        }
      })
      upsertMany(raw)
      return NextResponse.json({ success: true, rowCount: raw.length, tipo })
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
