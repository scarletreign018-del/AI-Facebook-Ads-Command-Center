import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Redis/Upstash-based rate limiter for production
// Falls back to in-memory for local development
interface RateLimitEntry {
  count: number
  resetAt: number
}

let redisClient: { get: (key: string) => Promise<string | null>; set: (key: string, value: string, opts?: { ex: number }) => Promise<void> } | null = null

async function getRedisClient() {
  if (redisClient) return redisClient
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (upstashUrl && upstashToken) {
    redisClient = {
      async get(key: string) {
        const res = await fetch(`${upstashUrl}/get/${encodeURIComponent(key)}`, {
          headers: { Authorization: `Bearer ${upstashToken}` }
        })
        const data = await res.json()
        return data.result as string | null
      },
      async set(key: string, value: string, opts?: { ex: number }) {
        const url = opts?.ex
          ? `${upstashUrl}/set/${encodeURIComponent(key)}?EX=${opts.ex}`
          : `${upstashUrl}/set/${encodeURIComponent(key)}`
        await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${upstashToken}` },
          body: value
        })
      }
    }
  }
  return redisClient
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100 // per minute per IP

// In-memory fallback for local development
const rateLimitMap = new Map<string, RateLimitEntry>()

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip)
    }
  }
}, RATE_LIMIT_WINDOW_MS)

async function getRateLimitStatus(ip: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = await getRedisClient()
  const now = Date.now()
  const key = `rate_limit:${ip}`

  if (redis) {
    const cached = await redis.get(key)
    if (cached) {
      const entry: RateLimitEntry = JSON.parse(cached)
      if (now > entry.resetAt) {
        const newEntry: RateLimitEntry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
        await redis.set(key, JSON.stringify(newEntry), { ex: 60 })
        return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: newEntry.resetAt }
      }
      if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt }
      }
      entry.count++
      await redis.set(key, JSON.stringify(entry), { ex: 60 })
      return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt }
    }
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
    await redis.set(key, JSON.stringify(newEntry), { ex: 60 })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: newEntry.resetAt }
  }

  // Fallback to in-memory
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }
  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt }
}

// Audit log helper
async function logAudit(
  supabase: ReturnType<typeof createServerClient>,
  event: string,
  userId: string | null,
  ip: string,
  path: string,
  details?: Record<string, unknown>
) {
  try {
    await supabase.from('audit_logs').insert({
      event,
      user_id: userId,
      ip_address: ip,
      path,
      details: details || {},
    })
  } catch {
    // Silently fail audit logging to not block requests
  }
}

export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

  // Rate limiting
  const rateLimit = await getRateLimitStatus(ip)
  if (!rateLimit.allowed) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
        'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
      },
    })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id || null

  // protect routes that require authentication
  const protectedPaths = [
    '/dashboard', '/workspaces', '/settings', '/profile',
    '/ad-accounts', '/campaigns', '/analytics', '/insights',
    '/health', '/recommendations', '/forecasts', '/alerts',
    '/reports', '/assistant', '/notifications',
  ]
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !session) {
    await logAudit(supabase, 'auth_redirect_unauthenticated', userId, ip, request.nextUrl.pathname)
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // redirect logged in users away from auth pages
  const authPaths = ['/login', '/register', '/forgot-password', '/reset-password']
  const isAuthPath = authPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isAuthPath && session) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Add rate limit headers to response
  supabaseResponse.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS))
  supabaseResponse.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining))
  supabaseResponse.headers.set('X-RateLimit-Reset', String(Math.ceil(rateLimit.resetAt / 1000)))

  // Log sensitive operations
  if (request.nextUrl.pathname.startsWith('/api/') && request.method !== 'GET') {
    await logAudit(supabase, `api_${request.method.toLowerCase()}`, userId, ip, request.nextUrl.pathname)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
