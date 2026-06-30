# Database & Storage

## PostgreSQL (Prisma v6)

Client generated to `./generated/prisma` (gitignored). Import via `src/lib/db.ts`:
```ts
import { prisma } from './lib/db'
```

Commands: `bun run db:migrate` | `bun run db:seed` | `bun run db:generate`

### Test Database Isolation

`bun test` sets `NODE_ENV=test` automatically. When set, `src/lib/db.ts`
(`resolveDatabaseUrl()`) connects to **`TEST_DATABASE_URL`** instead of
`DATABASE_URL`, so the suite's destructive `cleanupTestData()` never wipes the
dev/prod database.

**Fail-closed, not fail-open.** Under `NODE_ENV=test`, `resolveDatabaseUrl()`
**throws** if `TEST_DATABASE_URL` is unset, or if it equals `DATABASE_URL` —
it never silently falls back to the dev DB. `cleanupTestData()` runs the same
check (`assertTestDatabase()`) as a final guard before deleting rows. This is
defense-in-depth: a misconfigured env aborts the run instead of wiping dev data.

**Where `TEST_DATABASE_URL` lives — `.env.test`, not `.env`.** `bun test` loads
`.env.test` in addition to `.env`. Due to a Bun precedence quirk
([#6840](https://github.com/oven-sh/bun/issues/6840)), a variable present in
**both** files takes its value from `.env` — so you cannot override `DATABASE_URL`
from `.env.test`. The test DB therefore uses its **own** variable,
`TEST_DATABASE_URL`, defined **only** in `.env.test` (gitignored). Keeping it out
of `.env` guarantees the dev DB and the wiped test DB never share a config
surface. Template: `.env.test.example`.

Setup once:
```bash
createdb base-template-test
cp .env.test.example .env.test          # then edit the URL
DATABASE_URL="postgresql://.../base-template-test" bun run db:migrate
```

### Schema (`prisma/schema.prisma`)

| Model | Key Fields |
|-------|-----------|
| `User` | id, name, email, password?, role, blocked, emailVerified, image, timestamps |
| `Session` | id, token (unique), userId, expiresAt, ipAddress, userAgent, timestamps |
| `Account` | id, accountId, providerId, userId, password? — Better Auth credential storage |
| `Verification` | id, identifier, value, expiresAt — Better Auth email verification |
| `AuditLog` | id, userId?, action, detail?, ip?, createdAt |
| `Ticket` | id, title, description, status, priority, route?, reporterId, assigneeId?, timestamps, closedAt? |
| `TicketComment` | id, ticketId, authorId?, authorTag, body, createdAt |
| `TicketEvidence` | id, ticketId, kind, url, note?, createdAt |

Enums: `Role` = `USER | QC | ADMIN | SUPER_ADMIN`; `TicketStatus` = `OPEN | IN_PROGRESS | READY_FOR_QC | REOPENED | CLOSED`; `TicketPriority` = `LOW | MEDIUM | HIGH | CRITICAL`

### Seed (`prisma/seed.ts`)

Uses scrypt (`node:crypto`) — same format as Better Auth (`salt:hex`). Stores password in `Account` table (not `User.password`).
Demo users: `superadmin@example.com / superadmin123`, `admin@example.com / admin123`, `user@example.com / user123`

## Redis

Bun native `Bun.RedisClient` — no external package. Import via `src/lib/redis.ts`:
```ts
import { redis } from './lib/redis'
```

### Key Namespaces

| Key Pattern | Content | Owner |
|-------------|---------|-------|
| `ba:kv:<token>` | `{ session, user }` JSON — Better Auth session cache | Better Auth |
| `ba:kv:active-sessions-<userId>` | `[{ token, expiresAt }]` — active session list | Better Auth |
| `app:logs` | Redis List, max 500 entries (LTRIM) | `src/lib/applog.ts` |
| `app:logs:next_id` | Auto-increment for log IDs | `src/lib/applog.ts` |

### App Logs (`src/lib/applog.ts`)

```ts
appLog(level, message, detail?)   // 'info' | 'warn' | 'error'
getAppLogs({ level?, limit?, afterId? })
clearAppLogs()
```

Logs API requests via `onAfterResponse` hook (skips `/api/auth/*`). Auto-rotates to 500 entries.

## Audit Logs (DB)

Persistent user activity trail in `AuditLog` table.
Actions: `LOGIN`, `LOGOUT`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `ROLE_CHANGED`, `BLOCKED`, `UNBLOCKED`, `TICKET_CREATED`, `TICKET_UPDATED`
Auto-cleanup: records older than `AUDIT_LOG_RETENTION_DAYS` (default 90) — runs on startup + every 24h.
