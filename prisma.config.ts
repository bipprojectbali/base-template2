import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun run prisma/seed.ts',
  },
  datasource: {
    // Migrations need a session-level connection (advisory lock + DDL tx),
    // which PgBouncer transaction-mode doesn't support. Prefer DIRECT_URL;
    // fall back to DATABASE_URL for local dev without a pooler.
    url: process.env.DIRECT_URL || env('DATABASE_URL'),
  },
})
