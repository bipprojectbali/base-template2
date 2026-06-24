import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Under `bun test` (NODE_ENV=test) prefer TEST_DATABASE_URL so the suite's
// destructive cleanup never touches the dev/prod database.
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === 'test' && env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL
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
