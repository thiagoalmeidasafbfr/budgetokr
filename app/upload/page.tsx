'use client'
import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, ArrowRight, X, AlertCircle, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import {
  LANCAMENTO_COLUMNS, CENTRO_CUSTO_COLUMNS, CONTA_CONTABIL_COLUMNS, DRE_LINHAS_COLUMNS,
  type UploadTipo
} from '@/lib/types'

type Step = 'choose' | 'upload' | 'mapping' | 'importing' | 'done'

const TIPO_OPTIONS: Array<{ value: UploadTipo; label: string; desc: string; color: string }> = [
  { value: 'lancamentos_budget',  label: 'Lançamentos — Budget',       desc: 'Valores orçados por conta e centro de custo',      color: 'indigo' },
  { value: 'lancamentos_razao',   label: 'Lançamentos — Razão (Real)', desc: 'Valores realizados / movimentos contábeis reais',  color: 'emerald' },
  { value: 'centros_custo',       label: 'Centros de Custo',           desc: 'Dimensão: CC → Departamento → Área',              color: 'amber' },
  { value: 'contas_contabeis',    label: 'Contas Contábeis',           desc: 'Dimensão: Conta → Agrupamento → DRE (com ordem)', color: 'purple' },
  { value: 'dre_linhas',          label: 'Estrutura da DRE',           desc: 'Ordem, subtotais e sinais da DRE gerencial',      color: 'rose' },
]

function getColumns(tipo: UploadTipo) {
  if (tipo === 'lancamentos_budget' || tipo === 'lancamentos_razao') return LANCAMENTO_COLUMNS
  if (tipo === 'centros_custo')   return CENTRO_CUSTO_COLUMNS
  if (tipo === 'dre_linhas')      return DRE_LINHAS_COLUMNS
  return CONTA_CONTABIL_COLUMNS
}

export default function UploadPage() {
  const router = useRouter()
  const [step, setStep]           = useState<Step>('choose')
  const [tipo, setTipo]           = useState<UploadTipo | null>(null)
  const [mode, setMode]           = useState<'append' | 'replace'>('append')
  const [file, setFile]           = useState<File | null>(null)
  const [dragging, setDragging]   = useState(false)
  const [error, setError]         = useState('')
  const [columns, setColumns]     = useState<string[]>([])
  const [sample, setSample]       = useState<Record<string, unknown>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [mapping, setMapping]     = useState<Record<string, string>>({})
  const [progress, setProgress]   = useState(0)
  const [result, setResult]       = useState<{ rowCount: number } | null>(null)

  const fieldCols = tipo ? getColumns(tipo) : []

  const handleFile = useCallback((f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) { setError('Formato inválido (.xlsx, .xls, .csv)'); return }
    setFile(f)
    setError('')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const analyzeFile = async () => {
    if (!file || !tipo) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('tipo', tipo)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }

    setColumns(data.columns)
    setSample(data.sample)
    setTotalRows(data.total)

    // Normalize: remove accents, lowercase, strip punctuation
    const norm = (s: string) =>
      s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_\-./()]/g, '')

    // Count how many sample rows have an actual numeric value in a column
    const countNumericInSample = (col: string): number =>
      data.sample.filter((row: Record<string, unknown>) => {
        const raw = String(row[col] ?? '').trim()
          .replace(/[^\d,.+\-]/g, '') // keep only numeric chars
        return raw.length > 0 && raw !== '-' && raw !== '+' && !isNaN(parseFloat(raw.replace(',', '.')))
      }).length

    const autoMap: Record<string, string> = {}
    for (const fc of fieldCols) {
      if (fc.key === 'debito_credito') {
        // For the value column, pick the candidate with the most actual numeric values in the
        // sample — this reliably chooses "Valor" over "Débito/ Crédito" (which has "–" dashes)
        const candidates = data.columns.filter((c: string) => {
          const n = norm(c)
          return n.includes('valor') || n.includes('debito') || n.includes('credito') ||
                 n.includes('amount') || n.includes('montante') || n.includes('debitocredito')
        })
        const pool = candidates.length > 0 ? candidates : data.columns
        const scored = pool
          .map((c: string) => ({ c, isValor: norm(c).includes('valor'), count: countNumericInSample(c) }))
          .sort((a: { c: string; isValor: boolean; count: number }, b: { c: string; isValor: boolean; count: number }) => b.count - a.count || (b.isValor ? 1 : 0) - (a.isValor ? 1 : 0))
        if (scored.length > 0) autoMap[fc.key] = scored[0].c
        continue
      }
      const normKey = norm(fc.key)
      const match = data.columns.find((c: string) => {
        const n = norm(c)
        return n === normKey || n.includes(normKey)
      })
      if (match) autoMap[fc.key] = match
    }
    setMapping(autoMap)
    setStep('mapping')
  }

  const importData = async () => {
    if (!file || !tipo) return
    const required = fieldCols.filter(f => f.required)
    const missing  = required.filter(f => !mapping[f.key])
    if (missing.length) { setError(`Mapeie: ${missing.map(f => f.label).join(', ')}`); return }

    setStep('importing'); setProgress(10)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('tipo', tipo)
    fd.append('mapping', JSON.stringify(mapping))
    fd.append('mode', mode)

    const interval = setInterval(() => setProgress(p => Math.min(p + 6, 88)), 400)
    const res  = await fetch('/api/upload', { method: 'POST', body: fd })
    clearInterval(interval); setProgress(100)

    const data = await res.json()
    if (!res.ok) { setError(data.error); setStep('mapping'); return }
    setResult({ rowCount: data.rowCount })
    setTimeout(() => setStep('done'), 300)
  }

  const reset = () => {
    setStep('choose'); setTipo(null); setFile(null); setMapping({})
    setColumns([]); setSample([]); setError(''); setProgress(0); setResult(null)
  }

  const tipoInfo = TIPO_OPTIONS.find(t => t.value === tipo)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Dados</h1>
        <p className="text-gray-500 text-sm mt-0.5">Importe cada tabela separadamente via Excel</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-sm">
        {(['choose','upload','mapping','importing','done'] as Step[]).map((s, i) => {
          const labels = ['Tipo','Arquivo','Colunas','Importando','Pronto']
          const idx = (['choose','upload','mapping','importing','done'] as Step[]).indexOf(step)
          const done = i < idx; const current = i === idx
          return (
            <div key={s} className="flex items-center gap-1.5">
              <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                done ? 'bg-indigo-600 text-white' : current ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300' : 'bg-gray-100 text-gray-400')}>
                {done ? <CheckCircle size={12} /> : i + 1}
              </div>
              <span className={cn(current ? 'text-gray-900 font-medium' : 'text-gray-400')}>{labels[i]}</span>
              {i < 4 && <ArrowRight size={12} className="text-gray-200" />}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={15} />{error}
          <button onClick={() => setError('')} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* Step: Choose type */}
      {step === 'choose' && (
        <div className="grid grid-cols-2 gap-3">
          {TIPO_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => { setTipo(opt.value); setStep('upload') }}
              className={cn('text-left p-4 rounded-xl border-2 transition-all hover:shadow-md',
                `border-gray-100 hover:border-${opt.color}-200 bg-white`)}>
              <div className={cn('w-8 h-8 rounded-lg mb-3 flex items-center justify-center text-white text-xs font-bold',
                opt.color === 'indigo' && 'bg-indigo-500',
                opt.color === 'emerald' && 'bg-emerald-500',
                opt.color === 'amber' && 'bg-amber-500',
                opt.color === 'purple' && 'bg-purple-500',
              )}>
                {opt.value === 'lancamentos_budget' ? 'B' : opt.value === 'lancamentos_razao' ? 'R' : opt.value === 'centros_custo' ? 'CC' : 'CA'}
              </div>
              <p className="font-semibold text-gray-900 text-sm">{opt.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step: Upload file */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="default">{tipoInfo?.label}</Badge>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X size={11} /> Mudar tipo
            </button>
          </div>

          {/* Mode for lancamentos */}
          {(tipo === 'lancamentos_budget' || tipo === 'lancamentos_razao') && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Modo de importação</p>
                <div className="flex gap-3">
                  {(['append','replace'] as const).map(m => (
                    <label key={m} className={cn('flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border text-sm transition-colors',
                      mode === m ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                      <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-indigo-600" />
                      {m === 'append' ? 'Adicionar (manter dados existentes)' : 'Substituir (apagar e reimportar)'}
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <div
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onClick={() => document.getElementById('file-input')?.click()}
                className={cn('border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
                  dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50')}>
                <input id="file-input" type="file" className="hidden" accept=".xlsx,.xls,.csv"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <FileSpreadsheet size={36} className="mx-auto text-gray-300 mb-2" />
                {file
                  ? <><p className="font-semibold text-gray-800">{file.name}</p><p className="text-xs text-gray-400">{(file.size/1024/1024).toFixed(2)} MB</p></>
                  : <><p className="text-gray-500 font-medium">Arraste ou clique para selecionar</p><p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv</p></>}
              </div>

              <div className="flex gap-3 mt-4">
                <Button variant="outline" onClick={reset}>Voltar</Button>
                <Button onClick={analyzeFile} disabled={!file} className="flex-1">
                  Analisar Arquivo <ArrowRight size={15} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Column mapping */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mapear Colunas</CardTitle>
              <CardDescription>{totalRows.toLocaleString()} linhas · {columns.length} colunas detectadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {fieldCols.map(fc => (
                <div key={fc.key} className="flex items-center gap-3">
                  <div className="w-52 flex-shrink-0">
                    <p className="text-sm font-medium text-gray-700">{fc.label}</p>
                    {'required' in fc && fc.required && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 mt-0.5">Obrigatório</Badge>}
                  </div>
                  <select
                    value={mapping[fc.key] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [fc.key]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">— Não mapeado —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sample */}
          {sample.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Prévia</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b bg-gray-50">
                      {columns.map(c => (
                        <th key={c} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">
                          {c}{Object.values(mapping).includes(c) && <span className="text-indigo-500 ml-1">●</span>}
                        </th>
                      ))}
                    </tr></thead>
                    <tbody>{sample.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {columns.map(c => <td key={c} className="px-3 py-1.5 text-gray-600 max-w-28 truncate whitespace-nowrap">{String(r[c] ?? '')}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
            <Button onClick={importData} className="flex-1">
              Importar {totalRows.toLocaleString()} linhas <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <Card><CardContent className="p-10 text-center space-y-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="font-semibold text-gray-900">Importando {totalRows.toLocaleString()} linhas...</p>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-gray-400">{progress}%</p>
        </CardContent></Card>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <Card><CardContent className="p-10 text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle size={28} className="text-emerald-500" />
          </div>
          <p className="font-bold text-gray-900 text-lg">Importação concluída!</p>
          <p className="text-sm text-gray-400">{result?.rowCount.toLocaleString()} linhas de <strong>{tipoInfo?.label}</strong> importadas</p>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" onClick={reset}>Importar outro arquivo</Button>
            <Button onClick={() => router.push('/')}>Ver Dashboard <ArrowRight size={15} /></Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  )
}
