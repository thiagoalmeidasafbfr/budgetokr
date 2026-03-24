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
    // Garantia defensiva: qualquer valor que não seja exatamente 'master' é tratado como 'dept'
    const role: 'master' | 'dept' = data.role === 'master' ? 'master' : 'dept'
    return {
      userId: data.username,
      role,
      department: data.department ?? undefined,
    }
  } catch (e) {
    console.error('[validateUser] erro:', e)
    return null
  }
}
