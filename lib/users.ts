/**
 * Carrega usuários do arquivo users.json ou da variável de ambiente USERS_JSON.
 * Prioridade: 1) USERS_JSON env var  2) users.json arquivo  3) master padrão
 * (Node.js only — não usar no middleware.)
 */
import fs from 'fs'
import path from 'path'
import type { SessionUser } from './session'

type UserRecord = {
  password: string
  role: 'master' | 'dept'
  department?: string
}

let cachedUsers: Record<string, UserRecord> | null = null

export function getUsers(): Record<string, UserRecord> {
  if (cachedUsers) return cachedUsers

  // 1) Tenta carregar da variável de ambiente USERS_JSON
  if (process.env.USERS_JSON) {
    try {
      cachedUsers = JSON.parse(process.env.USERS_JSON)
      console.log('[auth] Usuários carregados da variável de ambiente USERS_JSON')
      return cachedUsers!
    } catch {
      console.error('[auth] USERS_JSON inválido, tentando users.json...')
    }
  }

  // 2) Tenta carregar do arquivo users.json
  const filePath = path.join(process.cwd(), 'users.json')
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    cachedUsers = JSON.parse(raw)
    console.log('[auth] Usuários carregados do arquivo users.json')
    return cachedUsers!
  } catch {
    console.warn('[auth] users.json não encontrado, usando apenas master padrão')
    cachedUsers = {
      master: { password: 'admin123', role: 'master' },
    }
    return cachedUsers
  }
}

export function validateUser(userId: string, password: string): SessionUser | null {
  const users = getUsers()
  const user = users[userId]
  if (!user || user.password !== password) return null
  return {
    userId,
    role: user.role,
    department: user.department,
  }
}
