import { OnepageCanvas } from '@/components/onepage/OnepageCanvas'
import type { AnalysisConfig } from '@/lib/analysis/engine'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

interface PageProps {
  searchParams: Promise<{
    dimensao_tipo?: string
    dimensao_id?: string
    periodo_mes?: string
    periodo_ano?: string
    analysis_id?: string
  }>
}

export const dynamic = 'force-dynamic'

export default async function OnepagePage({ searchParams }: PageProps) {
  const user = await getSession()
  if (!user) redirect('/login')

  const sp = await searchParams
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  let initialConfig: AnalysisConfig

  // Load saved analysis by ID
  if (sp.analysis_id) {
    try {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('onepage_analyses')
        .select('config')
        .eq('id', sp.analysis_id)
        .eq('user_id', user.userId)
        .single()
      if (data?.config) {
        initialConfig = data.config as AnalysisConfig
      } else {
        initialConfig = defaultConfig(sp, currentYear, currentMonth)
      }
    } catch {
      initialConfig = defaultConfig(sp, currentYear, currentMonth)
    }
  } else {
    initialConfig = defaultConfig(sp, currentYear, currentMonth)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <OnepageCanvas initialConfig={initialConfig} />
    </div>
  )
}

function defaultConfig(
  sp: { dimensao_tipo?: string; dimensao_id?: string; periodo_mes?: string; periodo_ano?: string },
  currentYear: number,
  currentMonth: number
): AnalysisConfig {
  const mes = sp.periodo_mes ? parseInt(sp.periodo_mes, 10) : currentMonth
  const ano = sp.periodo_ano ? parseInt(sp.periodo_ano, 10) : currentYear

  let dimensao: AnalysisConfig['dimensao'] = { tipo: 'consolidado' }
  if (sp.dimensao_tipo === 'centro_custo' && sp.dimensao_id) {
    dimensao = { tipo: 'centro_custo', id: sp.dimensao_id }
  } else if (sp.dimensao_tipo === 'unidade_negocio' && sp.dimensao_id) {
    dimensao = { tipo: 'unidade_negocio', id: sp.dimensao_id }
  } else if (sp.dimensao_tipo === 'grupo_contas' && sp.dimensao_id) {
    dimensao = { tipo: 'grupo_contas', grupo: sp.dimensao_id }
  }

  return {
    dimensao,
    periodo: { tipo: 'mes', mes, ano },
    comparativo: 'budget',
  }
}
