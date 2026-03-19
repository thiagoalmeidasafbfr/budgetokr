/**
 * Carrega usuários do arquivo users.json (Node.js only — não usar no middleware).
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
  const filePath = path.join(process.cwd(), 'users.json')
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    cachedUsers = JSON.parse(raw)
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
