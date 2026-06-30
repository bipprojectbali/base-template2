import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Under `bun test` (NODE_ENV=test) the suite runs destructive cleanup
// (deleteMany on every table). To guarantee it can never touch the dev/prod
// database, test mode REQUIRES a TEST_DATABASE_URL that is distinct from
// DATABASE_URL — otherwise we throw instead of silently falling back to the
// dev DB (the previous behavior wiped dev data when TEST_DATABASE_URL was
// missing or accidentally equal to DATABASE_URL).
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === 'test') {
    if (!env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL is required under NODE_ENV=test — refusing to run the destructive test suite against DATABASE_URL. Set it in .env.test (see .env.example).',
      )
    }
    if (env.TEST_DATABASE_URL === env.DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL must point at a SEPARATE database from DATABASE_URL — the test suite wipes tables on cleanup. Aborting to protect dev/prod data.',
      )
    }
    return env.TEST_DATABASE_URL
  }
  return env.DATABASE_URL!
}

function createPrismaClient() {
  // Prisma 7 requires a driver adapter for PostgreSQL.
  // Pool settings replicate Prisma 6 defaults to avoid behavior regression:
  //   connectionTimeoutMillis: 5000 (v6 default, pg default is 0 = infinite)
  //   idleTimeoutMillis: 300000     (v6 default, pg default is 10000)
  const adapter = new PrismaPg({
    connectionString: resolveDatabaseUrl(),
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 300_000,
  })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
