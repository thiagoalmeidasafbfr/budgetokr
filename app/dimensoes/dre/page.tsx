'use client'
import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DRELinha {
  id: number
  ordem: number
  nome: string
  tipo: 'grupo' | 'subtotal'
  sinal: number
  formula_grupos: string
  formula_sinais: string
  negrito: number
  separador: number
}

export default function DREDimensaoPage() {
  const [linhas, setLinhas] = useState<DRELinha[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dre?type=linhas')
      .then(r => r.json())
      .then(data => { setLinhas(Array.isArray(data) ? data : []); setLoading(false) })
  }, [])

  const grupos = JSON.parse
  const getFormula = (row: DRELinha) => {
    try {
      const gs: string[] = JSON.parse(row.formula_grupos)
      const ss: number[] = JSON.parse(row.formula_sinais)
      return gs.map((g, i) => `${ss[i] >= 0 ? '+' : '−'} ${g}`).join('  ')
    } catch { return '—' }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Estrutura da DRE</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Linhas e fórmulas que compõem o demonstrativo de resultados · {linhas.length} linhas configuradas
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <a href="/upload">
            <Upload size={13} /> Importar estrutura
          </a>
        </Button>
      </div>

      {!loading && linhas.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <ChevronRight size={20} className="text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-700">Nenhuma estrutura de DRE importada</p>
              <p className="text-sm text-gray-400 mt-1">Importe um arquivo com a estrutura de linhas da DRE via Upload.</p>
            </div>
            <Button size="sm" asChild><a href="/upload">Ir para Upload</a></Button>
          </div>
        </Card>
      )}

      {(loading || linhas.length > 0) && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-12">Ordem</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Nome / Linha</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-24">Tipo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Fórmula (Grupos)</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-12">Sinal</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-16">Negrito</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-16">Separador</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td>
                  </tr>
                )}
                {!loading && linhas.map(row => (
                  <tr key={row.id} className={cn(
                    'border-b border-gray-50 hover:bg-gray-50 transition-colors',
                    row.separador ? 'border-b-2 border-b-gray-200' : ''
                  )}>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{row.ordem}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'text-gray-800',
                        row.negrito ? 'font-bold' : 'font-normal',
                        row.tipo === 'subtotal' ? 'text-gray-700' : ''
                      )}>
                        {row.nome}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        row.tipo === 'subtotal'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-gray-100 text-gray-600'
                      )}>
                        {row.tipo === 'subtotal' ? 'Subtotal' : 'Grupo'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{getFormula(row)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn('font-bold text-sm', row.sinal >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {row.sinal >= 0 ? '+' : '−'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{row.negrito ? '✓' : '—'}</td>
                    <td className="px-4 py-2.5 text-center text-gray-400 text-xs">{row.separador ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
