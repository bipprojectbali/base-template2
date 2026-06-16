# RECON — Project Reconnaissance

Generated: 2026-06-16 oleh AI QA Agent
Last verified: 2026-06-16
Source: analisa otonom dari codebase + environment

---

## 1. Tech Stack

| Komponen   | Teknologi              | Versi    | Catatan                                          |
| ---------- | ---------------------- | -------- | ------------------------------------------------ |
| Runtime    | Bun                    | 1.3.14   | Menggantikan Node.js sepenuhnya                  |
| Framework  | Elysia                 | ~1.2.x   | Backend HTTP + WS                                |
| ORM        | Prisma                 | v7       | Requires `PrismaPg` driver adapter               |
| Auth       | Better Auth            | v1.6.9   | Session-based, scrypt, signed cookies, Redis     |
| Frontend   | React 19 + TanStack Router (static) | — | No codegen, route files manual |
| Bundler    | Vite 8                 | —        | Middleware mode di dev                           |
| DB         | PostgreSQL              | —        | via Prisma + `@prisma/adapter-pg`                |
| Cache      | Redis (Bun native)     | —        | `Bun.RedisClient`, no external package           |

Entry point: `src/index.tsx` (server) | `src/frontend.tsx` (frontend)
Dev command: `bun run dev` (port dari .env PORT, default 3111)
Build command: `bun run build`
Seed command: `bun run db:seed`
Test command: `bun run test`

## 2. Environment

Target URL: http://localhost:3005 (port 3005 aktif, meskipun .env PORT=3111)
Health check: `GET /health` → `{"status":"ok"}` | `GET /api/version` → `{"name":"bun-react-template","version":"0.1.0"}`

### Env keys yang relevan (tanpa value secret)
- `PORT` — server port (aktual: 3005)
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `BETTER_AUTH_SECRET` — cookie signing key (WAJIB ada)
- `BETTER_AUTH_URL` — base URL untuk Better Auth
- `SUPER_ADMIN_EMAILS` — email(s) yang auto-promote ke SUPER_ADMIN
- `NODE_ENV` — 'development' untuk enable dev-auth endpoint

### Dev-only endpoints
- `GET /api/dev-auth/login-as/:email?redirect=/path` — login tanpa password, dev only
  - Buat session di DB + Redis
  - Set cookie `better-auth.session_token=<token>.<HMAC-SHA256-b64>`
  - **PENTING**: cookie HARUS signed, plain token ditolak Better Auth

### Scripts penting
- `bun run dev` → dev server HMR
- `bun run db:seed` → seed 3 user (superadmin, admin, user)
- `bun run db:migrate` → Prisma migrate dev
- `bun run test` → seluruh test suite (152 test, 3.87s)
- `bun run typecheck` → tsc --noEmit

### Port yang dipakai
- 3005: HTTP server (aktual saat QA ini)

## 3. Role & Hierarki

Source: `prisma/schema.prisma` → `enum Role`
Source: `src/lib/auth-middleware.ts` → `guardSuperAdmin`, `guardQcOrAdmin`, `guardAuth`

| Level | Role         | Deskripsi                       | Scope data          | Auth method        |
| ----- | ------------ | ------------------------------- | ------------------- | ------------------ |
| 4     | SUPER_ADMIN  | Akses penuh semua fitur         | Global              | email+password / dev-auth |
| 3     | ADMIN        | Manage ticket, lihat audit log  | Global              | email+password / dev-auth |
| 2     | QC           | Review & close ticket           | Global              | email+password / dev-auth |
| 1     | USER         | Hanya akses /profile            | Hanya milik sendiri | email+password / dev-auth |
| 0     | (guest)      | Tidak login                     | —                   | —                  |

### Hierarki logic
- `guardSuperAdmin(authUser)` → hanya SUPER_ADMIN lolos
- `guardQcOrAdmin(authUser)` → QC, ADMIN, SUPER_ADMIN lolos
- `guardAuth(authUser)` → semua role yang login lolos
- isQc dalam ticket-helpers: `role === 'QC' || role === 'SUPER_ADMIN'`
- isAdmin dalam ticket-helpers: `role === 'ADMIN' || role === 'SUPER_ADMIN'`

### Status flow ticket
`OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED`, dengan branch `REOPENED`

Detail transisi per role (dari `src/lib/ticket-helpers.ts`):
| Status saat ini | QC/SA bisa ke      | ADMIN bisa ke      |
| --------------- | ------------------ | ------------------ |
| OPEN            | CLOSED (fast-close)| IN_PROGRESS        |
| IN_PROGRESS     | CLOSED             | READY_FOR_QC       |
| READY_FOR_QC    | CLOSED, REOPENED   | (tidak ada)        |
| REOPENED        | CLOSED             | IN_PROGRESS        |
| CLOSED          | REOPENED           | (tidak ada)        |

**⚠ CATATAN**: QC/SA dapat fast-close dari status OPEN. Ini by-design dalam matrix tapi tidak terdokumentasi di `docs/AUTH.md`. Lihat BUG-001 (UNCLEAR).

## 4. Akun Test

| Role         | Email                       | Login via          | Cookie path                      | Status |
| ------------ | --------------------------- | ------------------ | -------------------------------- | ------ |
| SUPER_ADMIN  | superadmin@example.com      | dev-auth           | /tmp/qa-session/cookie-superadmin.txt | ✓ |
| ADMIN        | admin@example.com           | dev-auth           | /tmp/qa-session/cookie-admin.txt | ✓ |
| QC           | qc@example.com              | dev-auth (dibuat manual via DB) | /tmp/qa-session/cookie-qc.txt | ✓ |
| USER         | user@example.com            | dev-auth           | /tmp/qa-session/cookie-user.txt  | ✓ |
| guest        | (tanpa login)               | —                  | —                                | ✓ |

**QC user dibuat manual** — seed hanya membuat SA, ADMIN, USER. Tidak ada QC di seed.

### Cara setup
```bash
T=/tmp/qa-session && mkdir -p $T && BASE=http://localhost:3005
# Login via dev-auth, ekstrak Set-Cookie manual
for role in superadmin admin user; do
  HDR=$(curl -sI "$BASE/api/dev-auth/login-as/${role}@example.com")
  TKN=$(echo "$HDR" | grep -i 'set-cookie:' | grep -o 'better-auth[^;]*' | head -1)
  echo "Cookie: $TKN" > $T/cookie-${role}.txt
done
# QC — buat user dulu di DB
bun -e "import {prisma} from './src/lib/db'; await prisma.user.upsert({where:{email:'qc@example.com'},update:{role:'QC'},create:{email:'qc@example.com',name:'QC User',role:'QC'}}); process.exit(0)"
HDR=$(curl -sI "$BASE/api/dev-auth/login-as/qc@example.com")
TKN=$(echo "$HDR" | grep -i 'set-cookie:' | grep -o 'better-auth[^;]*' | head -1)
echo "Cookie: $TKN" > $T/cookie-qc.txt
```

**GOTCHA KRITIS**: `get-session` response punya dua field `id`:
- `session.id` = SESSION ID (bukan user ID)
- `session.userId` = USER ID ← PAKAI INI
- `user.id` = USER ID ← atau ini

## 5. Tenant Model

- Multi-tenant: **TIDAK** — single tenant
- Semua role adalah global (tidak ada tenant-scoped role)
- Isolasi: tidak ada (semua authenticated user bisa lihat semua ticket)

## 6. API Endpoints

### Auth-protected endpoints

| METHOD | Path                              | Auth guard          | Fungsi                                    |
| ------ | --------------------------------- | ------------------- | ----------------------------------------- |
| GET    | `/api/admin/users`                | guardSuperAdmin     | List semua user                           |
| PUT    | `/api/admin/users/:id/role`       | guardSuperAdmin     | Ubah role user                            |
| PUT    | `/api/admin/users/:id/block`      | guardSuperAdmin     | Block/unblock user                        |
| GET    | `/api/admin/presence`             | guardSuperAdmin     | Online user IDs                           |
| GET    | `/api/admin/logs/app`             | guardSuperAdmin     | App logs (Redis)                          |
| GET    | `/api/admin/logs/audit`           | guardSuperAdmin     | Audit logs (DB)                           |
| DELETE | `/api/admin/logs/app`             | guardSuperAdmin     | Clear app logs                            |
| DELETE | `/api/admin/logs/audit`           | guardSuperAdmin     | Clear audit logs                          |
| GET    | `/api/admin/schema`               | guardSuperAdmin     | Prisma schema metadata                    |
| GET    | `/api/admin/routes`               | guardSuperAdmin     | Route metadata                            |
| GET    | `/api/admin/project-structure`    | guardSuperAdmin     | File structure                            |
| GET    | `/api/admin/env-map`              | guardSuperAdmin     | Env var map                               |
| GET    | `/api/admin/test-coverage`        | guardSuperAdmin     | Test coverage mapping                     |
| GET    | `/api/admin/dependencies`         | guardSuperAdmin     | NPM dependencies                          |
| GET    | `/api/admin/migrations`           | guardSuperAdmin     | Migration timeline                        |
| GET    | `/api/admin/sessions`             | guardSuperAdmin     | Active sessions                           |
| GET    | `/api/admin/file-health`          | guardSuperAdmin     | File size health check                    |
| GET    | `/api/tickets`                    | guardQcOrAdmin      | List tickets (filter: status, priority)   |
| POST   | `/api/tickets`                    | guardQcOrAdmin      | Create ticket                             |
| GET    | `/api/tickets/:id`                | guardQcOrAdmin      | Detail ticket                             |
| PATCH  | `/api/tickets/:id`                | guardQcOrAdmin      | Update ticket (termasuk status)           |
| POST   | `/api/tickets/:id/comments`       | guardQcOrAdmin      | Add comment                               |
| POST   | `/api/tickets/:id/evidence`       | guardQcOrAdmin      | Attach evidence                           |

### Public endpoints (tanpa auth)
| METHOD | Path             | Fungsi                            |
| ------ | ---------------- | --------------------------------- |
| GET    | `/health`        | Health check                      |
| GET    | `/api/version`   | App name + version                |
| GET    | `/api/changelog` | Changelog JSON                    |
| GET    | `/api/hello`     | Demo endpoint                     |

## 7. Frontend Routes

| Path         | Auth guard               | Shell/Layout     | Catatan                               |
| ------------ | ------------------------ | ---------------- | ------------------------------------- |
| `/`          | public                   | plain            | Redirect ke default route per role    |
| `/login`     | public (redirect jika sudah login) | plain  | Form email+password                   |
| `/dev`       | SUPER_ADMIN only         | AppShell         | Dev console, 10+ panel                |
| `/dashboard` | ADMIN + QC               | AppShell         | Ticket management                     |
| `/profile`   | authenticated (all roles)| plain            | Profile page                          |
| `/blocked`   | authenticated            | plain            | Halaman blocked user                  |
| `/changelog` | authenticated            | plain            | Version history                       |

## 8. Permission System

Role-level only, tidak ada sub-permission atau feature flag.
Lihat bagian 3 (Role & Hierarki) untuk detail.

## 9. Special Mechanisms

### Rate Limiting
- Tidak ada rate limiting terdeteksi di codebase

### Background Jobs
- Audit log cleanup: records > `AUDIT_LOG_RETENTION_DAYS` (default 90) dihapus on startup + tiap 24h

### WebSocket
- `WS /ws/presence` — real-time presence. Auth via session cookie.
- Broadcast online user list ke admin subscribers

### Dev Tools
- Click-to-source: `Ctrl+Shift+Cmd+C`
- Dev-auth: `GET /api/dev-auth/login-as/:email`

## 10. Known Issues & Scope

### Bug yang masih open (dari sesi ini)

Lihat BUG REGISTRY di bawah.

### Known limitations
- Seed tidak membuat QC user — perlu dibuat manual sebelum QA
- Port aktual bisa berbeda dari `.env PORT` (tergantung cara server distart)

## 11. BUG REGISTRY — Fingerprint Lintas Sesi

### Active (OPEN / UNCLEAR)

- [BUG-001] [UNCLEAR] `ticket:fast_close_bypass:open_to_closed_by_qc_sa` — QC/SA bisa close ticket dari status OPEN langsung, bypassing IN_PROGRESS→READY_FOR_QC flow (sesi 2026-06-16). By-design dalam matrix tapi undocumented, contradicts linear flow docs.

### Fixed (verified)

- [BUG-004] [FIXED] `admin:http500_on_missing_user:put_users_id_block_role` — PUT /api/admin/users/:id/block dan /role dengan user ID yang tidak ada → HTTP 500 (Prisma uncaught error). Fixed: tambah `findUnique` check sebelum update, return 404 jika tidak ada. (2026-06-16)

### Won't fix / by-design

- (Tidak ada)

## 12. Gotcha & Tips

- `get-session` punya dua `id` field — gunakan `session.userId` atau `user.id`, BUKAN `session.id` (itu session record ID)
- Cookie `better-auth.session_token` HARUS signed format `token.HMAC-SHA256-b64` — unsigned token ditolak
- Prisma v7 requires `PrismaPg` adapter — `new PrismaClient()` tanpa adapter throws di seed
- Port server bisa berbeda dari `.env PORT` — cek dengan `lsof -i :PORT` atau cari dari process list
- QC user tidak ada di seed default — buat manual via DB atau dev-auth setelah upsert user
- SUPER_ADMIN punya isQc=true (dari ticket-helpers.ts) — bisa close ticket dari semua status
