import bcrypt from 'bcryptjs'
import { getSupabase } from './supabase'
import type { SessionUser } from './session'

/** Verifica se uma string já é um hash bcrypt */
function isBcryptHash(str: string): boolean {
  return /^\$2[aby]?\$\d{2}\$.{53}$/.test(str)
}

export async function validateUser(userId: string, password: string): Promise<SessionUser | null> {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('app_users')
      .select('username, password, role, department')
      .eq('username', userId.trim())
      .single()
    if (!data) return null

    // Suporta hash bcrypt e texto puro (migração)
    let passwordValid: boolean
    if (isBcryptHash(data.password)) {
      passwordValid = await bcrypt.compare(password, data.password)
    } else {
      // Fallback: comparação direta para senhas ainda não migradas
      passwordValid = data.password === password
      // Auto-migra: hasheia a senha na primeira autenticação bem-sucedida
      if (passwordValid) {
        const hashed = await bcrypt.hash(password, 12)
        await supabase
          .from('app_users')
          .update({ password: hashed })
          .eq('username', data.username)
      }
    }

    if (!passwordValid) return null

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

/** Hasheia uma senha para armazenamento */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}
