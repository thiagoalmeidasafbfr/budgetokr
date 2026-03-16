'use client'
import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, ArrowRight, X, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

type Step = 'upload' | 'mapping' | 'importing' | 'done'

const REQUIRED_FIELDS = [
  { key: 'department', label: 'Departamento', required: true },
  { key: 'grp', label: 'Grupo / Categoria', required: false },
  { key: 'account', label: 'Conta / Centro de Custo', required: false },
  { key: 'period', label: 'Período (mês/ano)', required: false },
  { key: 'budget', label: 'Budget (valor)', required: true },
  { key: 'actual', label: 'Realizado (valor)', required: true },
] as const

type FieldKey = typeof REQUIRED_FIELDS[number]['key']

export default function UploadPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [sampleData, setSampleData] = useState<Record<string, unknown>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    department: '',
    grp: '',
    account: '',
    period: '',
    budget: '',
    actual: '',
  })
  const [progress, setProgress] = useState(0)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Formato inválido. Use .xlsx, .xls ou .csv')
      return
    }
    setFile(f)
    setName(f.name.replace(/\.[^.]+$/, ''))
    setError('')
  }

  const analyzeFile = async () => {
    if (!file) return
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) { setError(data.error); return }

    setColumns(data.columns)
    setSampleData(data.sample)
    setTotalRows(data.total)
    setStep('mapping')

    // Auto-detect columns by name
    const autoMap: Partial<Record<FieldKey, string>> = {}
    for (const col of data.columns as string[]) {
      const lower = col.toLowerCase()
      if (lower.includes('departamento') || lower.includes('department') || lower.includes('depto')) autoMap.department = col
      else if (lower.includes('grupo') || lower.includes('group') || lower.includes('categoria')) autoMap.grp = col
      else if (lower.includes('conta') || lower.includes('account') || lower.includes('centro')) autoMap.account = col
      else if (lower.includes('periodo') || lower.includes('period') || lower.includes('mes') || lower.includes('month') || lower.includes('data') || lower.includes('date')) autoMap.period = col
      else if (lower.includes('budget') || lower.includes('orcado') || lower.includes('orçado') || lower.includes('planejado')) autoMap.budget = col
      else if (lower.includes('realizado') || lower.includes('actual') || lower.includes('real')) autoMap.actual = col
    }
    setMapping(prev => ({ ...prev, ...autoMap }))
  }

  const importData = async () => {
    if (!file) return
    const missing = REQUIRED_FIELDS.filter(f => f.required && !mapping[f.key])
    if (missing.length) { setError(`Mapeie os campos obrigatórios: ${missing.map(f => f.label).join(', ')}`); return }

    setStep('importing')
    setProgress(10)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    formData.append('mapping', JSON.stringify(mapping))

    const interval = setInterval(() => setProgress(p => Math.min(p + 5, 85)), 500)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    clearInterval(interval)
    setProgress(100)

    const data = await res.json()
    if (!res.ok) { setError(data.error); setStep('mapping'); return }

    setTimeout(() => setStep('done'), 300)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Dados</h1>
        <p className="text-gray-500 text-sm mt-0.5">Importe sua planilha Excel e mapeie as colunas</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {['Upload', 'Mapeamento', 'Importando', 'Concluído'].map((s, i) => {
          const stepKeys: Step[] = ['upload', 'mapping', 'importing', 'done']
          const idx = stepKeys.indexOf(step)
          const done = i < idx
          const current = i === idx
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                done && 'bg-indigo-600 text-white',
                current && 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300',
                !done && !current && 'bg-gray-100 text-gray-400'
              )}>
                {done ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={cn('text-sm', current ? 'text-gray-900 font-medium' : 'text-gray-400')}>{s}</span>
              {i < 3 && <ArrowRight size={14} className="text-gray-200" />}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => document.getElementById('file-input')?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
                dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
              )}
            >
              <input
                id="file-input"
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <FileSpreadsheet size={40} className="mx-auto text-gray-300 mb-3" />
              {file ? (
                <div>
                  <p className="font-semibold text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-gray-600">Arraste seu arquivo ou clique para selecionar</p>
                  <p className="text-sm text-gray-400 mt-1">Suporte: .xlsx, .xls, .csv</p>
                </div>
              )}
            </div>

            {file && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Nome do dataset</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Ex: Budget 2024"
                  />
                </div>
                <Button onClick={analyzeFile} className="w-full">
                  <Upload size={16} /> Analisar Arquivo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step: Mapping */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mapeamento de Colunas</CardTitle>
              <CardDescription>
                Encontramos {columns.length} colunas e {totalRows.toLocaleString()} linhas.
                Associe cada campo ao campo correspondente da sua planilha.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {REQUIRED_FIELDS.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <div className="w-48 flex-shrink-0">
                    <p className="text-sm font-medium text-gray-700">{field.label}</p>
                    {field.required && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>}
                  </div>
                  <select
                    value={mapping[field.key]}
                    onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                  >
                    <option value="">— Não mapeado —</option>
                    {columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Sample preview */}
          {sampleData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Prévia dos Dados</CardTitle>
                <CardDescription>Primeiras {sampleData.length} linhas</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        {columns.map(col => (
                          <th key={col} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">
                            {col}
                            {Object.entries(mapping).find(([, v]) => v === col) && (
                              <span className="ml-1 text-indigo-500">●</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleData.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {columns.map(col => (
                            <td key={col} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-32 truncate">
                              {String(row[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('upload')}>Voltar</Button>
            <Button onClick={importData} className="flex-1">
              Importar {totalRows.toLocaleString()} linhas <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="font-semibold text-gray-900">Importando dados...</p>
            <p className="text-sm text-gray-400">Processando {totalRows.toLocaleString()} linhas</p>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{progress}%</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <p className="font-bold text-gray-900 text-lg">Importação concluída!</p>
            <p className="text-sm text-gray-400">
              {totalRows.toLocaleString()} linhas importadas com sucesso
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => { setStep('upload'); setFile(null) }}>
                Importar outro arquivo
              </Button>
              <Button onClick={() => router.push('/')}>
                Ver Dashboard <ArrowRight size={16} />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
