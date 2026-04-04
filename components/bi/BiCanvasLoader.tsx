'use client'
import { useEffect } from 'react'
import { useBiStore } from '@/lib/bi/store'
import { BiCanvas } from '@/components/bi/BiCanvas'
import type { BiDashboard } from '@/lib/bi/widget-types'

export function BiCanvasLoader({ initialDashboard }: { initialDashboard: BiDashboard }) {
  const setDashboard = useBiStore(s => s.setDashboard)

  useEffect(() => {
    setDashboard(initialDashboard)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <BiCanvas />
}
