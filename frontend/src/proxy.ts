import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect /app and /history — redirect to login if not authenticated
  if (!user && (request.nextUrl.pathname.startsWith('/app') || request.nextUrl.pathname.startsWith('/history'))) {
    return NextResponse.redirect(new URL('/login?redirect=/app', request.url))
  }

  // Redirect authenticated users away from login page
  if (user && request.nextUrl.pathname === '/login') {
    const redirect = request.nextUrl.searchParams.get('redirect') || '/app'
    return NextResponse.redirect(new URL(redirect, request.url))
  }

  // Redirect authenticated users from landing to app (not from /try demo)
  if (user && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/app', request.url))
  }

  return response
}

export const config = {
  matcher: ['/', '/try', '/try/:path*', '/login', '/app', '/app/:path*', '/history', '/history/:path*', '/scroll', '/scroll/:path*', '/docs', '/docs/:path*', '/blog', '/blog/:path*', '/auth/callback'],
}
