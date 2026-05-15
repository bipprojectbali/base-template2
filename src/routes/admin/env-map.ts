import { Elysia } from 'elysia'
import { betterAuthPlugin } from '../../lib/auth-middleware'
import { guardSuperAdmin } from '../../lib/route-helpers'

export const adminEnvMapRouter = new Elysia({ tags: ['Admin — Info'] })
  .use(betterAuthPlugin)

  .get('/api/admin/env-map', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
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
      { name: 'HMR_PORT', envKey: 'HMR_PORT', required: false, default: '24678', category: 'app', description: 'Vite HMR WebSocket port (dev only)' },
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
      summary: { total: variables.length, set: setCount, unset: variables.length - setCount, required: requiredCount, byCategory },
    }
  }, {
    detail: {
      summary: 'Environment variables map',
      description: 'Lists all env vars referenced in the codebase with their set/unset status, category, and which files use them.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Env var list with summary' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })
