'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { BRAND } from '@/lib/brand'
import type { AnalysisConfig, AnalysisResult, OticaAnalise } from '@/lib/analysis/engine'
import type { BlockConfig, BlockType } from '@/lib/analysis/templates'
import { getTemplate } from '@/lib/analysis/templates'
import { OnepageHeader } from './OnepageHeader'
import { OnepageGrid } from './OnepageGrid'
import { BlockPicker } from './BlockPicker'

interface OnepageCanvasProps {
  initialConfig: AnalysisConfig
}

export function OnepageCanvas({ initialConfig }: OnepageCanvasProps) {
  const [config, setConfig] = useState<AnalysisConfig>(initialConfig)
  const [blocks, setBlocks] = useState<BlockConfig[]>([])
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runAnalysis = useCallback(async (cfg: AnalysisConfig) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/onepage/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      if (!res.ok) throw new Error(await res.text())
      const data: AnalysisResult = await res.json()
      setResult(data)
      // If blocks are empty or otica changed, load template
      setBlocks(prev => {
        if (prev.length === 0) return getTemplate(data.otica)
        return prev
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar análise')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    runAnalysis(config)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleConfigChange(newConfig: AnalysisConfig) {
    setConfig(newConfig)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runAnalysis(newConfig), 400)
  }

  function handleReorder(fromIdx: number, toIdx: number) {
    setBlocks(prev => {
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }

  function handleRemove(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  function handleEditBlock(newConfig: BlockConfig) {
    setBlocks(prev => prev.map(b => b.id === newConfig.id ? newConfig : b))
  }

  function handleAddBlock(type: BlockType) {
    const id = `block_${Date.now()}`
    const newBlock: BlockConfig = { id, type, colSpan: 1 }
    setBlocks(prev => [...prev, newBlock])
  }

  function handleResetTemplate() {
    if (!result) return
    setBlocks(getTemplate(result.otica))
  }

  async function handleSave(nome: string) {
    setIsSaving(true)
    try {
      await fetch('/api/onepage/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { ...config, nome }, blocks, nome }),
      })
    } catch (e) {
      console.error('Erro ao salvar:', e)
    } finally {
      setIsSaving(false)
    }
  }

  const otica: OticaAnalise | undefined = result?.otica

  return (
    <div className="flex flex-col" style={{ backgroundColor: '#F7F6F2', minHeight: '100%' }}>
      <OnepageHeader
        config={config}
        otica={otica}
        isEditing={isEditing}
        isSaving={isSaving}
        onConfigChange={handleConfigChange}
        onToggleEdit={() => setIsEditing(v => !v)}
        onSave={handleSave}
        onAddBlock={() => setShowPicker(true)}
        onResetTemplate={handleResetTemplate}
      />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: BRAND.gold }}
            />
            <p className="text-sm" style={{ color: BRAND.muted }}>Carregando análise...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Canvas */}
      {result && !isLoading && (
        <>
          {/* Period + Label header */}
          <div className="flex items-baseline gap-3 mb-4 px-1">
            <h2
              className="text-3xl font-bold italic"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: BRAND.ink }}
            >
              {result.label}
            </h2>
            <span
              className="text-sm"
              style={{ fontFamily: "'IBM Plex Mono', monospace", color: BRAND.muted }}
            >
              {result.periodo_label}
            </span>
          </div>

          {blocks.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl"
              style={{ borderColor: BRAND.border }}
            >
              <p className="text-sm mb-3" style={{ color: BRAND.muted }}>Canvas vazio</p>
              {isEditing ? (
                <button
                  onClick={() => setShowPicker(true)}
                  className="text-sm px-4 py-2 bg-[#B8924A] text-white rounded-lg font-medium hover:bg-[#6B4E18]"
                >
                  + Adicionar bloco
                </button>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-sm px-4 py-2 border border-[#E4DFD5] rounded-lg hover:bg-gray-50"
                  style={{ color: BRAND.muted }}
                >
                  Entrar em modo edição
                </button>
              )}
            </div>
          ) : (
            <OnepageGrid
              blocks={blocks}
              data={result}
              isEditing={isEditing}
              onReorder={handleReorder}
              onRemove={handleRemove}
              onEditBlock={handleEditBlock}
            />
          )}
        </>
      )}

      {showPicker && (
        <BlockPicker
          onSelect={handleAddBlock}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
