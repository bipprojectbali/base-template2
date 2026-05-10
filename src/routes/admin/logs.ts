import { Elysia, t } from 'elysia'
import { betterAuthPlugin } from '../../lib/auth-middleware'
import { appLog, clearAppLogs, getAppLogs } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { guardSuperAdmin } from '../../lib/route-helpers'

const AppLogSchema = t.Object({
  id: t.Number(),
  level: t.String(),
  message: t.String(),
  detail: t.Optional(t.String()),
  timestamp: t.String(),
})

const AuditLogSchema = t.Object({
  id: t.String(),
  userId: t.Optional(t.Nullable(t.String())),
  action: t.String(),
  detail: t.Optional(t.Nullable(t.String())),
  ip: t.Optional(t.Nullable(t.String())),
  createdAt: t.Date(),
  user: t.Optional(t.Nullable(t.Object({
    name: t.String(),
    email: t.String(),
  }))),
})

export const adminLogsRouter = new Elysia({ tags: ['Admin — Logs'] })
  .use(betterAuthPlugin)

  .get('/api/admin/logs/app', async ({ request, authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    const url = new URL(request.url)
    const level = url.searchParams.get('level') as any
    const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
    const afterId = parseInt(url.searchParams.get('afterId') ?? '0', 10)
    return { logs: await getAppLogs({ level: level || undefined, limit, afterId: afterId || undefined }) }
  }, {
    detail: {
      summary: 'Get app logs',
      description: 'Fetch recent app logs from Redis ring buffer (max 500 entries). Filterable by level.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'App log entries' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    },
    query: t.Object({
      level: t.Optional(t.Union([t.Literal('info'), t.Literal('warn'), t.Literal('error')], {
        description: 'Filter by log level',
      })),
      limit: t.Optional(t.Numeric({ description: 'Max entries to return (default 100)' })),
      afterId: t.Optional(t.Numeric({ description: 'Return entries with id > afterId (for polling)' })),
    })
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
      take: limit,
    })
    return { logs }
  }, {
    detail: {
      summary: 'Get audit logs',
      description: 'Persistent audit trail from DB. Filterable by userId and action. Max 500 entries.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Audit log entries' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    },
    query: t.Object({
      userId: t.Optional(t.String({ description: 'Filter by user ID' })),
      action: t.Optional(t.String({ description: 'Filter by action (e.g. LOGIN, LOGOUT, ROLE_CHANGED)' })),
      limit: t.Optional(t.Numeric({ description: 'Max entries (default 100, max 500)' })),
    })
  })

  .delete('/api/admin/logs/app', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    await clearAppLogs()
    appLog('info', 'App logs cleared manually')
    return { ok: true }
  }, {
    detail: {
      summary: 'Clear app logs',
      description: 'Wipes the Redis app log buffer. Irreversible.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Logs cleared' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })

  .delete('/api/admin/logs/audit', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    const { count } = await prisma.auditLog.deleteMany()
    appLog('info', `Audit logs cleared manually (${count} entries)`)
    return { ok: true, deleted: count }
  }, {
    detail: {
      summary: 'Clear audit logs',
      description: 'Deletes all audit log rows from the database. Irreversible.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Audit logs cleared with count' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })
