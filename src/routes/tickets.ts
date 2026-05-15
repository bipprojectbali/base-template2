import { Elysia, t } from 'elysia'
import { appLog } from '../lib/applog'
import { betterAuthPlugin } from '../lib/auth-middleware'
import { prisma } from '../lib/db'
import { audit, getIp, guardQcOrAdmin, notDeleted } from '../lib/route-helpers'
import { getAllowedStatusTransitions } from '../lib/ticket-helpers'

const TicketUserSchema = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  role: t.String(),
})

const _TicketListItemSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.String(),
  status: t.String(),
  priority: t.String(),
  route: t.Nullable(t.String()),
  reporterId: t.String(),
  assigneeId: t.Nullable(t.String()),
  createdAt: t.Date(),
  closedAt: t.Nullable(t.Date()),
  reporter: TicketUserSchema,
  assignee: t.Nullable(TicketUserSchema),
  _count: t.Object({ comments: t.Number(), evidence: t.Number() }),
})

const CommentSchema = t.Object({
  id: t.String(),
  body: t.String(),
  authorTag: t.String(),
  createdAt: t.Date(),
  author: t.Nullable(TicketUserSchema),
})

const EvidenceSchema = t.Object({
  id: t.String(),
  kind: t.String(),
  url: t.String(),
  note: t.Nullable(t.String()),
  createdAt: t.Date(),
})

const _TicketDetailSchema = t.Object({
  id: t.String(),
  title: t.String(),
  description: t.String(),
  status: t.String(),
  priority: t.String(),
  route: t.Nullable(t.String()),
  reporterId: t.String(),
  assigneeId: t.Nullable(t.String()),
  createdAt: t.Date(),
  closedAt: t.Nullable(t.Date()),
  reporter: TicketUserSchema,
  assignee: t.Nullable(TicketUserSchema),
  comments: t.Array(CommentSchema),
  evidence: t.Array(EvidenceSchema),
})

const _ErrorSchema = t.Object({ error: t.String() })

export const ticketsRouter = new Elysia({ tags: ['Tickets'] })
  .use(betterAuthPlugin)

  .get(
    '/api/tickets',
    async ({ query, authUser }) => {
      const guard = guardQcOrAdmin(authUser)
      if (guard) return guard
      const limit = Math.min(Number(query.limit) || 50, 200)
      const cursor = query.cursor as string | undefined

      const where: Record<string, unknown> = { ...notDeleted }
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
          _count: { select: { comments: true, evidence: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })

      const hasMore = tickets.length > limit
      return {
        tickets: hasMore ? tickets.slice(0, limit) : tickets,
        nextCursor: hasMore ? tickets[limit - 1]?.id : undefined,
      }
    },
    {
      detail: {
        summary: 'List tickets',
        description:
          'Cursor-based paginated ticket list. Soft-deleted tickets excluded. Supports filtering by status, priority, assignee, reporter, or "mine".',
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'Ticket list with optional nextCursor for pagination' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires QC, ADMIN, or SUPER_ADMIN' },
        },
      },
      query: t.Object({
        limit: t.Optional(t.Numeric({ description: 'Page size (default 50, max 200)' })),
        cursor: t.Optional(t.String({ description: 'Cursor from previous page (ticket ID)' })),
        status: t.Optional(
          t.Union(
            [
              t.Literal('OPEN'),
              t.Literal('IN_PROGRESS'),
              t.Literal('READY_FOR_QC'),
              t.Literal('REOPENED'),
              t.Literal('CLOSED'),
            ],
            { description: 'Filter by status' },
          ),
        ),
        priority: t.Optional(
          t.Union([t.Literal('LOW'), t.Literal('MEDIUM'), t.Literal('HIGH'), t.Literal('CRITICAL')], {
            description: 'Filter by priority',
          }),
        ),
        assigneeId: t.Optional(t.String({ description: 'Filter by assignee user ID' })),
        reporterId: t.Optional(t.String({ description: 'Filter by reporter user ID' })),
        mine: t.Optional(t.Literal('1', { description: 'Only tickets assigned to the current user' })),
      }),
    },
  )

  .get(
    '/api/tickets/:id',
    async ({ params, set, authUser }) => {
      const guard = guardQcOrAdmin(authUser)
      if (guard) return guard
      const ticket = await prisma.ticket.findFirst({
        where: { id: params.id, ...notDeleted },
        include: {
          reporter: { select: { id: true, name: true, email: true, role: true } },
          assignee: { select: { id: true, name: true, email: true, role: true } },
          comments: {
            include: { author: { select: { id: true, name: true, email: true, role: true } } },
            orderBy: { createdAt: 'asc' },
          },
          evidence: { orderBy: { createdAt: 'asc' } },
        },
      })
      if (!ticket) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      return { ticket }
    },
    {
      detail: {
        summary: 'Get ticket detail',
        description: 'Returns full ticket with comments and evidence. Returns 404 for soft-deleted tickets.',
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'Ticket detail with comments and evidence' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires QC, ADMIN, or SUPER_ADMIN' },
          404: { description: 'Ticket not found or soft-deleted' },
        },
      },
      params: t.Object({ id: t.String({ description: 'Ticket ID' }) }),
    },
  )

  .post(
    '/api/tickets',
    async ({ body, set, authUser, request }) => {
      const guard = guardQcOrAdmin(authUser)
      if (guard) return guard
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
          assigneeId: body.assigneeId ?? null,
        },
      })
      audit(authUser!.id, 'TICKET_CREATED', `#${ticket.id} ${ticket.title}`, getIp(request))
      appLog('info', `Ticket created: ${ticket.title} by ${authUser!.email}`)
      return { ticket }
    },
    {
      detail: {
        summary: 'Create ticket',
        description: 'Creates a new ticket. Reporter is set to the authenticated user. Status defaults to OPEN.',
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'Created ticket' },
          400: { description: 'Missing title or description' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires QC, ADMIN, or SUPER_ADMIN' },
        },
      },
      body: t.Object({
        title: t.String({ minLength: 1, description: 'Ticket title' }),
        description: t.String({ minLength: 1, description: 'Repro steps, expected vs actual' }),
        priority: t.Optional(
          t.Union([t.Literal('LOW'), t.Literal('MEDIUM'), t.Literal('HIGH'), t.Literal('CRITICAL')], {
            description: 'Priority level (default MEDIUM)',
          }),
        ),
        route: t.Optional(t.String({ description: 'Affected route/URL e.g. /dashboard?tab=analytics' })),
        assigneeId: t.Optional(t.String({ description: 'Assignee user ID' })),
      }),
    },
  )

  .patch(
    '/api/tickets/:id',
    async ({ body, params, set, authUser, request }) => {
      const guard = guardQcOrAdmin(authUser)
      if (guard) return guard
      const current = await prisma.ticket.findFirst({ where: { id: params.id, ...notDeleted } })
      if (!current) {
        set.status = 404
        return { error: 'Ticket not found' }
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
          return {
            error: `Transisi status tidak diizinkan untuk role ${authUser!.role}: ${current.status} → ${body.status}`,
          }
        }
        data.status = body.status
        if (body.status === 'CLOSED') data.closedAt = new Date()
        if (body.status === 'REOPENED') data.closedAt = null
      }

      const ticket = await prisma.ticket.update({ where: { id: params.id }, data })
      audit(authUser!.id, 'TICKET_UPDATED', `#${ticket.id} ${Object.keys(data).join(',')}`, getIp(request))
      return { ticket }
    },
    {
      detail: {
        summary: 'Update ticket',
        description: `Update ticket fields. Status transitions are role-gated:
- **QC / SUPER_ADMIN:** OPEN→CLOSED, IN_PROGRESS→CLOSED, READY_FOR_QC→CLOSED/REOPENED, CLOSED→REOPENED
- **ADMIN / SUPER_ADMIN:** OPEN→IN_PROGRESS, IN_PROGRESS→READY_FOR_QC, REOPENED→IN_PROGRESS`,
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'Updated ticket' },
          400: { description: 'Invalid status transition for current role' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires QC, ADMIN, or SUPER_ADMIN' },
          404: { description: 'Ticket not found' },
        },
      },
      params: t.Object({ id: t.String({ description: 'Ticket ID' }) }),
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        priority: t.Optional(
          t.Union([t.Literal('LOW'), t.Literal('MEDIUM'), t.Literal('HIGH'), t.Literal('CRITICAL')]),
        ),
        route: t.Optional(t.Nullable(t.String())),
        status: t.Optional(
          t.Union(
            [
              t.Literal('OPEN'),
              t.Literal('IN_PROGRESS'),
              t.Literal('READY_FOR_QC'),
              t.Literal('REOPENED'),
              t.Literal('CLOSED'),
            ],
            { description: 'New status (must be an allowed transition for your role)' },
          ),
        ),
        assigneeId: t.Optional(t.Nullable(t.String())),
      }),
    },
  )

  .post(
    '/api/tickets/:id/comments',
    async ({ body, params, set, authUser }) => {
      const guard = guardQcOrAdmin(authUser)
      if (guard) return guard
      const ticket = await prisma.ticket.findFirst({ where: { id: params.id, ...notDeleted }, select: { id: true } })
      if (!ticket) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      if (!body.body?.trim()) {
        set.status = 400
        return { error: 'body wajib diisi' }
      }

      const comment = await prisma.ticketComment.create({
        data: {
          ticketId: params.id,
          authorId: authUser!.id,
          authorTag: authUser!.role === 'QC' ? 'QC' : authUser!.role === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN',
          body: body.body,
        },
        include: { author: { select: { id: true, name: true, email: true, role: true } } },
      })
      return { comment }
    },
    {
      detail: {
        summary: 'Add comment to ticket',
        description:
          "Adds a comment. The authorTag is set automatically based on the user's role (QC / ADMIN / SUPER_ADMIN).",
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'Created comment' },
          400: { description: 'Empty comment body' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires QC, ADMIN, or SUPER_ADMIN' },
          404: { description: 'Ticket not found' },
        },
      },
      params: t.Object({ id: t.String({ description: 'Ticket ID' }) }),
      body: t.Object({ body: t.String({ minLength: 1, description: 'Comment text' }) }),
    },
  )

  .post(
    '/api/tickets/:id/evidence',
    async ({ body, params, set, authUser }) => {
      const guard = guardQcOrAdmin(authUser)
      if (guard) return guard
      const ticket = await prisma.ticket.findFirst({ where: { id: params.id, ...notDeleted }, select: { id: true } })
      if (!ticket) {
        set.status = 404
        return { error: 'Ticket not found' }
      }
      if (!body.kind || !body.url) {
        set.status = 400
        return { error: 'kind dan url wajib diisi' }
      }

      const evidence = await prisma.ticketEvidence.create({
        data: { ticketId: params.id, kind: body.kind, url: body.url, note: body.note ?? null },
      })
      return { evidence }
    },
    {
      detail: {
        summary: 'Attach evidence to ticket',
        description: 'Attach a file path, commit hash, screenshot URL, or test log to the ticket.',
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'Attached evidence' },
          400: { description: 'Missing kind or url' },
          401: { description: 'Unauthenticated' },
          403: { description: 'Forbidden — requires QC, ADMIN, or SUPER_ADMIN' },
          404: { description: 'Ticket not found' },
        },
      },
      params: t.Object({ id: t.String({ description: 'Ticket ID' }) }),
      body: t.Object({
        kind: t.Union(
          [t.Literal('screenshot'), t.Literal('commit'), t.Literal('test_log'), t.Literal('trace'), t.Literal('other')],
          { description: 'Type of evidence' },
        ),
        url: t.String({ minLength: 1, description: 'File path, commit hash, or URL' }),
        note: t.Optional(t.String({ description: 'Optional note about the evidence' })),
      }),
    },
  )
