import { Elysia, t } from 'elysia'
import { appLog } from '../../lib/applog'
import { betterAuthPlugin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
import { redis } from '../../lib/redis'
import { audit, getIp, guardSuperAdmin } from '../../lib/route-helpers'

const _UserSchema = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  role: t.String(),
  blocked: t.Boolean(),
  createdAt: t.Date(),
})

const _ErrorSchema = t.Object({ error: t.String() })

export const adminUsersRouter = new Elysia({ tags: ['Admin — Users'] })
  .use(betterAuthPlugin)

  .get(
    '/api/admin/users',
    async ({ authUser }) => {
      const guard = guardSuperAdmin(authUser)
      if (guard) return guard
      const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      })
      return { users }
    },
    {
      detail: {
        summary: 'List all users',
        description: 'Returns all users with role, blocked status, and createdAt. Requires SUPER_ADMIN.',
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'User list' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires SUPER_ADMIN' },
        },
      },
    },
  )

  .put(
    '/api/admin/users/:id/role',
    async ({ request, params, set, authUser, body }) => {
      const guard = guardSuperAdmin(authUser)
      if (guard) return guard
      const ip = getIp(request)
      if (authUser!.id === params.id) {
        set.status = 400
        return { error: 'Tidak bisa mengubah role sendiri' }
      }
      const { role } = body
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
        select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
      })
      audit(params.id, 'ROLE_CHANGED', `${target?.role} → ${role} by ${authUser!.id}`, ip)
      appLog('info', `Role changed: ${user.email} ${target?.role} → ${role}`)
      return { user }
    },
    {
      detail: {
        summary: 'Change user role',
        description: "Change role to USER, QC, or ADMIN. Cannot change own role or SUPER_ADMIN's role.",
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'User with updated role' },
          400: { description: 'Invalid role / self-change / cannot demote SUPER_ADMIN' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires SUPER_ADMIN' },
        },
      },
      params: t.Object({ id: t.String({ description: 'User ID' }) }),
      body: t.Object({
        role: t.Union([t.Literal('USER'), t.Literal('QC'), t.Literal('ADMIN')], {
          description: 'New role to assign',
        }),
      }),
    },
  )

  .put(
    '/api/admin/users/:id/block',
    async ({ request, params, set, authUser, body }) => {
      const guard = guardSuperAdmin(authUser)
      if (guard) return guard
      const ip = getIp(request)
      if (authUser!.id === params.id) {
        set.status = 400
        return { error: 'Tidak bisa memblokir diri sendiri' }
      }
      const { blocked } = body

      const sessionTokens = blocked
        ? (await prisma.session.findMany({ where: { userId: params.id }, select: { token: true } })).map(
            (s: { token: string }) => s.token,
          )
        : []

      const [user] = await prisma.$transaction([
        prisma.user.update({
          where: { id: params.id },
          data: { blocked },
          select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
        }),
        ...(blocked ? [prisma.session.deleteMany({ where: { userId: params.id } })] : []),
      ])

      for (const token of sessionTokens) {
        await redis.del(`ba:kv:${token}`).catch(() => {})
      }

      const action = blocked ? 'BLOCKED' : 'UNBLOCKED'
      audit(params.id, action, `by ${authUser!.id}`, ip)
      appLog('info', `User ${action.toLowerCase()}: ${user.email}`)
      return { user }
    },
    {
      detail: {
        summary: 'Block or unblock a user',
        description: 'Block=true deletes all sessions and Redis tokens atomically. Cannot block yourself.',
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'User with updated blocked status' },
          400: { description: 'Cannot block yourself' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires SUPER_ADMIN' },
        },
      },
      params: t.Object({ id: t.String({ description: 'User ID' }) }),
      body: t.Object({
        blocked: t.Boolean({ description: 'true to block, false to unblock' }),
      }),
    },
  )
