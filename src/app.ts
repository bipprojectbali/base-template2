import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Elysia } from 'elysia'
import { createMcpServer, type McpScope } from '../scripts/mcp/server'
import { appLog, clearAppLogs, getAppLogs } from './lib/applog'
import { auth } from './lib/auth'
import { type AuthUser, betterAuthPlugin } from './lib/auth-middleware'
import { prisma } from './lib/db'
import { env } from './lib/env'
import { redis } from './lib/redis'
import { addConnection, broadcastToAdmins, getOnlineUserIds, removeConnection } from './lib/presence'
import { parseSchema } from './lib/schema-parser'
import pkg from '../package.json'

function getIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
}

function audit(userId: string | null, action: string, detail: string | null, ip: string) {
  prisma.auditLog.create({ data: { userId, action, detail, ip } }).catch(() => {})
}

// Auth guard helpers — return Response if unauthorized, null if OK
function guardSuperAdmin(authUser: AuthUser | null): Response | null {
  if (!authUser) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  if (authUser!.blocked || authUser!.role !== 'SUPER_ADMIN') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  return null
}

function guardQcOrAdmin(authUser: AuthUser | null): Response | null {
  if (!authUser) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  if (authUser!.blocked || !['QC', 'ADMIN', 'SUPER_ADMIN'].includes(authUser!.role)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  return null
}

function guardAuth(authUser: AuthUser | null): Response | null {
  if (!authUser) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  if (authUser!.blocked) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  return null
}

function getAllowedStatusTransitions(current: string, role: 'QC' | 'ADMIN' | 'SUPER_ADMIN'): string[] {
  const isQc = role === 'QC' || role === 'SUPER_ADMIN'
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const matrix: Record<string, { qc: string[]; admin: string[] }> = {
    OPEN: { qc: ['CLOSED'], admin: ['IN_PROGRESS'] },
    IN_PROGRESS: { qc: ['CLOSED'], admin: ['READY_FOR_QC'] },
    READY_FOR_QC: { qc: ['CLOSED', 'REOPENED'], admin: [] },
    REOPENED: { qc: ['CLOSED'], admin: ['IN_PROGRESS'] },
    CLOSED: { qc: ['REOPENED'], admin: [] } }
  const entry = matrix[current]
  if (!entry) return []
  const out = new Set<string>()
  if (isQc) for (const s of entry.qc) out.add(s)
  if (isAdmin) for (const s of entry.admin) out.add(s)
  return [...out]
}

export function createApp() {
  appLog('info', 'Server starting')

  return (
    new Elysia()
      .use(cors({
        origin: env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`,
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }))
      .use(html())

      // ─── Better Auth plugin (handles /api/auth/* routes) ──
      .use(betterAuthPlugin)

      // ─── Global Error Handler ────────────────────────
      .onError(({ code, error, request }) => {
        if (code === 'NOT_FOUND') {
          return new Response(JSON.stringify({ error: 'Not Found', status: 404 }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' } })
        }
        const url = new URL(request.url)
        const message = error instanceof Error ? error.message : String(error)
        appLog('error', `${request.method} ${url.pathname} — ${message}`)
        console.error('[Server Error]', error)
        return new Response(JSON.stringify({ error: 'Internal Server Error', status: 500 }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' } })
      })

      // ─── Request timing + logging ─────────────────────
      .onRequest(({ request }) => {
        ;(request as any).__startTime = performance.now()
      })
      .onAfterResponse(({ request, set }) => {
        const url = new URL(request.url)
        if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) {
          const status = typeof set.status === 'number' ? set.status : 200
          const level = status >= 500 ? ('error' as const) : status >= 400 ? ('warn' as const) : ('info' as const)
          appLog(level, `${request.method} ${url.pathname} ${status}`)
          const duration = Math.round(performance.now() - ((request as any).__startTime || 0))
          broadcastToAdmins({
            type: 'request',
            method: request.method,
            path: url.pathname,
            status,
            duration,
            timestamp: new Date().toISOString() })
        }
      })

      // API routes
      .get('/health', () => ({ status: 'ok' }))

      // ─── Dev Auth (development only) ─────────────────────
      .get('/api/dev-auth/login-as/:email', async ({ request, params, set, query }) => {
        if (env.NODE_ENV !== 'development') {
          set.status = 404
          return { error: 'Not found' }
        }
        const user = await prisma.user.findUnique({ where: { email: params.email } })
        if (!user) {
          set.status = 404
          return { error: `User not found: ${params.email}` }
        }

        // Create session directly in DB (dev-only), using Better Auth cookie format
        const token = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        const sessionRecord = await prisma.session.create({
          data: { token, userId: user.id, expiresAt, ipAddress: getIp(request) } })

        // Also cache in Redis (Better Auth secondary storage key format)
        const sessionPayload = JSON.stringify({ ...sessionRecord, user })
        await redis.set(`session:${token}`, sessionPayload, 'EX', 7 * 24 * 60 * 60)

        appLog('info', `Dev-auth login: ${user.email} (${user.role})`, getIp(request))

        const cookieHeader = `better-auth.session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`

        const redirect = (query as Record<string, string>).redirect
        if (redirect) {
          set.status = 302
          set.headers.location = redirect
          set.headers['set-cookie'] = cookieHeader
          return
        }
        set.headers['set-cookie'] = cookieHeader
        return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
      })

      // ─── Admin API (SUPER_ADMIN only) ───────────────────
      .get('/api/admin/users', async ({ authUser, set }) => {
        const guard = guardSuperAdmin(authUser); if (guard) return guard
        const users = await prisma.user.findMany({
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
          orderBy: { createdAt: 'asc' } })
        return { users }
      })

      .put('/api/admin/users/:id/role', async ({ request, params, set, authUser }) => {
        const guard = guardSuperAdmin(authUser); if (guard) return guard
        const ip = getIp(request)
        if (authUser!.id === params.id) {
          set.status = 400
          return { error: 'Tidak bisa mengubah role sendiri' }
        }
        const { role } = (await request.json()) as { role: string }
        if (!['USER', 'QC', 'ADMIN'].includes(role)) {
          set.status = 400
          return { error: 'Role tidak valid (USER, QC, atau ADMIN)' }
        }
        const target = await prisma.user.findUnique({ where: { id: params.id }, select: { email: true, role: true } })
        if (target?.role === 'SUPER_ADMIN') {
          set.status = 400
          return { error: 'Tidak bisa mengubah role SUPER_ADMIN' }
        }
        const user = await prisma.user.update({
          where: { id: params.id },
          data: { role: role as 'USER' | 'QC' | 'ADMIN' },
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true } })
        audit(params.id, 'ROLE_CHANGED', `${target?.role} → ${role} by ${authUser!.id}`, ip)
        appLog('info', `Role changed: ${user.email} ${target?.role} → ${role}`)
        return { user }
      })

      .put('/api/admin/users/:id/block', async ({ request, params, set, authUser }) => {
        const guard = guardSuperAdmin(authUser); if (guard) return guard
        const ip = getIp(request)
        if (authUser!.id === params.id) {
          set.status = 400
          return { error: 'Tidak bisa memblokir diri sendiri' }
        }
        const { blocked } = (await request.json()) as { blocked: boolean }
        const user = await prisma.user.update({
          where: { id: params.id },
          data: { blocked },
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true } })

        if (blocked) {
          // Delete all DB sessions
          const sessions = await prisma.session.findMany({
            where: { userId: params.id },
            select: { token: true } })
          await prisma.session.deleteMany({ where: { userId: params.id } })

          // Also delete from Redis secondary storage
          for (const s of sessions) {
            await redis.del(`session:${s.token}`).catch(() => {})
          }
        }

        const action = blocked ? 'BLOCKED' : 'UNBLOCKED'
        audit(params.id, action, `by ${authUser!.id}`, ip)
        appLog('info', `User ${action.toLowerCase()}: ${user.email}`)
        return { user }
      })

      // ─── WebSocket Presence ──────────────────────────────
      .ws('/ws/presence', {
        async open(ws) {
          const session = await auth.api.getSession({
            headers: new Headers({ cookie: ws.data.headers?.cookie ?? '' }) })
          if (!session) {
            ws.close(4001, 'Unauthorized')
            return
          }
          const user = session.user as any
          const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'
          ;(ws.data as unknown as { userId: string }).userId = user.id
          addConnection(ws as any, user.id, isAdmin)
        },
        close(ws) {
          removeConnection(ws as any)
        },
        message() {
          // No client messages expected
        } })

      // ─── Presence REST ──────────────────────────────────
      .get('/api/admin/presence', ({ authUser }) => {
        const guard = guardSuperAdmin(authUser); if (guard) return guard
        return { online: getOnlineUserIds() }
      })

      // ─── Log API (SUPER_ADMIN only) ────────────────────
      .get('/api/admin/logs/app', async ({ request, authUser }) => {
        const guard = guardSuperAdmin(authUser); if (guard) return guard
        const url = new URL(request.url)
        const level = url.searchParams.get('level') as any
        const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
        const afterId = parseInt(url.searchParams.get('afterId') ?? '0', 10)
        return { logs: await getAppLogs({ level: level || undefined, limit, afterId: afterId || undefined }) }
      })

      .get('/api/admin/logs/audit', async ({ request, authUser }) => {
        const guard = guardSuperAdmin(authUser); if (guard) return guard
        const url = new URL(request.url)
        const userId = url.searchParams.get('userId')
        const action = url.searchParams.get('action')
        const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500)

        const where: Record<string, any> = {}
        if (userId) where.userId = userId
        if (action) where.action = action

        const logs = await prisma.auditLog.findMany({
          where,
          include: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit })
        return { logs }
      })

      .delete('/api/admin/logs/app', async ({}) => {
        await clearAppLogs()
        appLog('info', 'App logs cleared manually')
        return { ok: true }
      })

      .delete('/api/admin/logs/audit', async ({}) => {
        const { count } = await prisma.auditLog.deleteMany()
        appLog('info', `Audit logs cleared manually (${count} entries)`)
        return { ok: true, deleted: count }
      })

      // ─── Schema API (SUPER_ADMIN only) ──────────────────
      .get('/api/admin/schema', async ({ set, authUser }) => {
        const guard = guardSuperAdmin(authUser); if (guard) return guard
        const fs = await import('node:fs')
        const schemaPath = `${process.cwd()}/prisma/schema.prisma`
        if (!fs.existsSync(schemaPath)) {
          set.status = 404
          return { error: 'Schema not found' }
        }
        const raw = fs.readFileSync(schemaPath, 'utf-8')
        return { schema: parseSchema(raw) }
      })

      // ─── Routes Metadata API (SUPER_ADMIN only) ─────────
      .get('/api/admin/routes', ({}) => {
        const routes: { method: string; path: string; auth: string; category: string; description: string }[] = [
          // Frontend routes
          { method: 'PAGE', path: '/', auth: 'public', category: 'frontend', description: 'Landing page' },
          { method: 'PAGE', path: '/login', auth: 'public', category: 'frontend', description: 'Login page (email/password + Google OAuth)' },
          { method: 'PAGE', path: '/dev', auth: 'superAdmin', category: 'frontend', description: 'Dev console (SUPER_ADMIN only)' },
          { method: 'PAGE', path: '/dashboard', auth: 'admin', category: 'frontend', description: 'Admin dashboard (ADMIN+)' },
          { method: 'PAGE', path: '/profile', auth: 'authenticated', category: 'frontend', description: 'User profile (all authenticated)' },
          { method: 'PAGE', path: '/blocked', auth: 'authenticated', category: 'frontend', description: 'Blocked user info page' },
          // Auth (Better Auth native)
          { method: 'POST', path: '/api/auth/sign-in/email', auth: 'public', category: 'auth', description: 'Email/password sign in' },
          { method: 'POST', path: '/api/auth/sign-up/email', auth: 'public', category: 'auth', description: 'Email/password sign up' },
          { method: 'POST', path: '/api/auth/sign-out', auth: 'authenticated', category: 'auth', description: 'Sign out (delete session)' },
          { method: 'GET', path: '/api/auth/get-session', auth: 'public', category: 'auth', description: 'Get current session' },
          { method: 'GET', path: '/api/auth/sign-in/social', auth: 'public', category: 'auth', description: 'Google OAuth redirect' },
          { method: 'GET', path: '/api/auth/callback/google', auth: 'public', category: 'auth', description: 'Google OAuth callback' },
          // Dev Auth
          { method: 'GET', path: '/api/dev-auth/login-as/:email', auth: 'public', category: 'auth', description: 'Dev-only: login as any user by email (development only)' },
          // Admin
          { method: 'GET', path: '/api/admin/users', auth: 'superAdmin', category: 'admin', description: 'List all users' },
          { method: 'PUT', path: '/api/admin/users/:id/role', auth: 'superAdmin', category: 'admin', description: 'Change user role' },
          { method: 'PUT', path: '/api/admin/users/:id/block', auth: 'superAdmin', category: 'admin', description: 'Block/unblock user' },
          { method: 'GET', path: '/api/admin/presence', auth: 'superAdmin', category: 'admin', description: 'Online user IDs' },
          { method: 'GET', path: '/api/admin/logs/app', auth: 'superAdmin', category: 'admin', description: 'App logs (Redis)' },
          { method: 'GET', path: '/api/admin/logs/audit', auth: 'superAdmin', category: 'admin', description: 'Audit logs (DB)' },
          { method: 'DELETE', path: '/api/admin/logs/app', auth: 'superAdmin', category: 'admin', description: 'Clear app logs' },
          { method: 'DELETE', path: '/api/admin/logs/audit', auth: 'superAdmin', category: 'admin', description: 'Clear audit logs' },
          { method: 'GET', path: '/api/admin/schema', auth: 'superAdmin', category: 'admin', description: 'Database schema (Prisma)' },
          { method: 'GET', path: '/api/admin/routes', auth: 'superAdmin', category: 'admin', description: 'Routes metadata' },
          { method: 'GET', path: '/api/admin/project-structure', auth: 'superAdmin', category: 'admin', description: 'Project file structure' },
          { method: 'GET', path: '/api/admin/env-map', auth: 'superAdmin', category: 'admin', description: 'Environment variables map' },
          { method: 'GET', path: '/api/admin/test-coverage', auth: 'superAdmin', category: 'admin', description: 'Test coverage mapping' },
          { method: 'GET', path: '/api/admin/dependencies', auth: 'superAdmin', category: 'admin', description: 'NPM dependencies graph' },
          { method: 'GET', path: '/api/admin/migrations', auth: 'superAdmin', category: 'admin', description: 'Migration timeline' },
          { method: 'GET', path: '/api/admin/sessions', auth: 'superAdmin', category: 'admin', description: 'Active sessions (live)' },
          // Tickets
          { method: 'GET', path: '/api/tickets', auth: 'qcOrAdmin', category: 'tickets', description: 'List tickets' },
          { method: 'POST', path: '/api/tickets', auth: 'qcOrAdmin', category: 'tickets', description: 'Create ticket' },
          { method: 'GET', path: '/api/tickets/:id', auth: 'qcOrAdmin', category: 'tickets', description: 'Get ticket detail' },
          { method: 'PATCH', path: '/api/tickets/:id', auth: 'qcOrAdmin', category: 'tickets', description: 'Update ticket' },
          { method: 'POST', path: '/api/tickets/:id/comments', auth: 'qcOrAdmin', category: 'tickets', description: 'Add comment' },
          { method: 'POST', path: '/api/tickets/:id/evidence', auth: 'qcOrAdmin', category: 'tickets', description: 'Attach evidence' },
          // Utility
          { method: 'GET', path: '/health', auth: 'public', category: 'utility', description: 'Health check' },
          { method: 'GET', path: '/api/version', auth: 'public', category: 'utility', description: 'App version' },
          { method: 'GET', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (GET)' },
          { method: 'PUT', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (PUT)' },
          { method: 'GET', path: '/api/hello/:name', auth: 'public', category: 'utility', description: 'Hello with name param' },
          // WebSocket
          { method: 'WS', path: '/ws/presence', auth: 'authenticated', category: 'realtime', description: 'Real-time presence tracking' },
          // MCP
          { method: 'ALL', path: '/mcp', auth: 'secret', category: 'mcp', description: 'MCP over HTTP (MCP_SECRET bearer)' },
        ]

        const byMethod: Record<string, number> = {}
        const byAuth: Record<string, number> = {}
        const byCategory: Record<string, number> = {}
        for (const r of routes) {
          byMethod[r.method] = (byMethod[r.method] || 0) + 1
          byAuth[r.auth] = (byAuth[r.auth] || 0) + 1
          byCategory[r.category] = (byCategory[r.category] || 0) + 1
        }

        return {
          routes,
          summary: { total: routes.length, byMethod, byAuth, byCategory } }
      })

      // ─── Project Structure API (SUPER_ADMIN only) ──────
      .get('/api/admin/project-structure', async ({}) => {
        const fs = await import('node:fs')
        const path = await import('node:path')
        const root = process.cwd()
        const scanDirs = ['src', 'prisma', 'tests']
        const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git', '.next'])
        const exts = new Set(['.ts', '.tsx'])

        interface FileInfo {
          path: string
          category: string
          lines: number
          exports: string[]
          imports: { from: string; names: string[] }[]
        }

        interface DirInfo {
          path: string
          category: string
          fileCount: number
        }

        const files: FileInfo[] = []
        const dirs: DirInfo[] = []

        function categorize(filePath: string): string {
          if (filePath.startsWith('src/frontend/routes/')) return 'route'
          if (filePath.startsWith('src/frontend/hooks/')) return 'hook'
          if (filePath.startsWith('src/frontend/components/')) return 'component'
          if (filePath.startsWith('src/frontend')) return 'frontend'
          if (filePath.startsWith('src/lib/')) return 'lib'
          if (filePath.startsWith('prisma/')) return 'prisma'
          if (filePath.startsWith('tests/unit/')) return 'test-unit'
          if (filePath.startsWith('tests/integration/')) return 'test-integration'
          if (filePath.startsWith('tests/')) return 'test'
          if (filePath.startsWith('src/')) return 'backend'
          return 'config'
        }

        function parseFile(filePath: string, content: string): FileInfo {
          const lines = content.split('\n').length
          const exports: string[] = []
          const imports: { from: string; names: string[] }[] = []

          for (const m of content.matchAll(
            /export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g,
          )) {
            exports.push(m[1])
          }
          if (
            /export\s+default\s+/.test(content) &&
            !exports.some(
              (e) => content.includes(`export default function ${e}`) || content.includes(`export default class ${e}`),
            )
          ) {
            exports.push('default')
          }

          for (const m of content.matchAll(
            /import\s+(?:\{([^}]+)\}|(\w+))(?:\s*,\s*\{([^}]+)\})?\s+from\s+['"]([^'"]+)['"]/g,
          )) {
            const names: string[] = []
            if (m[1]) names.push(...m[1].split(',').map((s) => s.trim().split(' as ')[0].trim()).filter(Boolean))
            if (m[2]) names.push(m[2])
            if (m[3]) names.push(...m[3].split(',').map((s) => s.trim().split(' as ')[0].trim()).filter(Boolean))
            let from = m[4]
            if (from.startsWith('.')) {
              const dir = path.dirname(filePath)
              from = path.normalize(path.join(dir, from)).replace(/\\/g, '/')
              for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
                if (fs.existsSync(path.join(root, from + ext))) {
                  from = from + ext
                  break
                }
                if (fs.existsSync(path.join(root, from))) break
              }
            }
            imports.push({ from, names })
          }

          return { path: filePath, category: categorize(filePath), lines, exports, imports }
        }

        function scan(dir: string) {
          const absDir = path.join(root, dir)
          if (!fs.existsSync(absDir)) return
          const entries = fs.readdirSync(absDir, { withFileTypes: true })
          let fileCount = 0

          for (const entry of entries) {
            if (skipDirs.has(entry.name)) continue
            const rel = path.join(dir, entry.name).replace(/\\/g, '/')
            if (entry.isDirectory()) {
              scan(rel)
            } else if (exts.has(path.extname(entry.name))) {
              const content = fs.readFileSync(path.join(root, rel), 'utf-8')
              files.push(parseFile(rel, content))
              fileCount++
            }
          }

          dirs.push({ path: dir, category: categorize(`${dir}/`), fileCount })
        }

        for (const d of scanDirs) scan(d)

        files.sort((a, b) => a.path.localeCompare(b.path))
        dirs.sort((a, b) => a.path.localeCompare(b.path))

        const totalLines = files.reduce((s, f) => s + f.lines, 0)
        const totalExports = files.reduce((s, f) => s + f.exports.length, 0)
        const totalImports = files.reduce((s, f) => s + f.imports.length, 0)
        const byCategory: Record<string, number> = {}
        for (const f of files) {
          byCategory[f.category] = (byCategory[f.category] || 0) + 1
        }

        return {
          files,
          directories: dirs,
          summary: { totalFiles: files.length, totalLines, totalExports, totalImports, byCategory } }
      })

      // ─── Environment Map API (SUPER_ADMIN only) ─────────
      .get('/api/admin/env-map', async ({}) => {
        const fs = await import('node:fs')
        const path = await import('node:path')
        const root = process.cwd()

        const envDefs: {
          name: string
          envKey: string
          required: boolean
          default: string | null
          category: string
          description: string
        }[] = [
          { name: 'DATABASE_URL', envKey: 'DATABASE_URL', required: true, default: null, category: 'database', description: 'PostgreSQL connection string' },
          { name: 'REDIS_URL', envKey: 'REDIS_URL', required: true, default: null, category: 'cache', description: 'Redis connection string' },
          { name: 'GOOGLE_CLIENT_ID', envKey: 'GOOGLE_CLIENT_ID', required: true, default: null, category: 'auth', description: 'Google OAuth client ID' },
          { name: 'GOOGLE_CLIENT_SECRET', envKey: 'GOOGLE_CLIENT_SECRET', required: true, default: null, category: 'auth', description: 'Google OAuth client secret' },
          { name: 'BETTER_AUTH_SECRET', envKey: 'BETTER_AUTH_SECRET', required: true, default: null, category: 'auth', description: 'Better Auth encryption secret (min 32 chars)' },
          { name: 'BETTER_AUTH_URL', envKey: 'BETTER_AUTH_URL', required: false, default: 'http://localhost:3000', category: 'auth', description: 'Better Auth base URL (production URL)' },
          { name: 'SUPER_ADMIN_EMAIL', envKey: 'SUPER_ADMIN_EMAIL', required: false, default: '(empty)', category: 'auth', description: 'Comma-separated emails to auto-promote to SUPER_ADMIN' },
          { name: 'PORT', envKey: 'PORT', required: false, default: '3000', category: 'app', description: 'Server port' },
          { name: 'NODE_ENV', envKey: 'NODE_ENV', required: false, default: 'development', category: 'app', description: 'Environment mode' },
          { name: 'REACT_EDITOR', envKey: 'REACT_EDITOR', required: false, default: 'code', category: 'app', description: 'Editor for click-to-source' },
          { name: 'AUDIT_LOG_RETENTION_DAYS', envKey: 'AUDIT_LOG_RETENTION_DAYS', required: false, default: '90', category: 'app', description: 'Days to keep audit logs' },
        ]

        const srcFiles = ['src/lib/env.ts', 'src/lib/db.ts', 'src/lib/redis.ts', 'src/lib/applog.ts', 'src/lib/auth.ts', 'src/app.ts', 'src/index.tsx', 'src/vite.ts']
        const fileContents: Record<string, string> = {}
        for (const f of srcFiles) {
          const absPath = path.join(root, f)
          if (fs.existsSync(absPath)) fileContents[f] = fs.readFileSync(absPath, 'utf-8')
        }

        const variables = envDefs.map((def) => {
          const usedBy: string[] = []
          for (const [file, content] of Object.entries(fileContents)) {
            if (content.includes(def.envKey) || content.includes(`env.${def.name}`)) {
              usedBy.push(file)
            }
          }
          return { name: def.name, required: def.required, isSet: !!process.env[def.envKey], default: def.default, category: def.category, description: def.description, usedBy }
        })

        const byCategory: Record<string, number> = {}
        let setCount = 0, requiredCount = 0
        for (const v of variables) {
          byCategory[v.category] = (byCategory[v.category] || 0) + 1
          if (v.isSet) setCount++
          if (v.required) requiredCount++
        }

        return {
          variables,
          summary: { total: variables.length, set: setCount, unset: variables.length - setCount, required: requiredCount, byCategory } }
      })

      // ─── Test Coverage Map API (SUPER_ADMIN only) ──────
      .get('/api/admin/test-coverage', async ({}) => {
        const fs = await import('node:fs')
        const pathMod = await import('node:path')
        const root = process.cwd()
        const exts = new Set(['.ts', '.tsx'])
        const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git'])

        interface SrcFile { path: string; lines: number; exports: string[]; testedBy: string[]; coverage: string }
        interface TestFile { path: string; lines: number; type: string; targets: string[] }

        function scanDir(dir: string, collect: string[]) {
          const abs = pathMod.join(root, dir)
          if (!fs.existsSync(abs)) return
          for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            if (skipDirs.has(entry.name)) continue
            const rel = pathMod.join(dir, entry.name).replace(/\\/g, '/')
            if (entry.isDirectory()) scanDir(rel, collect)
            else if (exts.has(pathMod.extname(entry.name))) collect.push(rel)
          }
        }

        const srcPaths: string[] = []
        scanDir('src', srcPaths)
        const srcFiltered = srcPaths.filter((f) => !f.includes('routeTree.gen'))

        const testPaths: string[] = []
        scanDir('tests', testPaths)
        const testFiltered = testPaths.filter((f) => f.includes('.test.'))

        const testFiles: TestFile[] = testFiltered.map((tp) => {
          const content = fs.readFileSync(pathMod.join(root, tp), 'utf-8')
          const lines = content.split('\n').length
          const type = tp.includes('/unit/') ? 'unit' : tp.includes('/integration/') ? 'integration' : 'other'
          const targets: string[] = []
          for (const m of content.matchAll(/from\s+['"]([^'"]*(?:src|lib)[^'"]*)['"]/g)) {
            let resolved = m[1].replace(/^.*?src\//, 'src/')
            if (resolved.startsWith('.')) {
              resolved = pathMod.normalize(pathMod.join(pathMod.dirname(tp), resolved)).replace(/\\/g, '/')
            }
            for (const ext of ['', '.ts', '.tsx']) {
              const full = resolved + ext
              if (srcFiltered.includes(full)) { targets.push(full); break }
            }
          }
          if (/fetch\(['"`]\/api\//.test(content) || /createApp|createTestApp/.test(content)) {
            if (!targets.includes('src/app.ts')) targets.push('src/app.ts')
          }
          return { path: tp, lines, type, targets: [...new Set(targets)] }
        })

        const testedByMap: Record<string, string[]> = {}
        for (const t of testFiles) {
          for (const target of t.targets) {
            if (!testedByMap[target]) testedByMap[target] = []
            testedByMap[target].push(t.path)
          }
        }

        const sourceFiles: SrcFile[] = srcFiltered.map((sp) => {
          const content = fs.readFileSync(pathMod.join(root, sp), 'utf-8')
          const lines = content.split('\n').length
          const exports: string[] = []
          for (const m of content.matchAll(/export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g)) {
            exports.push(m[1])
          }
          const tb = testedByMap[sp] || []
          const coverage = tb.length === 0 ? 'uncovered' : tb.some((t) => t.includes('/unit/')) ? 'covered' : 'partial'
          return { path: sp, lines, exports, testedBy: tb, coverage }
        })

        const covered = sourceFiles.filter((f) => f.coverage === 'covered').length
        const partial = sourceFiles.filter((f) => f.coverage === 'partial').length
        const uncovered = sourceFiles.filter((f) => f.coverage === 'uncovered').length

        return {
          sourceFiles,
          testFiles,
          summary: {
            totalSource: sourceFiles.length, totalTests: testFiles.length, covered, partial, uncovered,
            coveragePercent: Math.round(((covered + partial * 0.5) / sourceFiles.length) * 100) } }
      })

      // ─── Dependencies Graph API (SUPER_ADMIN only) ─────
      .get('/api/admin/dependencies', async ({}) => {
        const fs = await import('node:fs')
        const pathMod = await import('node:path')
        const root = process.cwd()
        const pkgPath = pathMod.join(root, 'package.json')
        if (!fs.existsSync(pkgPath)) return { error: 'package.json not found' }

        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        const deps: Record<string, string> = pkgJson.dependencies || {}
        const devDeps: Record<string, string> = pkgJson.devDependencies || {}

        const catMap: Record<string, string> = {
          elysia: 'server', '@elysiajs/cors': 'server', '@elysiajs/html': 'server',
          'better-auth': 'auth',
          react: 'ui', 'react-dom': 'ui', '@mantine/core': 'ui', '@mantine/hooks': 'ui',
          '@tanstack/react-router': 'ui', '@tanstack/react-query': 'ui', '@xyflow/react': 'ui', 'react-icons': 'ui',
          '@prisma/client': 'database', prisma: 'database',
          vite: 'build', typescript: 'build', '@biomejs/biome': 'build', '@vitejs/plugin-react': 'build' }

        const srcFiles: string[] = []
        function scanSrc(dir: string) {
          const abs = pathMod.join(root, dir)
          if (!fs.existsSync(abs)) return
          for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
            if (['node_modules', 'dist', 'generated', '.git'].includes(e.name)) continue
            const rel = pathMod.join(dir, e.name).replace(/\\/g, '/')
            if (e.isDirectory()) scanSrc(rel)
            else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(rel)
          }
        }
        scanSrc('src')

        const fileContents: Record<string, string> = {}
        for (const f of srcFiles) { fileContents[f] = fs.readFileSync(pathMod.join(root, f), 'utf-8') }

        const allPkgs: { name: string; version: string; type: string; category: string; usedBy: string[] }[] = []

        for (const [name, version] of Object.entries(deps)) {
          const usedBy: string[] = []
          const importPattern = new RegExp(`from\\s+['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
          for (const [file, content] of Object.entries(fileContents)) {
            if (importPattern.test(content)) usedBy.push(file)
          }
          allPkgs.push({ name, version, type: 'runtime', category: catMap[name] || 'other', usedBy })
        }

        for (const [name, version] of Object.entries(devDeps)) {
          allPkgs.push({ name, version, type: 'dev', category: catMap[name] || 'build', usedBy: [] })
        }

        const byCategory: Record<string, number> = {}
        let runtime = 0, dev = 0
        for (const p of allPkgs) {
          byCategory[p.category] = (byCategory[p.category] || 0) + 1
          if (p.type === 'runtime') runtime++
          else dev++
        }

        return { packages: allPkgs, summary: { total: allPkgs.length, runtime, dev, byCategory } }
      })

      // ─── Migrations Timeline API (SUPER_ADMIN only) ────
      .get('/api/admin/migrations', async ({}) => {
        const fs = await import('node:fs')
        const pathMod = await import('node:path')
        const root = process.cwd()
        const migrationsDir = pathMod.join(root, 'prisma/migrations')

        if (!fs.existsSync(migrationsDir)) {
          return { migrations: [], summary: { totalMigrations: 0, firstMigration: null, lastMigration: null, totalChanges: 0 } }
        }

        const entries = fs
          .readdirSync(migrationsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
          .sort((a, b) => a.name.localeCompare(b.name))

        const migrations = entries.map((entry) => {
          const sqlPath = pathMod.join(migrationsDir, entry.name, 'migration.sql')
          let sql = ''
          const changes: string[] = []

          if (fs.existsSync(sqlPath)) {
            sql = fs.readFileSync(sqlPath, 'utf-8')
            for (const m of sql.matchAll(
              /^(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE UNIQUE INDEX|DROP TABLE|DROP INDEX|CREATE TYPE|ALTER TYPE)\s+["']?(\w+)["']?/gim,
            )) {
              changes.push(`${m[1]} ${m[2]}`)
            }
            for (const m of sql.matchAll(/CREATE TYPE\s+"(\w+)"/g)) {
              if (!changes.some((c) => c.includes(m[1]))) changes.push(`CREATE TYPE ${m[1]}`)
            }
          }

          const dateStr = entry.name.substring(0, 14)
          const createdAt = new Date(
            `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(8, 10)}:${dateStr.slice(10, 12)}:${dateStr.slice(12, 14)}.000Z`,
          ).toISOString()
          const name = entry.name.substring(15)

          return { name, folder: entry.name, createdAt, changes, sql: sql.substring(0, 800) }
        })

        const totalChanges = migrations.reduce((s, m) => s + m.changes.length, 0)

        return {
          migrations,
          summary: {
            totalMigrations: migrations.length,
            firstMigration: migrations[0]?.createdAt || null,
            lastMigration: migrations[migrations.length - 1]?.createdAt || null,
            totalChanges } }
      })

      // ─── Sessions Live API (SUPER_ADMIN only) ──────────
      .get('/api/admin/sessions', async ({}) => {
        const onlineIds = new Set(getOnlineUserIds())
        const sessions = await prisma.session.findMany({
          include: { user: { select: { id: true, name: true, email: true, role: true, blocked: true } } },
          orderBy: { createdAt: 'desc' } })

        const now = new Date()
        const result = sessions.map((s) => ({
          id: s.id,
          userId: s.user.id,
          userName: s.user.name,
          userEmail: s.user.email,
          userRole: s.user.role,
          userBlocked: s.user.blocked,
          isOnline: onlineIds.has(s.user.id),
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          isExpired: s.expiresAt < now }))

        const byRole: Record<string, number> = {}
        const uniqueUsers = new Set<string>()
        let active = 0, expired = 0
        for (const s of result) {
          uniqueUsers.add(s.userId)
          byRole[s.userRole] = (byRole[s.userRole] || 0) + 1
          if (s.isExpired) expired++
          else active++
        }

        return {
          sessions: result,
          summary: { totalSessions: result.length, activeSessions: active, expiredSessions: expired, onlineUsers: onlineIds.size, byRole } }
      })

      // ─── Tickets API ──────────────────────────────────
      .get('/api/tickets', async ({ query, authUser }) => {
        const guard = guardQcOrAdmin(authUser); if (guard) return guard
        const where: Record<string, unknown> = {}
        if (query.status) where.status = String(query.status)
        if (query.priority) where.priority = String(query.priority)
        if (query.assigneeId) where.assigneeId = String(query.assigneeId)
        if (query.reporterId) where.reporterId = String(query.reporterId)
        if (query.mine === '1') where.assigneeId = authUser!.id

        const tickets = await prisma.ticket.findMany({
          where,
          include: {
            reporter: { select: { id: true, name: true, email: true, role: true } },
            assignee: { select: { id: true, name: true, email: true, role: true } },
            _count: { select: { comments: true, evidence: true } } },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: Math.min(Number(query.limit) || 100, 500) })
        return { tickets }
      })

      .get('/api/tickets/:id', async ({ params, set, authUser }) => {
        const guard = guardQcOrAdmin(authUser); if (guard) return guard
        const ticket = await prisma.ticket.findUnique({
          where: { id: params.id },
          include: {
            reporter: { select: { id: true, name: true, email: true, role: true } },
            assignee: { select: { id: true, name: true, email: true, role: true } },
            comments: {
              include: { author: { select: { id: true, name: true, email: true, role: true } } },
              orderBy: { createdAt: 'asc' } },
            evidence: { orderBy: { createdAt: 'asc' } } } })
        if (!ticket) {
          set.status = 404
          return { error: 'Ticket not found' }
        }
        return { ticket }
      })

      .post('/api/tickets', async ({ request, set, authUser }) => {
        const guard = guardQcOrAdmin(authUser); if (guard) return guard
        const body = (await request.json()) as {
          title?: string
          description?: string
          priority?: string
          route?: string
          assigneeId?: string
        }
        if (!body.title || !body.description) {
          set.status = 400
          return { error: 'title dan description wajib diisi' }
        }
        const ticket = await prisma.ticket.create({
          data: {
            title: body.title,
            description: body.description,
            priority: (body.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') ?? 'MEDIUM',
            route: body.route ?? null,
            reporterId: authUser!.id,
            assigneeId: body.assigneeId ?? null } })
        audit(authUser!.id, 'TICKET_CREATED', `#${ticket.id} ${ticket.title}`, getIp(request))
        appLog('info', `Ticket created: ${ticket.title} by ${authUser!.email}`)
        return { ticket }
      })

      .patch('/api/tickets/:id', async ({ request, params, set, authUser }) => {
        const guard = guardQcOrAdmin(authUser); if (guard) return guard
        const current = await prisma.ticket.findUnique({ where: { id: params.id } })
        if (!current) {
          set.status = 404
          return { error: 'Ticket not found' }
        }

        const body = (await request.json()) as {
          title?: string
          description?: string
          priority?: string
          route?: string | null
          status?: string
          assigneeId?: string | null
        }

        const data: Record<string, unknown> = {}

        if (body.title !== undefined) data.title = body.title
        if (body.description !== undefined) data.description = body.description
        if (body.priority !== undefined) data.priority = body.priority
        if (body.route !== undefined) data.route = body.route
        if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId

        if (body.status !== undefined) {
          const allowed = getAllowedStatusTransitions(current.status, authUser!.role as 'QC' | 'ADMIN' | 'SUPER_ADMIN')
          if (!allowed.includes(body.status)) {
            set.status = 400
            return { error: `Transisi status tidak diizinkan untuk role ${authUser!.role}: ${current.status} → ${body.status}` }
          }
          data.status = body.status
          if (body.status === 'CLOSED') data.closedAt = new Date()
          if (body.status === 'REOPENED') data.closedAt = null
        }

        const ticket = await prisma.ticket.update({ where: { id: params.id }, data })
        audit(authUser!.id, 'TICKET_UPDATED', `#${ticket.id} ${Object.keys(data).join(',')}`, getIp(request))
        return { ticket }
      })

      .post('/api/tickets/:id/comments', async ({ request, params, set, authUser }) => {
        const guard = guardQcOrAdmin(authUser); if (guard) return guard
        const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
        if (!ticket) {
          set.status = 404
          return { error: 'Ticket not found' }
        }

        const { body } = (await request.json()) as { body?: string }
        if (!body?.trim()) {
          set.status = 400
          return { error: 'body wajib diisi' }
        }

        const comment = await prisma.ticketComment.create({
          data: {
            ticketId: params.id,
            authorId: authUser!.id,
            authorTag: authUser!.role === 'QC' ? 'QC' : authUser!.role === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN',
            body },
          include: { author: { select: { id: true, name: true, email: true, role: true } } } })
        return { comment }
      })

      .post('/api/tickets/:id/evidence', async ({ request, params, set, authUser }) => {
        const guard = guardQcOrAdmin(authUser); if (guard) return guard
        const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
        if (!ticket) {
          set.status = 404
          return { error: 'Ticket not found' }
        }

        const body = (await request.json()) as { kind?: string; url?: string; note?: string }
        if (!body.kind || !body.url) {
          set.status = 400
          return { error: 'kind dan url wajib diisi' }
        }

        const evidence = await prisma.ticketEvidence.create({
          data: { ticketId: params.id, kind: body.kind, url: body.url, note: body.note ?? null } })
        return { evidence }
      })

      // ─── MCP over HTTP ────────────────────────────────
      .all('/mcp', async ({ request }) => {
        if (!env.MCP_SECRET && !env.MCP_SECRET_ADMIN) {
          return new Response(JSON.stringify({ error: 'MCP not configured: set MCP_SECRET and/or MCP_SECRET_ADMIN' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' } })
        }
        const header = request.headers.get('authorization') ?? ''
        const bearer = header.replace(/^Bearer\s+/i, '').trim()
        const provided = bearer || request.headers.get('x-mcp-secret') || ''
        let scope: McpScope | null = null
        if (env.MCP_SECRET_ADMIN && provided === env.MCP_SECRET_ADMIN) scope = 'admin'
        else if (env.MCP_SECRET && provided === env.MCP_SECRET) scope = 'readonly'
        if (!scope) {
          appLog('warn', `MCP unauthorized from ${getIp(request)}`)
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' } })
        }
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true })
        const mcp = createMcpServer(scope)
        await mcp.connect(transport)
        const response = await transport.handleRequest(request)
        response.headers.set('x-mcp-server', 'app-mcp')
        response.headers.set('x-mcp-scope', scope)
        return response
      })

      // ─── Version ─────────────────────────────────────────
      .get('/api/version', () => ({
        name: pkg.name,
        version: pkg.version }))

      // ─── Example API ───────────────────────────────────
      .get('/api/hello', () => ({ message: 'Hello, world!', method: 'GET' }))
      .put('/api/hello', () => ({ message: 'Hello, world!', method: 'PUT' }))
      .get('/api/hello/:name', ({ params }) => ({ message: `Hello, ${params.name}!` }))
  )
}
