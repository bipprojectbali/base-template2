import { Elysia } from 'elysia'
import { betterAuthPlugin } from '../../lib/auth-middleware'
import { appLog } from '../../lib/applog'
import { prisma } from '../../lib/db'
import { redis } from '../../lib/redis'
import { audit, getIp, guardSuperAdmin } from '../../lib/route-helpers'

export const adminUsersRouter = new Elysia()
  .use(betterAuthPlugin)
  .get('/api/admin/users', async ({ authUser, set }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    })
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
      select: { id: true, name: true, email: true, role: true, blocked: true, createdAt: true },
    })
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

    const sessionTokens = blocked
      ? (await prisma.session.findMany({ where: { userId: params.id }, select: { token: true } })).map(s => s.token)
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
  })
