import { cors } from '@elysiajs/cors'
import { html } from '@elysiajs/html'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Elysia } from 'elysia'
import { createMcpServer, type McpScope } from '../scripts/mcp/server'
import { appLog } from './lib/applog'
import { auth } from './lib/auth'
import { betterAuthPlugin } from './lib/auth-middleware'
import { prisma } from './lib/db'
import { env } from './lib/env'
import { redis } from './lib/redis'
import { broadcastToAdmins, addConnection, removeConnection } from './lib/presence'
import { getIp } from './lib/route-helpers'
import { adminUsersRouter } from './routes/admin/users'
import { adminLogsRouter } from './routes/admin/logs'
import { adminInfoRouter } from './routes/admin/info'
import { ticketsRouter } from './routes/tickets'
import pkg from '../package.json'

export function createApp() {
  appLog('info', 'Server starting')

  return (
    new Elysia()
      .use(cors({
        origin: env.BETTER_AUTH_URL || `http://localhost:${env.PORT}`,
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      }))
      .use(html())

      // ─── Better Auth (handles /api/auth/* routes) ─────────
      .use(betterAuthPlugin)

      // ─── Sub-routers ──────────────────────────────────────
      .use(adminUsersRouter)
      .use(adminLogsRouter)
      .use(adminInfoRouter)
      .use(ticketsRouter)

      // ─── Global Error Handler ──────────────────────────────
      .onError(({ code, error, request }) => {
        if (code === 'NOT_FOUND') {
          return new Response(JSON.stringify({ error: 'Not Found', status: 404 }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const url = new URL(request.url)
        const message = error instanceof Error ? error.message : String(error)
        appLog('error', `${request.method} ${url.pathname} — ${message}`)
        console.error('[Server Error]', error)
        return new Response(JSON.stringify({ error: 'Internal Server Error', status: 500 }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      // ─── Request timing + logging ──────────────────────────
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
            timestamp: new Date().toISOString(),
          })
        }
      })

      // ─── Health ────────────────────────────────────────────
      .get('/health', () => ({ status: 'ok' }))

      // ─── Dev Auth (development only) ──────────────────────
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

        const token = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        const sessionRecord = await prisma.session.create({
          data: { token, userId: user.id, expiresAt, ipAddress: getIp(request) },
        })

        const sessionPayload = JSON.stringify({ ...sessionRecord, user })
        await redis.set(`ba:kv:${token}`, sessionPayload, 'EX', 7 * 24 * 60 * 60)

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

      // ─── WebSocket Presence ────────────────────────────────
      .ws('/ws/presence', {
        async open(ws) {
          const session = await auth.api.getSession({
            headers: new Headers({ cookie: ws.data.headers?.cookie ?? '' }),
          })
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
        message() {},
      })

      // ─── MCP over HTTP ─────────────────────────────────────
      .all('/mcp', async ({ request }) => {
        if (!env.MCP_SECRET && !env.MCP_SECRET_ADMIN) {
          return new Response(JSON.stringify({ error: 'MCP not configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
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
            headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
          })
        }
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
        const mcp = createMcpServer(scope)
        await mcp.connect(transport)
        const response = await transport.handleRequest(request)
        response.headers.set('x-mcp-server', 'app-mcp')
        response.headers.set('x-mcp-scope', scope)
        return response
      })

      // ─── Utility ───────────────────────────────────────────
      .get('/api/version', () => ({ name: pkg.name, version: pkg.version }))
      .get('/api/hello', () => ({ message: 'Hello, world!', method: 'GET' }))
      .put('/api/hello', () => ({ message: 'Hello, world!', method: 'PUT' }))
      .get('/api/hello/:name', ({ params }) => ({ message: `Hello, ${params.name}!` }))
  )
}
