import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { Elysia } from 'elysia'
import { prisma } from './lib/db'
import { env } from './lib/env'

export function createApp() {
  return new Elysia()
    .use(cors())
    .use(html())

    // ─── Global Error Handler ────────────────────────
    .onError(({ code, error }) => {
      if (code === 'NOT_FOUND') {
        return new Response(JSON.stringify({ error: 'Not Found', status: 404 }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      console.error('[Server Error]', error)
      return new Response(JSON.stringify({ error: 'Internal Server Error', status: 500 }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    // API routes
    .get('/health', () => ({ status: 'ok' }))

    // ─── Auth API ──────────────────────────────────────
    .post('/api/auth/login', async ({ request, set }) => {
      const { email, password } = (await request.json()) as { email: string; password: string }
      let user = await prisma.user.findUnique({ where: { email } })
      if (!user || !(await Bun.password.verify(password, user.password))) {
        set.status = 401
        return { error: 'Email atau password salah' }
      }
      if (user.blocked) {
        set.status = 403
        return { error: 'Akun Anda telah diblokir. Hubungi administrator.' }
      }
      // Auto-promote super admin from env
      if (env.SUPER_ADMIN_EMAILS.includes(user.email) && user.role !== 'SUPER_ADMIN') {
        user = await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } })
      }
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      await prisma.session.create({ data: { token, userId: user.id, expiresAt } })
      set.headers['set-cookie'] = `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
      return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
    })

    .post('/api/auth/logout', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = cookie.match(/session=([^;]+)/)?.[1]
      if (token) await prisma.session.deleteMany({ where: { token } })
      set.headers['set-cookie'] = 'session=; Path=/; HttpOnly; Max-Age=0'
      return { ok: true }
    })

    .get('/api/auth/session', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = cookie.match(/session=([^;]+)/)?.[1]
      if (!token) { set.status = 401; return { user: null } }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, name: true, email: true, role: true, blocked: true } } },
      })
      if (!session || session.expiresAt < new Date()) {
        if (session) await prisma.session.delete({ where: { id: session.id } })
        set.status = 401
        return { user: null }
      }
      return { user: session.user }
    })

    // ─── Google OAuth ──────────────────────────────────
    .get('/api/auth/google', ({ request, set }) => {
      const origin = new URL(request.url).origin
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: `${origin}/api/auth/callback/google`,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
      })
      set.status = 302; set.headers['location'] =`https://accounts.google.com/o/oauth2/v2/auth?${params}`
    })

    .get('/api/auth/callback/google', async ({ request, set }) => {
      const url = new URL(request.url)
      const code = url.searchParams.get('code')
      const origin = url.origin

      if (!code) {
        set.status = 302; set.headers['location'] ='/login?error=google_failed'
        return
      }

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${origin}/api/auth/callback/google`,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenRes.ok) {
        set.status = 302; set.headers['location'] ='/login?error=google_failed'
        return
      }

      const tokens = (await tokenRes.json()) as { access_token: string }

      // Get user info
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })

      if (!userInfoRes.ok) {
        set.status = 302; set.headers['location'] ='/login?error=google_failed'
        return
      }

      const googleUser = (await userInfoRes.json()) as { email: string; name: string }

      // Upsert user (no password for Google users)
      const isSuperAdmin = env.SUPER_ADMIN_EMAILS.includes(googleUser.email)
      const user = await prisma.user.upsert({
        where: { email: googleUser.email },
        update: { name: googleUser.name, ...(isSuperAdmin ? { role: 'SUPER_ADMIN' } : {}) },
        create: { email: googleUser.email, name: googleUser.name, password: '', role: isSuperAdmin ? 'SUPER_ADMIN' : 'USER' },
      })

      // Create session
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await prisma.session.create({ data: { token, userId: user.id, expiresAt } })

      set.headers['set-cookie'] = `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
      const defaultRoute = user.role === 'SUPER_ADMIN' ? '/dev' : user.role === 'ADMIN' ? '/dashboard' : '/profile'
      set.status = 302; set.headers['location'] = defaultRoute
    })

    // ─── Admin API (SUPER_ADMIN only) ───────────────────
    .get('/api/admin/users', async ({ request, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = cookie.match(/session=([^;]+)/)?.[1]
      if (!token) { set.status = 401; return { error: 'Unauthorized' } }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403; return { error: 'Forbidden' }
      }
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      return { users }
    })

    .put('/api/admin/users/:id/role', async ({ request, params, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = cookie.match(/session=([^;]+)/)?.[1]
      if (!token) { set.status = 401; return { error: 'Unauthorized' } }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403; return { error: 'Forbidden' }
      }
      if (session.user.id === params.id) {
        set.status = 400; return { error: 'Tidak bisa mengubah role sendiri' }
      }
      const { role } = (await request.json()) as { role: string }
      if (!['USER', 'ADMIN'].includes(role)) {
        set.status = 400; return { error: 'Role tidak valid (USER atau ADMIN)' }
      }
      const user = await prisma.user.update({
        where: { id: params.id },
        data: { role: role as 'USER' | 'ADMIN' },
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
      })
      return { user }
    })

    .put('/api/admin/users/:id/block', async ({ request, params, set }) => {
      const cookie = request.headers.get('cookie') ?? ''
      const token = cookie.match(/session=([^;]+)/)?.[1]
      if (!token) { set.status = 401; return { error: 'Unauthorized' } }
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { select: { id: true, role: true } } },
      })
      if (!session || session.expiresAt < new Date() || session.user.role !== 'SUPER_ADMIN') {
        set.status = 403; return { error: 'Forbidden' }
      }
      if (session.user.id === params.id) {
        set.status = 400; return { error: 'Tidak bisa memblokir diri sendiri' }
      }
      const { blocked } = (await request.json()) as { blocked: boolean }
      const user = await prisma.user.update({
        where: { id: params.id },
        data: { blocked },
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
      })
      // Delete all sessions if blocked
      if (blocked) {
        await prisma.session.deleteMany({ where: { userId: params.id } })
      }
      return { user }
    })

    // ─── Example API ───────────────────────────────────
    .get('/api/hello', () => ({
      message: 'Hello, world!',
      method: 'GET',
    }))
    .put('/api/hello', () => ({
      message: 'Hello, world!',
      method: 'PUT',
    }))
    .get('/api/hello/:name', ({ params }) => ({
      message: `Hello, ${params.name}!`,
    }))
}
