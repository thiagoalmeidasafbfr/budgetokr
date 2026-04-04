import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getSupabase } from '@/lib/supabase'
import { BiCanvasLoader } from '@/components/bi/BiCanvasLoader'

export const dynamic = 'force-dynamic'

export default async function BiPage() {
  const user = await getSession()
  if (!user) redirect('/login')

  // Fetch or initialise dashboard for this user
  const supabase = getSupabase()
  const { data } = await supabase
    .from('bi_dashboards')
    .select('*')
    .eq('user_id', user.userId)
    .single()

  const now = new Date()
  const initialDashboard = data ?? {
    id:             '',
    user_id:        user.userId,
    nome:           'Meu Dashboard',
    periodo_global: { tipo: 'mes', mes: now.getMonth() + 1, ano: now.getFullYear() },
    widgets:        [],
    atualizado_em:  now.toISOString(),
  }

  return <BiCanvasLoader initialDashboard={initialDashboard} />
}
