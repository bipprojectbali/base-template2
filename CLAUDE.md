# Bun Base Template

## Runtime & Tooling

Default to **Bun** — never Node.js/npm/npx/ts-node.

```bash
bun <file>              # run file
bun test                # run tests (not jest/vitest)
bun install             # install deps
bun run <script>        # run package.json script
bunx <pkg> <cmd>        # execute package binary
```

Bun auto-loads `.env` — don't use dotenv.

## Build & Dev

```bash
bun run dev             # dev server with HMR (port from .env PORT, default 3111)
bun run build           # Vite production build
bun run start           # production server
bun run typecheck       # tsc --noEmit
bun run lint            # biome check
bun run lint:fix        # biome check --write
```

## Testing

```bash
bun run test              # all tests
bun run test:unit         # tests/unit/
bun run test:integration  # tests/integration/ — API via app.handle(), no server needed
```

Helpers in `tests/helpers.ts`: `createTestApp()`, `seedTestUser()`, `createTestSession()`, `cleanupTestData()`

## Database

```bash
bun run db:migrate      # prisma migrate dev
bun run db:seed         # seed demo users
bun run db:generate     # regenerate prisma client
```

## Project Structure

```
src/
  app.ts              # Elysia app factory — all API routes, exported as createApp()
  index.tsx           # Server entry — Vite middleware (dev) / static files (prod)
  serve.ts            # Dev entry: bun --watch src/serve.ts
  lib/
    auth.ts           # Better Auth instance
    auth-middleware.ts # Elysia derive plugin (authUser)
    auth-client.ts    # Better Auth React client
    db.ts             # Prisma singleton — import { prisma }
    redis.ts          # Bun.RedisClient singleton — import { redis }
    applog.ts         # Redis-backed app log ring buffer
    env.ts            # Typed env vars
  frontend/
    router.ts         # Single source of truth for navigation
    routes/           # One file per route, export named *Route const
    hooks/            # useAuth, usePresence
    components/       # ThemeToggle, TicketsPanel, NotFound, ErrorPage
prisma/
  schema.prisma       # DB schema
  seed.ts             # Demo users (scrypt passwords, stored in Account table)
tests/
  helpers.ts          # Test utilities
  unit/               # Env, DB connection, password
  integration/        # API endpoint tests
```

## Update Dokumentasi (Wajib)

Setiap kali menyentuh **business logic** — auth flow, role/permission,
ticket lifecycle, endpoint baru/berubah, schema Prisma, key Redis,
WS channel, MCP tool, env var, atau aturan kerja AI — **wajib** update
dokumentasi yang relevan di commit yang sama:

| Yang Disentuh | Dokumen yang Harus Diupdate |
|---------------|-----------------------------|
| Endpoint API (tambah/ubah/hapus) | `docs/API.md` |
| Auth / role / session | `docs/AUTH.md` |
| Schema Prisma / Redis namespace | `docs/DATABASE.md` |
| Frontend route / hook / komponen utama | `docs/FRONTEND.md` |
| MCP tool baru / berubah | `docs/MCP.md` |
| Aturan/kontrak kerja AI | `docs/AI_CONTRACT.md` |
| Checklist saat tambah fitur | `docs/FEATURE-CHECKLIST.md` |
| Aturan ukuran/struktur file | `docs/FILE-HEALTH.md` |
| Strategi scaling / performance | `docs/SCALING.md` |
| Struktur project / command utama / overview | `CLAUDE.md` (file ini) |

Aturan:
- Update doc + kode dalam **commit yang sama**. Doc yang ketinggalan =
  bug bagi sesi AI berikutnya.
- Kalau perubahan menghapus/rename sesuatu yang disebut di doc, hapus
  juga di doc — jangan biarkan referensi mati.
- Pengecualian: refactor murni internal yang tidak mengubah kontrak
  publik atau perilaku yang dijanjikan doc. Kalau ragu, update.

## Detail Docs

See @docs/AI_CONTRACT.md
See @docs/SCALING.md
See @docs/AUTH.md
See @docs/API.md
See @docs/FRONTEND.md
See @docs/DATABASE.md
See @docs/MCP.md
See @docs/FILE-HEALTH.md
See @docs/FEATURE-CHECKLIST.md
See @docs/SPLIT-CLAUDE.md
