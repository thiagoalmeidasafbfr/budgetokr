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
  // YTD up to the previous closed month — same convention used by all other pages.
  // e.g. today = 2026-04-04 → Jan, Feb, Mar 2026
  const prevM = now.getMonth() === 0 ? 12 : now.getMonth()   // 1-indexed prev month
  const prevY = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const ytdMonths: string[] = []
  for (let m = 1; m <= prevM; m++) ytdMonths.push(`${prevY}-${String(m).padStart(2, '0')}`)
  const defaultPeriodo = ytdMonths.length === 1
    ? { tipo: 'mes' as const, mes: 1, ano: prevY }
    : { tipo: 'lista' as const, periodos: ytdMonths }

  const initialDashboard = data ?? {
    id:             '',
    user_id:        user.userId,
    nome:           'Meu Dashboard',
    periodo_global: defaultPeriodo,
    widgets:        [],
    atualizado_em:  now.toISOString(),
  }

  return <BiCanvasLoader initialDashboard={initialDashboard} />
}
