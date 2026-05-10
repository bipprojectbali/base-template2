import { Elysia, t } from 'elysia'
import { betterAuthPlugin } from '../../lib/auth-middleware'
import { prisma } from '../../lib/db'
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

const SessionEntrySchema = t.Object({
  id: t.String(),
  userId: t.String(),
  userName: t.String(),
  userEmail: t.String(),
  userRole: t.String(),
  userBlocked: t.Boolean(),
  isOnline: t.Boolean(),
  createdAt: t.String(),
  expiresAt: t.String(),
  isExpired: t.Boolean(),
})

export const adminInfoRouter = new Elysia({ tags: ['Admin — Info'] })
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
      // Docs
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

    return {
      routes,
      summary: { total: routes.length, byMethod, byAuth, byCategory },
    }
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

  .get('/api/admin/project-structure', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
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
      if (!absDir || !fs.existsSync(absDir)) return
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
      summary: { totalFiles: files.length, totalLines, totalExports, totalImports, byCategory },
    }
  }, {
    detail: {
      summary: 'Project file structure',
      description: 'Scans src/, prisma/, tests/ and returns file list with line counts, exports, and imports.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'File structure with summary' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })

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
      { name: 'HMR_PORT', envKey: 'HMR_PORT', required: false, default: '24678', category: 'app', description: 'Vite HMR WebSocket port (dev only) — set per instance to avoid collision' },
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

  .get('/api/admin/test-coverage', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
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
    for (const tf of testFiles) {
      for (const target of tf.targets) {
        if (!testedByMap[target]) testedByMap[target] = []
        testedByMap[target].push(tf.path)
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
      const coverage = tb.length === 0 ? 'uncovered' : tb.some((tf) => tf.includes('/unit/')) ? 'covered' : 'partial'
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
        coveragePercent: Math.round(((covered + partial * 0.5) / sourceFiles.length) * 100),
      },
    }
  }, {
    detail: {
      summary: 'Test coverage mapping',
      description: 'Maps source files to their test files. Coverage: covered (unit), partial (integration only), uncovered.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Coverage report' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })

  .get('/api/admin/dependencies', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    const root = process.cwd()
    const pkgPath = pathMod.join(root, 'package.json')
    if (!fs.existsSync(pkgPath)) return { error: 'package.json not found' }

    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const deps: Record<string, string> = pkgJson.dependencies || {}
    const devDeps: Record<string, string> = pkgJson.devDependencies || {}

    const catMap: Record<string, string> = {
      elysia: 'server', '@elysiajs/cors': 'server', '@elysiajs/html': 'server', '@elysiajs/swagger': 'server',
      'better-auth': 'auth',
      react: 'ui', 'react-dom': 'ui', '@mantine/core': 'ui', '@mantine/hooks': 'ui',
      '@tanstack/react-router': 'ui', '@tanstack/react-query': 'ui', '@xyflow/react': 'ui', 'react-icons': 'ui',
      '@prisma/client': 'database', prisma: 'database',
      vite: 'build', typescript: 'build', '@biomejs/biome': 'build', '@vitejs/plugin-react': 'build',
    }

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
  }, {
    detail: {
      summary: 'NPM dependency graph',
      description: 'Lists all runtime and dev dependencies from package.json with version, category, and which source files import them.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Dependency list with summary' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })

  .get('/api/admin/migrations', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
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
        totalChanges,
      },
    }
  }, {
    detail: {
      summary: 'Migration timeline',
      description: 'Lists all Prisma migrations with creation date, SQL changes summary, and SQL snippet (first 800 chars).',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Migration list with summary' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })

  .get('/api/admin/sessions', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    const onlineIds = new Set(getOnlineUserIds())
    const sessions = await prisma.session.findMany({
      include: { user: { select: { id: true, name: true, email: true, role: true, blocked: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const now = new Date()
    const result = sessions.map((s: typeof sessions[number]) => ({
      id: s.id,
      userId: s.user.id,
      userName: s.user.name,
      userEmail: s.user.email,
      userRole: s.user.role,
      userBlocked: s.user.blocked,
      isOnline: onlineIds.has(s.user.id),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isExpired: s.expiresAt < now,
    }))

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
      summary: { totalSessions: result.length, activeSessions: active, expiredSessions: expired, onlineUsers: onlineIds.size, byRole },
    }
  }, {
    detail: {
      summary: 'Active sessions',
      description: 'Lists all sessions (max 200, newest first) with online status and expiry. Includes role breakdown.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Sessions with summary' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    },
  })
