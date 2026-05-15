import { Elysia, t } from 'elysia'
import { betterAuthPlugin } from '../../lib/auth-middleware'
import { getOnlineUserIds } from '../../lib/presence'
import { guardSuperAdmin } from '../../lib/route-helpers'
import { parseSchema } from '../../lib/schema-parser'

const RouteEntrySchema = t.Object({
  method: t.String(),
  path: t.String(),
  auth: t.String(),
  category: t.String(),
  description: t.String(),
})

export const adminPresenceSchemaRoutesRouter = new Elysia({ tags: ['Admin — Info'] })
  .use(betterAuthPlugin)

  .get('/api/admin/presence', ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    return { online: getOnlineUserIds() }
  }, {
    detail: {
      summary: 'Online users',
      description: 'Returns IDs of currently connected users via WebSocket presence tracker.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Array of online user IDs' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })

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
  }, {
    detail: {
      summary: 'Database schema',
      description: 'Returns parsed Prisma schema: models, fields, relations, and enums.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Parsed schema' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
        404: { description: 'schema.prisma file not found' },
      },
    }
  })

  .get('/api/admin/routes', ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    const routes: { method: string; path: string; auth: string; category: string; description: string }[] = [
      { method: 'PAGE', path: '/', auth: 'public', category: 'frontend', description: 'Landing page' },
      { method: 'PAGE', path: '/login', auth: 'public', category: 'frontend', description: 'Login page (email/password + Google OAuth)' },
      { method: 'PAGE', path: '/dev', auth: 'superAdmin', category: 'frontend', description: 'Dev console (SUPER_ADMIN only)' },
      { method: 'PAGE', path: '/dashboard', auth: 'admin', category: 'frontend', description: 'Admin dashboard (ADMIN+)' },
      { method: 'PAGE', path: '/profile', auth: 'authenticated', category: 'frontend', description: 'User profile (all authenticated)' },
      { method: 'PAGE', path: '/blocked', auth: 'authenticated', category: 'frontend', description: 'Blocked user info page' },
      { method: 'POST', path: '/api/auth/sign-in/email', auth: 'public', category: 'auth', description: 'Email/password sign in' },
      { method: 'POST', path: '/api/auth/sign-up/email', auth: 'public', category: 'auth', description: 'Email/password sign up' },
      { method: 'POST', path: '/api/auth/sign-out', auth: 'authenticated', category: 'auth', description: 'Sign out (delete session)' },
      { method: 'GET', path: '/api/auth/get-session', auth: 'public', category: 'auth', description: 'Get current session' },
      { method: 'GET', path: '/api/auth/sign-in/social', auth: 'public', category: 'auth', description: 'Google OAuth redirect' },
      { method: 'GET', path: '/api/auth/callback/google', auth: 'public', category: 'auth', description: 'Google OAuth callback' },
      { method: 'GET', path: '/api/dev-auth/login-as/:email', auth: 'public', category: 'auth', description: 'Dev-only: login as any user by email (development only)' },
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
      { method: 'GET', path: '/api/tickets', auth: 'qcOrAdmin', category: 'tickets', description: 'List tickets' },
      { method: 'POST', path: '/api/tickets', auth: 'qcOrAdmin', category: 'tickets', description: 'Create ticket' },
      { method: 'GET', path: '/api/tickets/:id', auth: 'qcOrAdmin', category: 'tickets', description: 'Get ticket detail' },
      { method: 'PATCH', path: '/api/tickets/:id', auth: 'qcOrAdmin', category: 'tickets', description: 'Update ticket' },
      { method: 'POST', path: '/api/tickets/:id/comments', auth: 'qcOrAdmin', category: 'tickets', description: 'Add comment' },
      { method: 'POST', path: '/api/tickets/:id/evidence', auth: 'qcOrAdmin', category: 'tickets', description: 'Attach evidence' },
      { method: 'GET', path: '/health', auth: 'public', category: 'utility', description: 'Health check' },
      { method: 'GET', path: '/api/version', auth: 'public', category: 'utility', description: 'App version' },
      { method: 'GET', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (GET)' },
      { method: 'PUT', path: '/api/hello', auth: 'public', category: 'utility', description: 'Hello world (PUT)' },
      { method: 'GET', path: '/api/hello/:name', auth: 'public', category: 'utility', description: 'Hello with name param' },
      { method: 'WS', path: '/ws/presence', auth: 'authenticated', category: 'realtime', description: 'Real-time presence tracking' },
      { method: 'ALL', path: '/mcp', auth: 'secret', category: 'mcp', description: 'MCP over HTTP (MCP_SECRET bearer)' },
      { method: 'GET', path: '/api/docs', auth: 'public', category: 'utility', description: 'Swagger UI — API documentation' },
    ]

    const byMethod: Record<string, number> = {}
    const byAuth: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    for (const r of routes) {
      byMethod[r.method] = (byMethod[r.method] || 0) + 1
      byAuth[r.auth] = (byAuth[r.auth] || 0) + 1
      byCategory[r.category] = (byCategory[r.category] || 0) + 1
    }

    return { routes, summary: { total: routes.length, byMethod, byAuth, byCategory } }
  }, {
    detail: {
      summary: 'All routes metadata',
      description: 'Returns all HTTP, WebSocket, and frontend routes with auth level and category. Includes summary stats.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Routes with summary' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    },
  })
