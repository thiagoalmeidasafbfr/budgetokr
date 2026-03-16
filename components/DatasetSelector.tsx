'use client'
import { useState, useEffect } from 'react'
import { Database, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Dataset } from '@/lib/types'

interface DatasetSelectorProps {
  onSelect?: (dataset: Dataset | null) => void
}

export function DatasetSelector({ onSelect }: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/datasets')
      .then(r => r.json())
      .then(data => {
        setDatasets(data.datasets ?? [])
        setActiveId(data.activeId ?? null)
      })
  }, [])

  const active = datasets.find(d => d.id === activeId)

  const select = async (d: Dataset) => {
    await fetch('/api/datasets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId: d.id }),
    })
    setActiveId(d.id)
    setOpen(false)
    onSelect?.(d)
    window.location.reload()
  }

  if (!datasets.length) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Database size={14} className="text-indigo-500" />
        <span className="text-gray-700 font-medium max-w-40 truncate">
          {active?.name ?? 'Selecionar dataset'}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-gray-100 rounded-xl shadow-lg py-1">
            {datasets.map(d => (
              <button
                key={d.id}
                onClick={() => select(d)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <Check size={14} className={cn('text-indigo-600', d.id !== activeId && 'opacity-0')} />
                <div>
                  <p className="font-medium text-gray-900">{d.name}</p>
                  <p className="text-xs text-gray-400">{d.row_count.toLocaleString()} linhas</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
