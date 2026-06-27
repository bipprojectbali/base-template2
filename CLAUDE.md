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
bun run docs:llms       # regenerate llms.txt from project sources
bun run docs:llms:check # CI: fail if llms.txt is stale
```

`llms.txt` is an auto-generated artifact (project metadata, routes, schema, env, recent changes).
Never edit it by hand — it is rebuilt from package.json, `src/lib/routes-catalog.ts`,
`prisma/schema.prisma`, `src/lib/env-map-catalog.ts`, `CHANGELOG.md`, and `docs/`.
Also served live at `GET /llms.txt`. Logic in `src/lib/llms-generator.ts`.

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

## Migrasi Database (Wajib)

Setiap kali ada perubahan pada `prisma/schema.prisma`, **wajib** lakukan dua hal berikut
dalam commit yang sama — tidak boleh dipisah:

### 1. Jalankan migrasi lokal

```bash
bun run db:migrate      # buat migration file + apply ke DB lokal
bun run db:generate     # regenerate Prisma Client
```

Ini memastikan DB lokal sinkron dan Prisma Client up-to-date. Jangan skip meski
perubahannya kelihatan kecil — bahkan tambah `?` (optional field) tetap butuh migrasi.

### 2. Buat migration SQL untuk deploy produksi

Setiap migration yang dibuat `prisma migrate dev` menghasilkan file SQL di
`prisma/migrations/<timestamp>_<name>/migration.sql`. File ini adalah satu-satunya
cara DB produksi/staging bisa sinkron — **pastikan file ini ikut di-commit**.

Aturan menulis migration SQL yang aman untuk deploy:

- Pakai `IF NOT EXISTS` / `IF EXISTS` — idempoten, aman di-rerun.
- Kolom NOT NULL di tabel yang sudah berisi data: **wajib** kasih `DEFAULT`
  atau jalankan `UPDATE` backfill sebelum set NOT NULL. Jangan asumsikan tabel kosong.
- Jangan hapus kolom/tabel kecuali sudah dipastikan tidak ada kode yang masih membacanya.
- Untuk rename kolom: buat kolom baru + backfill + hapus kolom lama dalam 2 deployment
  terpisah (blue-green safe), bukan satu ALTER RENAME langsung.

### Checklist sebelum commit perubahan schema

- [ ] `bun run db:migrate` berhasil (migration file terbuat di `prisma/migrations/`)
- [ ] `bun run db:generate` berhasil (Prisma Client terupdate)
- [ ] `bun run typecheck` hijau (tidak ada type error akibat field baru/hilang)
- [ ] File `prisma/migrations/<timestamp>_*/migration.sql` ikut di-commit
- [ ] Tidak ada `findMany` / query baru yang mengakses field tanpa migration-nya

### Kenapa ini wajib

Schema drift adalah penyebab paling umum crash di prod/staging:
`column does not exist`, `relation does not exist`, `null constraint violation`.
Prisma Client di-generate dari schema, tapi DB tidak berubah otomatis.
Migration adalah satu-satunya jembatan — kalau tertinggal, app jalan tapi query meledak.

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
| Aturan ukuran/struktur file | `docs/FILE-HEALTH.md` |
| Struktur project / command utama / overview | `CLAUDE.md` (file ini) |

Aturan:
- Update doc + kode dalam **commit yang sama**. Doc yang ketinggalan =
  bug bagi sesi AI berikutnya.
- Kalau perubahan menghapus/rename sesuatu yang disebut di doc, hapus
  juga di doc — jangan biarkan referensi mati.
- Pengecualian: refactor murni internal yang tidak mengubah kontrak
  publik atau perilaku yang dijanjikan doc. Kalau ragu, update.

## Detail Docs

See @docs/AUTH.md
See @docs/API.md
See @docs/FRONTEND.md
See @docs/DATABASE.md
See @docs/FILE-HEALTH.md
