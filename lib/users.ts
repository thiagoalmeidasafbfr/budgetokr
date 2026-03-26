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

    // Busca departamentos da tabela N:N
    const { data: deptData } = await supabase
      .from('user_departamentos')
      .select('departamento')
      .eq('username', data.username)

    const multiDepts = (deptData ?? []).map((d: { departamento: string }) => d.departamento)

    // Se tiver departamentos na tabela N:N, usa eles; senão cai no legado (coluna department)
    const departments = multiDepts.length > 0
      ? multiDepts
      : (data.department ? [data.department] : [])

    return {
      userId: data.username,
      role: data.role,
      department: departments[0] ?? undefined,
      departments: departments.length > 0 ? departments : undefined,
    }
  } catch (e) {
    console.error('[validateUser] erro:', e)
    return null
  }
}
