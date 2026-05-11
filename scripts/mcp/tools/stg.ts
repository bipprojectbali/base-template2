import { z } from 'zod'
import { jsonText, errText, type ToolModule } from './shared'

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '') ?? ''
const MCP_SECRET = process.env.MCP_SECRET ?? ''

function stgHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${MCP_SECRET}`,
  }
}

async function stgFetch(path: string, init?: RequestInit) {
  if (!BASE_URL) throw new Error('BASE_URL env not set for debug-stg')
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, { ...init, headers: { ...stgHeaders(), ...(init?.headers as Record<string, string> | undefined) } })
  const body = await res.text()
  let data: unknown
  try { data = JSON.parse(body) } catch { data = body }
  return { status: res.status, ok: res.ok, data }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function stgResult(r: { status: number; ok: boolean; data: unknown }) {
  if (!r.ok) {
    return errText(`STG ${r.status}: ${JSON.stringify(r.data)}`)
  }
  return jsonText(r.data)
}

// ─── module ─────────────────────────────────────────────────────────────────

export const stgTools: ToolModule = {
  name: 'stg',
  scope: 'admin',
  register(server) {

    // ── connectivity ──────────────────────────────────────────────────────

    server.registerTool(
      'stg_health',
      {
        title: 'STG: Health check',
        description: 'Ping the staging runtime: DB + Redis + uptime. Use to verify STG is up before comparing with local.',
        inputSchema: {},
      },
      async () => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'health_full', input: {} }),
      })),
    )

    server.registerTool(
      'stg_ping',
      {
        title: 'STG: Ping /health',
        description: 'Simple GET /health check on staging. Fastest connectivity probe.',
        inputSchema: {},
      },
      async () => {
        const r = await stgFetch('/health')
        return jsonText({ status: r.status, body: r.data, baseUrl: BASE_URL })
      },
    )

    // ── app logs ──────────────────────────────────────────────────────────

    server.registerTool(
      'stg_logs_app',
      {
        title: 'STG: App logs',
        description: 'Tail the Redis app log buffer on staging. Use to see recent request/error activity in STG runtime.',
        inputSchema: {
          level: z.enum(['info', 'warn', 'error']).optional(),
          limit: z.number().int().min(1).max(500).default(100),
          afterId: z.number().int().optional(),
          search: z.string().optional().describe('Substring match on message'),
        },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'logs_app', input }),
      })),
    )

    // ── audit logs ────────────────────────────────────────────────────────

    server.registerTool(
      'stg_logs_audit',
      {
        title: 'STG: Audit logs',
        description: 'Fetch audit trail from staging DB. Useful to see user login/logout/role events on STG.',
        inputSchema: {
          userId: z.string().optional(),
          action: z.string().optional(),
          sinceISO: z.string().optional(),
          limit: z.number().int().min(1).max(1000).default(100),
        },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'logs_audit', input }),
      })),
    )

    // ── users ─────────────────────────────────────────────────────────────

    server.registerTool(
      'stg_list_users',
      {
        title: 'STG: List users',
        description: 'List all users on staging (role, blocked status, createdAt). Compare with local to spot data drift.',
        inputSchema: {
          role: z.enum(['USER', 'QC', 'ADMIN', 'SUPER_ADMIN']).optional(),
          blocked: z.boolean().optional(),
          search: z.string().optional().describe('Substring match on name or email'),
          limit: z.number().int().min(1).max(500).default(50),
        },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'db_list_users', input }),
      })),
    )

    server.registerTool(
      'stg_get_user',
      {
        title: 'STG: Get user',
        description: 'Fetch a single user by id or email on staging, including active session count.',
        inputSchema: {
          id: z.string().optional(),
          email: z.string().email().optional(),
        },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'db_get_user', input }),
      })),
    )

    // ── sessions ──────────────────────────────────────────────────────────

    server.registerTool(
      'stg_sessions',
      {
        title: 'STG: Sessions',
        description: 'List active sessions on staging. Useful to verify auth state or find stuck sessions.',
        inputSchema: {
          userId: z.string().optional(),
          active: z.boolean().optional().describe('true = not expired, false = expired'),
          limit: z.number().int().min(1).max(500).default(50),
        },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'db_list_sessions', input }),
      })),
    )

    // ── presence ──────────────────────────────────────────────────────────

    server.registerTool(
      'stg_presence',
      {
        title: 'STG: Online users',
        description: 'List currently connected users (WebSocket presence) on staging.',
        inputSchema: {},
      },
      async () => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'presence_online', input: {} }),
      })),
    )

    // ── redis ─────────────────────────────────────────────────────────────

    server.registerTool(
      'stg_redis_info',
      {
        title: 'STG: Redis info',
        description: 'Ping Redis on staging and return latency.',
        inputSchema: {},
      },
      async () => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'redis_info', input: {} }),
      })),
    )

    server.registerTool(
      'stg_redis_get',
      {
        title: 'STG: Redis GET',
        description: 'Get a Redis key value on staging. Useful to inspect session cache or feature flags.',
        inputSchema: { key: z.string() },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'redis_get', input }),
      })),
    )

    server.registerTool(
      'stg_redis_keys',
      {
        title: 'STG: Redis KEYS',
        description: 'List Redis keys matching a pattern on staging.',
        inputSchema: {
          pattern: z.string().default('*'),
          limit: z.number().int().min(1).max(1000).default(200),
        },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'redis_keys', input }),
      })),
    )

    // ── tickets ───────────────────────────────────────────────────────────

    server.registerTool(
      'stg_ticket_list',
      {
        title: 'STG: List tickets',
        description: 'List tickets on staging. Use to compare ticket state between STG and local.',
        inputSchema: {
          status: z.enum(['OPEN', 'IN_PROGRESS', 'READY_FOR_QC', 'REOPENED', 'CLOSED', 'ACTIVE', 'ALL']).default('ACTIVE'),
          priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'ticket_list', input }),
      })),
    )

    server.registerTool(
      'stg_ticket_get',
      {
        title: 'STG: Get ticket',
        description: 'Fetch a ticket with comments and evidence from staging.',
        inputSchema: { id: z.string() },
      },
      async (input) => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'ticket_get', input }),
      })),
    )

    // ── raw API call ──────────────────────────────────────────────────────

    server.registerTool(
      'stg_api',
      {
        title: 'STG: Raw API call',
        description: 'Make an arbitrary HTTP request to staging. Use for endpoints not covered by other tools (e.g. /api/version, /api/admin/routes, custom routes).',
        inputSchema: {
          method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
          path: z.string().describe('Path relative to BASE_URL, e.g. /api/version'),
          body: z.string().optional().describe('JSON body string for POST/PUT/PATCH'),
          bearerToken: z.string().optional().describe('Override Authorization header (e.g. user session token)'),
        },
      },
      async ({ method, path, body, bearerToken }) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (bearerToken) {
          headers.Authorization = `Bearer ${bearerToken}`
        }
        const r = await stgFetch(path, { method, body: body ?? undefined, headers })
        return jsonText({ status: r.status, ok: r.ok, data: r.data })
      },
    )

    // ── compare ───────────────────────────────────────────────────────────

    server.registerTool(
      'stg_compare_routes',
      {
        title: 'STG vs Local: Compare API routes',
        description: 'Fetch route metadata from both STG and local, then return a diff summary. Helps detect missing or extra routes after a deploy.',
        inputSchema: {
          localBaseUrl: z.string().default('http://localhost:3111').describe('Local dev server base URL'),
          localSecret: z.string().optional().describe('MCP_SECRET for local (defaults to same as STG secret)'),
        },
      },
      async ({ localBaseUrl, localSecret }) => {
        const localUrl = localBaseUrl.replace(/\/$/, '')
        const localAuth = `Bearer ${localSecret ?? MCP_SECRET}`
        const [stgRes, localRes] = await Promise.all([
          stgFetch('/api/admin/routes'),
          fetch(`${localUrl}/api/admin/routes`, {
            headers: { Authorization: localAuth },
          }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => null) })),
        ])

        const stgRoutes: string[] = stgRes.ok
          ? (stgRes.data as any)?.routes?.map((r: any) => `${r.method} ${r.path}`) ?? []
          : []
        const localRoutes: string[] = localRes.ok
          ? (localRes.data as any)?.routes?.map((r: any) => `${r.method} ${r.path}`) ?? []
          : []

        const stgSet = new Set(stgRoutes)
        const localSet = new Set(localRoutes)
        const onlyInStg = stgRoutes.filter((r) => !localSet.has(r))
        const onlyInLocal = localRoutes.filter((r) => !stgSet.has(r))

        return jsonText({
          stgRouteCount: stgRoutes.length,
          localRouteCount: localRoutes.length,
          onlyInStg,
          onlyInLocal,
          identical: onlyInStg.length === 0 && onlyInLocal.length === 0,
        })
      },
    )

    server.registerTool(
      'stg_compare_env',
      {
        title: 'STG vs Local: Compare env vars',
        description: 'Fetch env-map (set/unset status) from STG and local, then diff which vars are missing on either side.',
        inputSchema: {
          localBaseUrl: z.string().default('http://localhost:3111').describe('Local dev server base URL'),
          localSecret: z.string().optional(),
        },
      },
      async ({ localBaseUrl, localSecret }) => {
        const localUrl = localBaseUrl.replace(/\/$/, '')
        const localAuth = `Bearer ${localSecret ?? MCP_SECRET}`
        const [stgRes, localRes] = await Promise.all([
          stgFetch('/api/admin/env-map'),
          fetch(`${localUrl}/api/admin/env-map`, {
            headers: { Authorization: localAuth },
          }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => null) })),
        ])

        type EnvEntry = { key: string; set: boolean }
        const stgEnv: EnvEntry[] = stgRes.ok ? (stgRes.data as any)?.vars ?? [] : []
        const localEnv: EnvEntry[] = localRes.ok ? (localRes.data as any)?.vars ?? [] : []

        const stgMap = Object.fromEntries(stgEnv.map((e) => [e.key, e.set]))
        const localMap = Object.fromEntries(localEnv.map((e) => [e.key, e.set]))
        const allKeys = [...new Set([...Object.keys(stgMap), ...Object.keys(localMap)])]

        const diff = allKeys.map((key) => ({
          key,
          stg: stgMap[key] ?? null,
          local: localMap[key] ?? null,
          mismatch: stgMap[key] !== localMap[key],
        }))

        return jsonText({
          totalKeys: allKeys.length,
          mismatches: diff.filter((d) => d.mismatch),
          all: diff,
        })
      },
    )

    server.registerTool(
      'stg_compare_schema',
      {
        title: 'STG vs Local: Compare DB schema',
        description: 'Fetch parsed Prisma schema from both STG and local, diff model/field lists. Useful to detect missing migrations on STG.',
        inputSchema: {
          localBaseUrl: z.string().default('http://localhost:3111'),
          localSecret: z.string().optional(),
        },
      },
      async ({ localBaseUrl, localSecret }) => {
        const localUrl = localBaseUrl.replace(/\/$/, '')
        const localAuth = `Bearer ${localSecret ?? MCP_SECRET}`
        const [stgRes, localRes] = await Promise.all([
          stgFetch('/api/admin/schema'),
          fetch(`${localUrl}/api/admin/schema`, {
            headers: { Authorization: localAuth },
          }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => null) })),
        ])

        type ModelDef = { name: string; fields: { name: string; type: string }[] }
        const stgModels: ModelDef[] = stgRes.ok ? (stgRes.data as any)?.models ?? [] : []
        const localModels: ModelDef[] = localRes.ok ? (localRes.data as any)?.models ?? [] : []

        const stgMap = Object.fromEntries(stgModels.map((m) => [m.name, m.fields.map((f) => `${f.name}:${f.type}`)]))
        const localMap = Object.fromEntries(localModels.map((m) => [m.name, m.fields.map((f) => `${f.name}:${f.type}`)]))
        const allModels = [...new Set([...Object.keys(stgMap), ...Object.keys(localMap)])]

        const diff = allModels.map((model) => {
          const stgFields = new Set(stgMap[model] ?? [])
          const localFields = new Set(localMap[model] ?? [])
          return {
            model,
            onlyInStg: [...stgFields].filter((f) => !localFields.has(f)),
            onlyInLocal: [...localFields].filter((f) => !stgFields.has(f)),
          }
        }).filter((d) => d.onlyInStg.length > 0 || d.onlyInLocal.length > 0)

        return jsonText({
          stgModelCount: stgModels.length,
          localModelCount: localModels.length,
          schemaDiff: diff,
          identical: diff.length === 0,
        })
      },
    )

    server.registerTool(
      'stg_compare_migrations',
      {
        title: 'STG vs Local: Compare migrations',
        description: 'Fetch migration timeline from both STG and local, show which are applied on STG but not local and vice versa.',
        inputSchema: {
          localBaseUrl: z.string().default('http://localhost:3111'),
          localSecret: z.string().optional(),
        },
      },
      async ({ localBaseUrl, localSecret }) => {
        const localUrl = localBaseUrl.replace(/\/$/, '')
        const localAuth = `Bearer ${localSecret ?? MCP_SECRET}`
        const [stgRes, localRes] = await Promise.all([
          stgFetch('/api/admin/migrations'),
          fetch(`${localUrl}/api/admin/migrations`, {
            headers: { Authorization: localAuth },
          }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => null) })),
        ])

        type Mig = { name: string; appliedAt?: string }
        const stgMigs: Mig[] = stgRes.ok ? (stgRes.data as any)?.migrations ?? [] : []
        const localMigs: Mig[] = localRes.ok ? (localRes.data as any)?.migrations ?? [] : []
        const stgNames = new Set(stgMigs.map((m) => m.name))
        const localNames = new Set(localMigs.map((m) => m.name))

        return jsonText({
          stgCount: stgMigs.length,
          localCount: localMigs.length,
          onlyInStg: stgMigs.filter((m) => !localNames.has(m.name)).map((m) => m.name),
          onlyInLocal: localMigs.filter((m) => !stgNames.has(m.name)).map((m) => m.name),
          identical: stgMigs.length === localMigs.length && stgMigs.every((m) => localNames.has(m.name)),
        })
      },
    )

    server.registerTool(
      'stg_compare_users',
      {
        title: 'STG vs Local: Compare user count & roles',
        description: 'Quick summary of user counts per role on STG vs local. Useful to spot if seed data or migrations diverged.',
        inputSchema: {
          localBaseUrl: z.string().default('http://localhost:3111'),
          localSecret: z.string().optional(),
        },
      },
      async ({ localBaseUrl, localSecret }) => {
        const localUrl = localBaseUrl.replace(/\/$/, '')
        const localAuth = `Bearer ${localSecret ?? MCP_SECRET}`
        const [stgRes, localRes] = await Promise.all([
          stgFetch('/mcp', { method: 'POST', body: JSON.stringify({ tool: 'db_list_users', input: { limit: 500 } }) }),
          fetch(`${localUrl}/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: localAuth },
            body: JSON.stringify({ tool: 'db_list_users', input: { limit: 500 } }),
          }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => null) })),
        ])

        type User = { role: string; blocked: boolean }
        function summarizeUsers(users: User[]) {
          const byRole: Record<string, number> = {}
          let blocked = 0
          for (const u of users) {
            byRole[u.role] = (byRole[u.role] ?? 0) + 1
            if (u.blocked) blocked++
          }
          return { total: users.length, byRole, blocked }
        }

        const stgUsers: User[] = stgRes.ok ? (stgRes.data as any)?.users ?? [] : []
        const localUsers: User[] = localRes.ok ? (localRes.data as any)?.users ?? [] : []

        return jsonText({
          stg: summarizeUsers(stgUsers),
          local: summarizeUsers(localUsers),
        })
      },
    )

    // ── db table counts ───────────────────────────────────────────────────

    server.registerTool(
      'stg_db_counts',
      {
        title: 'STG: DB table row counts',
        description: 'Row counts for each primary table on staging.',
        inputSchema: {},
      },
      async () => stgResult(await stgFetch('/mcp', {
        method: 'POST',
        body: JSON.stringify({ tool: 'db_count_by_table', input: {} }),
      })),
    )
  },
}
