import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getDb } from '@/lib/db'

export const maxDuration = 60

function parseNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const s = String(v).replace(/\s/g, '').replace(',', '.')
  return parseFloat(s.replace(/[^0-9.\-]/g, '')) || 0
}

function parseDate(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'object' && v !== null && 'toISOString' in v) {
    return (v as Date).toISOString().substring(0, 10)
  }
  const s = String(v).trim()
  // Handle Excel serial date
  if (/^\d+$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(parseInt(s))
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  return s
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File
    const tipo     = formData.get('tipo') as string   // upload type
    const mapping  = formData.get('mapping') as string

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const bytes    = await file.arrayBuffer()
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
    const sheet    = workbook.Sheets[workbook.SheetNames[0]]
    const raw      = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]

    if (!raw.length) return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })

    const columns = Object.keys(raw[0])

    // Step 1: return columns for mapping
    if (!mapping) {
      return NextResponse.json({ columns, sample: raw.slice(0, 5), total: raw.length })
    }

    const map: Record<string, string> = JSON.parse(mapping)
    const get = (row: Record<string, unknown>, key: string) => map[key] ? row[map[key]] : ''

    const db = getDb()

    // ── Lançamentos Budget or Razão ──────────────────────────────────────────
    if (tipo === 'lancamentos_budget' || tipo === 'lancamentos_razao') {
      const tipoVal = tipo === 'lancamentos_budget' ? 'budget' : 'razao'
      const modeRaw = formData.get('mode') as string ?? 'append'

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
