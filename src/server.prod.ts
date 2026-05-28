/// <reference types="bun-types" />
/**
 * Production-only server entry point.
 * Compiled via: bun build src/server.prod.ts --compile --target=bun-linux-x64 --outfile server
 *
 * Omits Vite dev middleware so the bundle doesn't pull in devDependencies.
 * Dev workflow unchanged — use src/serve.ts as before.
 *
 * TODO: Review API_PREFIXES and startup tasks to match this project.
 */

import fs from 'node:fs'
import path from 'node:path'
import { env } from './lib/env'
import { runMigrations } from './lib/migrate'

// ─── Route Classification ──────────────────────────────
// Add any project-specific prefixes (e.g. '/download/', '/install/', '/mcp')
const API_PREFIXES = ['/api/', '/webhook/', '/ws/', '/health']

function isApiRoute(pathname: string): boolean {
  return API_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/health'
}

// ─── Frontend Serving (static files from dist/) ───────
async function serveFrontend(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname
  const filePath = path.join('dist', pathname === '/' ? 'index.html' : pathname)

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const isHashed = pathname.startsWith('/assets/')
    return new Response(Bun.file(filePath), {
      headers: {
        'Cache-Control': isHashed
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
      },
    })
  }
  // SPA fallback
  const indexHtml = path.join('dist', 'index.html')
  if (fs.existsSync(indexHtml)) {
    return new Response(Bun.file(indexHtml), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  }
  return new Response('Not Found', { status: 404 })
}

// ─── Database Migration ────────────────────────────────
if (process.env.MIGRATE_ON_STARTUP !== 'false') {
  await runMigrations()
}

// ─── TODO: Add project-specific startup tasks here ────
// Examples from envman:
//   import { syncBackupCrons } from './lib/portainer-cron'
//   syncBackupCrons().catch(console.error)
//   setInterval(() => cleanupAuditLogs().catch(console.error), 24 * 60 * 60 * 1000)

// ─── Elysia App ────────────────────────────────────────
import { createApp } from './app'

const app = createApp()
  .onRequest(async ({ request }) => {
    const pathname = new URL(request.url).pathname
    if (!isApiRoute(pathname)) {
      return serveFrontend(request)
    }
  })
  .listen(env.PORT)

console.log(`Server running at http://localhost:${app.server!.port}`)
