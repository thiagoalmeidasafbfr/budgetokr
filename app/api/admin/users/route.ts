import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

function masterOnly(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  return null
}

// GET /api/admin/users — list all users
export async function GET(req: NextRequest) {
  const deny = masterOnly(req)
  if (deny) return deny
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, role, department, created_at')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return NextResponse.json({ users: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST /api/admin/users — create user
export async function POST(req: NextRequest) {
  const deny = masterOnly(req)
  if (deny) return deny
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { username, password, role, department } = body as {
      username: string; password: string; role: 'master' | 'dept'; department?: string
    }
    if (!username || !password || !role) {
      return NextResponse.json({ error: 'username, password e role são obrigatórios' }, { status: 400 })
    }
    const { error } = await supabase.from('app_users').insert({
      username: username.trim(),
      password,
      role,
      department: role === 'dept' ? (department ?? null) : null,
    })
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Usuário já existe' }, { status: 409 })
      throw new Error(error.message)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PUT /api/admin/users — update user (password and/or department)
export async function PUT(req: NextRequest) {
  const deny = masterOnly(req)
  if (deny) return deny
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { id, password, department, role } = body as {
      id: number; password?: string; department?: string; role?: 'master' | 'dept'
    }
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
    const update: Record<string, unknown> = {}
    if (password !== undefined && password !== '') update.password = password
    if (department !== undefined) update.department = department || null
    if (role !== undefined) update.role = role
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })
    const { error } = await supabase.from('app_users').update(update).eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/admin/users?id=X — delete user
export async function DELETE(req: NextRequest) {
  const deny = masterOnly(req)
  if (deny) return deny
  try {
    const supabase = getSupabase()
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
    const { error } = await supabase.from('app_users').delete().eq('id', Number(id))
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
