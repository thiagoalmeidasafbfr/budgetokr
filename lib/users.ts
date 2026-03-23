import { getSupabase } from './supabase'
import type { SessionUser } from './session'

export async function validateUser(userId: string, password: string): Promise<SessionUser | null> {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('app_users')
      .select('username, password, role, department')
      .eq('username', userId.trim())
      .single()
    if (!data || data.password !== password) return null
    return {
      userId: data.username,
      role: data.role,
      department: data.department ?? undefined,
    }
  } catch (e) {
    console.error('[validateUser] erro:', e)
    return null
  }
}
