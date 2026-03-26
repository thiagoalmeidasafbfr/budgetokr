import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getUserFromHeaders } from '@/lib/session'

export const dynamic = 'force-dynamic'

function masterOnly(req: NextRequest) {
  const user = getUserFromHeaders(req)
  if (user?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  return null
}

// Salva departamentos na tabela N:N e atualiza coluna legada department
async function saveDepartamentos(supabase: ReturnType<typeof getSupabase>, username: string, departments: string[]) {
  // Remove entradas anteriores
  await supabase.from('user_departamentos').delete().eq('username', username)
  // Insere novas
  if (departments.length > 0) {
    await supabase.from('user_departamentos').insert(
      departments.map(d => ({ username, departamento: d }))
    )
  }
  // Atualiza coluna legada com o primeiro departamento
  await supabase.from('app_users').update({
    department: departments[0] ?? null,
  }).eq('username', username)
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

    const users = data ?? []

    // Busca departamentos da tabela N:N para todos os usuários de uma vez
    const { data: deptData } = await supabase
      .from('user_departamentos')
      .select('username, departamento')
      .in('username', users.map(u => u.username))

    const deptMap: Record<string, string[]> = {}
    for (const row of deptData ?? []) {
      if (!deptMap[row.username]) deptMap[row.username] = []
      deptMap[row.username].push(row.departamento)
    }

    const result = users.map(u => ({
      ...u,
      departments: deptMap[u.username]?.length
        ? deptMap[u.username]
        : (u.department ? [u.department] : []),
    }))

    return NextResponse.json({ users: result })
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
    const { username, password, role, departments } = body as {
      username: string; password: string; role: 'master' | 'dept'; departments?: string[]
    }
    if (!username || !password || !role) {
      return NextResponse.json({ error: 'username, password e role são obrigatórios' }, { status: 400 })
    }
    const depts = role === 'dept' ? (departments ?? []) : []
    const { error } = await supabase.from('app_users').insert({
      username: username.trim(),
      password,
      role,
      department: depts[0] ?? null,
    })
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Usuário já existe' }, { status: 409 })
      throw new Error(error.message)
    }
    // Salva tabela N:N
    if (depts.length > 0) {
      await supabase.from('user_departamentos').insert(
        depts.map(d => ({ username: username.trim(), departamento: d }))
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PUT /api/admin/users — update user
export async function PUT(req: NextRequest) {
  const deny = masterOnly(req)
  if (deny) return deny
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { id, password, departments, role } = body as {
      id: number; password?: string; departments?: string[]; role?: 'master' | 'dept'
    }
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

    // Busca username pelo id
    const { data: userData } = await supabase
      .from('app_users')
      .select('username, role')
      .eq('id', id)
      .single()
    if (!userData) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const update: Record<string, unknown> = {}
    if (password !== undefined && password !== '') update.password = password
    if (role !== undefined) update.role = role

    const effectiveRole = role ?? userData.role
    if (departments !== undefined) {
      const depts = effectiveRole === 'dept' ? departments : []
      update.department = depts[0] ?? null
      // Atualiza tabela N:N
      await saveDepartamentos(supabase, userData.username, depts)
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from('app_users').update(update).eq('id', id)
      if (error) throw new Error(error.message)
    }

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
