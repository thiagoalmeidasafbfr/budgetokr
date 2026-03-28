import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** POST /api/admin/migrate-passwords — hasheia todas as senhas ainda em texto puro */
export async function POST(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const supabase = getSupabase()
  const { data: users, error } = await supabase
    .from('app_users')
    .select('id, username, password')

  if (error) {
    return NextResponse.json({ error: 'Erro ao buscar usuários' }, { status: 500 })
  }

  let migrated = 0
  let alreadyHashed = 0

  for (const u of users ?? []) {
    const isBcrypt = /^\$2[aby]?\$\d{2}\$.{53}$/.test(u.password)
    if (isBcrypt) {
      alreadyHashed++
      continue
    }
    const hashed = await bcrypt.hash(u.password, 12)
    await supabase.from('app_users').update({ password: hashed }).eq('id', u.id)
    migrated++
  }

  return NextResponse.json({
    ok: true,
    migrated,
    alreadyHashed,
    total: (users ?? []).length,
  })
}
