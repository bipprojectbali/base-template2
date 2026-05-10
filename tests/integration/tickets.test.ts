import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test'
import { createTestApp, seedTestUser, createTestSession, cleanupTestData, prisma } from '../helpers'

const app = createTestApp()

let superAdminId: string
let adminId: string
let qcId: string
let userId: string
let saCookie: string
let adminCookie: string
let qcCookie: string
let userCookie: string

beforeAll(async () => {
  await cleanupTestData()
  const sa = await seedTestUser('sa@tickets.test', 'pass123', 'SA', 'SUPER_ADMIN')
  const adm = await seedTestUser('adm@tickets.test', 'pass123', 'Admin', 'ADMIN')
  const qc = await seedTestUser('qc@tickets.test', 'pass123', 'QC', 'QC')
  const usr = await seedTestUser('usr@tickets.test', 'pass123', 'User', 'USER')
  superAdminId = sa.id
  adminId = adm.id
  qcId = qc.id
  userId = usr.id
  saCookie = `better-auth.session_token=${await createTestSession(superAdminId)}`
  adminCookie = `better-auth.session_token=${await createTestSession(adminId)}`
  qcCookie = `better-auth.session_token=${await createTestSession(qcId)}`
  userCookie = `better-auth.session_token=${await createTestSession(userId)}`
})

afterAll(async () => {
  await cleanupTestData()
  await prisma.$disconnect()
})

// Helper to create a ticket via API
async function createTicket(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await app.handle(new Request('http://localhost/api/tickets', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test Ticket',
      description: 'Test description',
      priority: 'MEDIUM',
      ...overrides,
    }),
  }))
  return res
}

describe('GET /api/tickets', () => {
  test('returns 401 without session', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets'))
    expect(res.status).toBe(401)
  })

  test('returns 403 for USER role', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      headers: { cookie: userCookie },
    }))
    expect(res.status).toBe(403)
  })

  test('returns ticket list for QC/ADMIN/SUPER_ADMIN', async () => {
    for (const cookie of [qcCookie, adminCookie, saCookie]) {
      const res = await app.handle(new Request('http://localhost/api/tickets', {
        headers: { cookie },
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.tickets)).toBe(true)
    }
  })

  test('supports cursor pagination — returns nextCursor when more pages', async () => {
    // Create 3 tickets
    for (let i = 0; i < 3; i++) {
      await createTicket(adminCookie, { title: `Paging ${i}` })
    }

    const res = await app.handle(new Request('http://localhost/api/tickets?limit=2', {
      headers: { cookie: adminCookie },
    }))
    const body = await res.json()
    expect(body.tickets.length).toBe(2)
    expect(body.nextCursor).toBeDefined()

    // Second page
    const res2 = await app.handle(new Request(`http://localhost/api/tickets?limit=2&cursor=${body.nextCursor}`, {
      headers: { cookie: adminCookie },
    }))
    const body2 = await res2.json()
    expect(body2.tickets.length).toBeGreaterThanOrEqual(1)
    // Ensure no overlap with page 1
    const ids1 = body.tickets.map((t: any) => t.id)
    const ids2 = body2.tickets.map((t: any) => t.id)
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false)
  })

  test('excludes soft-deleted tickets', async () => {
    const res = await createTicket(adminCookie, { title: 'To Be Deleted' })
    const ticketId = (await res.json()).ticket.id

    // Soft delete it
    await prisma.ticket.update({ where: { id: ticketId }, data: { deletedAt: new Date() } })

    const listRes = await app.handle(new Request('http://localhost/api/tickets', {
      headers: { cookie: adminCookie },
    }))
    const body = await listRes.json()
    const found = body.tickets.find((t: any) => t.id === ticketId)
    expect(found).toBeUndefined()
  })
})

describe('POST /api/tickets', () => {
  test('returns 401 without session', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', description: 'Desc' }),
    }))
    expect(res.status).toBe(401)
  })

  test('returns 403 for USER role', async () => {
    const res = await createTicket(userCookie)
    expect(res.status).toBe(403)
  })

  test('creates ticket with default MEDIUM priority', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No Priority', description: 'Desc' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticket.priority).toBe('MEDIUM')
  })

  test('validates required fields', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Missing description' }),
    }))
    // 422 = Elysia body schema validation (description required), 400 = app logic
    expect([400, 422]).toContain(res.status)
  })

  test('creates with correct reporterId', async () => {
    const res = await createTicket(qcCookie, { title: 'QC ticket' })
    expect(res.status).toBe(200)
    const body = await res.json()
    // POST /api/tickets returns raw ticket (no reporter relation), check reporterId
    expect(body.ticket.reporterId).toBe(qcId)
  })
})

describe('GET /api/tickets/:id', () => {
  let ticketId: string

  beforeAll(async () => {
    const res = await createTicket(adminCookie, { title: 'Detail Test' })
    ticketId = (await res.json()).ticket.id
  })

  test('returns 401 without session', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`))
    expect(res.status).toBe(401)
  })

  test('returns ticket with comments and evidence', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      headers: { cookie: adminCookie },
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticket.id).toBe(ticketId)
    expect(Array.isArray(body.ticket.comments)).toBe(true)
    expect(Array.isArray(body.ticket.evidence)).toBe(true)
  })

  test('returns 404 for non-existent ticket', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets/nonexistent-id', {
      headers: { cookie: adminCookie },
    }))
    expect(res.status).toBe(404)
  })

  test('returns 404 for soft-deleted ticket', async () => {
    await prisma.ticket.update({ where: { id: ticketId }, data: { deletedAt: new Date() } })
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      headers: { cookie: adminCookie },
    }))
    expect(res.status).toBe(404)
    await prisma.ticket.update({ where: { id: ticketId }, data: { deletedAt: null } })
  })
})

describe('PATCH /api/tickets/:id — status transitions', () => {
  let ticketId: string

  beforeEach(async () => {
    const res = await createTicket(adminCookie, { title: 'Transition Test' })
    ticketId = (await res.json()).ticket.id
  })

  async function patch(cookie: string, data: Record<string, unknown>) {
    return app.handle(new Request(`http://localhost/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }))
  }

  test('ADMIN: OPEN → IN_PROGRESS (allowed)', async () => {
    const res = await patch(adminCookie, { status: 'IN_PROGRESS' })
    expect(res.status).toBe(200)
    expect((await res.json()).ticket.status).toBe('IN_PROGRESS')
  })

  test('QC: OPEN → CLOSED (allowed)', async () => {
    const res = await patch(qcCookie, { status: 'CLOSED' })
    expect(res.status).toBe(200)
    expect((await res.json()).ticket.status).toBe('CLOSED')
  })

  test('QC: OPEN → IN_PROGRESS (forbidden — admin only)', async () => {
    const res = await patch(qcCookie, { status: 'IN_PROGRESS' })
    expect(res.status).toBe(400)
  })

  test('ADMIN: OPEN → CLOSED (forbidden — qc only)', async () => {
    const res = await patch(adminCookie, { status: 'CLOSED' })
    expect(res.status).toBe(400)
  })

  test('CLOSED → REOPENED sets closedAt to null', async () => {
    await patch(qcCookie, { status: 'CLOSED' })
    const res = await patch(qcCookie, { status: 'REOPENED' })
    expect(res.status).toBe(200)
    const ticket = (await res.json()).ticket
    expect(ticket.status).toBe('REOPENED')
    expect(ticket.closedAt).toBeNull()
  })

  test('CLOSED sets closedAt timestamp', async () => {
    const res = await patch(qcCookie, { status: 'CLOSED' })
    expect(res.status).toBe(200)
    const ticket = (await res.json()).ticket
    expect(ticket.closedAt).not.toBeNull()
  })

  test('full flow: OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED', async () => {
    await patch(adminCookie, { status: 'IN_PROGRESS' })
    await patch(adminCookie, { status: 'READY_FOR_QC' })
    const res = await patch(qcCookie, { status: 'CLOSED' })
    expect(res.status).toBe(200)
    expect((await res.json()).ticket.status).toBe('CLOSED')
  })

  test('SUPER_ADMIN has combined QC+ADMIN transitions', async () => {
    // SA can do both ADMIN move (OPEN→IN_PROGRESS) and QC close
    const res1 = await patch(saCookie, { status: 'IN_PROGRESS' })
    expect(res1.status).toBe(200)
    const res2 = await patch(saCookie, { status: 'CLOSED' })
    expect(res2.status).toBe(200)
  })
})

describe('POST /api/tickets/:id/comments', () => {
  let ticketId: string

  beforeAll(async () => {
    const res = await createTicket(adminCookie, { title: 'Comment Test' })
    ticketId = (await res.json()).ticket.id
  })

  test('returns 401 without session', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Hi' }),
    }))
    expect(res.status).toBe(401)
  })

  test('returns 403 for USER role', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { cookie: userCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Hi' }),
    }))
    expect(res.status).toBe(403)
  })

  test('creates comment with correct authorTag', async () => {
    const cases = [
      { cookie: qcCookie, expectedTag: 'QC' },
      { cookie: adminCookie, expectedTag: 'ADMIN' },
      { cookie: saCookie, expectedTag: 'SUPER_ADMIN' },
    ]
    for (const { cookie, expectedTag } of cases) {
      const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `Comment from ${expectedTag}` }),
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.comment.authorTag).toBe(expectedTag)
    }
  })

  test('rejects empty comment body', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '   ' }),
    }))
    expect(res.status).toBe(400)
  })

  test('returns 404 for non-existent ticket', async () => {
    const res = await app.handle(new Request('http://localhost/api/tickets/nonexistent/comments', {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Hi' }),
    }))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/tickets/:id/evidence', () => {
  let ticketId: string

  beforeAll(async () => {
    const res = await createTicket(adminCookie, { title: 'Evidence Test' })
    ticketId = (await res.json()).ticket.id
  })

  test('attaches evidence with kind and url', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/evidence`, {
      method: 'POST',
      headers: { cookie: qcCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'screenshot', url: '/screenshots/bug.png', note: 'visible bug' }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.evidence.kind).toBe('screenshot')
    expect(body.evidence.url).toBe('/screenshots/bug.png')
    expect(body.evidence.note).toBe('visible bug')
  })

  test('requires kind and url', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/evidence`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'screenshot' }), // missing url
    }))
    // 422 = Elysia body schema validation (url required), 400 = app logic
    expect([400, 422]).toContain(res.status)
  })

  test('note is optional', async () => {
    const res = await app.handle(new Request(`http://localhost/api/tickets/${ticketId}/evidence`, {
      method: 'POST',
      headers: { cookie: adminCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'commit', url: 'abc123' }),
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).evidence.note).toBeNull()
  })
})
