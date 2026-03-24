import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, COOKIE_NAME } from '@/lib/session'

// Rotas que não precisam de autenticação
const PUBLIC_PATHS = ['/login', '/logout', '/api/auth/login', '/api/auth/logout']

// Rotas que usuários de dept podem acessar
const DEPT_ALLOWED_PATHS = ['/dept', '/dre', '/analise', '/capex', '/unidades-negocio', '/api/dept-dashboard', '/api/dept-medidas', '/api/analise', '/api/dre', '/api/capex', '/api/kpis', '/api/kpis/valores', '/api/lancamentos', '/api/medidas', '/api/me', '/api/auth/logout', '/api/dimensoes', '/api/favorites', '/api/unidades-negocio']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Arquivos estáticos e _next passam direto
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Rotas públicas passam direto
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Verifica sessão
  const user = await getSessionFromRequest(request)

  // Sem sessão → redirect para login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Usuário de departamento: restrições de acesso
  if (user.role === 'dept') {
    // APIs onde dept pode escrever (comentários e favoritos)
    const DEPT_WRITE_ALLOWED = ['/api/dre/comments', '/api/favorites']
    // Bloqueia métodos de escrita para dept users (todas as APIs exceto as permitidas)
    if (
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) &&
      pathname.startsWith('/api/') &&
      !DEPT_WRITE_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'))
    ) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // Bloqueia acesso a páginas/APIs não permitidas para dept
    const isAllowed = DEPT_ALLOWED_PATHS.some(
      p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?')
    )

    if (!isAllowed) {
      // Redireciona para a página de departamento
      const deptUrl = new URL('/dept', request.url)
      return NextResponse.redirect(deptUrl)
    }
  }

  // Injeta info do usuário nos headers (para as API routes lerem)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-role', user.role)
  requestHeaders.set('x-user-id', user.userId)
  requestHeaders.set('x-user-dept', user.department || '')

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    /*
     * Match todas as rotas exceto:
     * - _next/static (arquivos estáticos)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
