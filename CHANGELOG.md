# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- `llms.txt` generator (`bun run docs:llms`) — auto-builds an LLM-friendly project summary from routes, schema, env, and changelog
- `GET /llms.txt` endpoint — serves the same summary live, rebuilt from sources on each request
- llms.txt link in the `/dev` sidebar — opens the live endpoint in a new tab

### Changed
- Remove unused dependencies: Three.js, React Three Fiber, D3, TanStack Router Vite plugin
- Sync agent configs and update login/blocked routes

### Fixed
- Tests now connect to `TEST_DATABASE_URL` under `NODE_ENV=test`, isolating the destructive test cleanup from the dev/prod database
- Test DB isolation is now fail-closed: `resolveDatabaseUrl()` throws (instead of silently using the dev DB) when `TEST_DATABASE_URL` is unset or equals `DATABASE_URL`, and `cleanupTestData()` asserts the same before deleting rows — preventing the test suite from wiping dev data
- `TEST_DATABASE_URL` moved to `.env.test` (template: `.env.test.example`) to dodge a Bun env-precedence quirk where `.env` would shadow it
- `/llms.txt` reaches the live Elysia endpoint instead of being served as a static asset / SPA fallback
- `appendHeader` added to the Vite dev middleware response shim (fixes `res.appendHeader is not a function`)

---

## [0.1.0] - 2026-06-11

### Added
- Interactive Canvas 2D animated background (replaces Three.js/D3 — zero external deps)
- Role-based redirect after login (email & Google OAuth)
- Google profile photo displayed across all pages
- API Docs panel in `/dev` with Swagger iframe + OpenAPI JSON viewer
- File Health panel in `/dev` — scan project files vs `docs/FILE-HEALTH.md` limits, with pagination, copy buttons, and toast notifications
- Client-side pagination for FileHealthTable
- Production Docker deployment with standalone Prisma migrator
- `copy-migrate` utility script
- Elysia Swagger UI at `/api/docs` with full API documentation (Scalar UI)
- `GET /api/version` endpoint from `package.json`
- `GET /api/admin/file-health` endpoint — line/char count vs limits, status ok/warn/critical/exempt
- `GET /api/admin/sessions` — active sessions with online status and role breakdown
- `debug-dev`, `debug-stg`, and `deploy-stg` MCP servers
- `HMR_PORT` env var for explicit Vite HMR port config
- WebSocket presence tracking (`/ws/presence`) — real-time online user list
- Redis app logs ring buffer (`app:logs`, max 500 entries)
- Audit trail in DB (`AuditLog` table)
- Ticket tracking system with QC role and status machine (`OPEN → IN_PROGRESS → READY_FOR_QC → CLOSED`)
- `dev-auth` endpoint for local testing (no password check, dev only)
- Project visualization panel in `/dev` — 10 interactive React Flow views (routes, schema, dependencies, etc.)
- ER diagram in Database tab (`/dev`) with auto-save positions
- Collapsible sidebar (260px → 60px icon-only), state persisted in `localStorage`
- Tab state persisted in URL `?tab=` search param
- Comprehensive test suite — 147 tests across 18 files
- Mobile-first responsive design across all frontend pages
- Dark/light mode with no flash on load (reads `localStorage` before paint)
- Logout confirmation modal on all protected pages

### Changed
- Migrated auth to **Better Auth v1.6.9** (scrypt passwords, signed HttpOnly cookies, Redis session cache)
- Migrated to **Prisma 7** (ORM 7.8.0), generated client to `./generated/prisma`
- Migrated to static (code-based) **TanStack Router** — no codegen, no generated files
- Landing page redesigned — modern hero, features grid, tech stack section
- Brand renamed from BunStack → **Base Template**
- Split monolithic `app.ts` into focused sub-router modules (`routes/auth`, `routes/admin/*`, `routes/tickets`)
- `src/frontend/routes/dev.tsx` split into panel components under `routes/dev/`
- Sidebar footer and profile layout moved to AppShell

### Fixed
- Auto-reload on stale chunk 404 after deploy
- HMR WebSocket port conflict (`EADDRINUSE`) on dev startup
- Scalar UI blank document (scalarConfig `spec.url`)
- Google OAuth behind reverse proxy (honor `X-Forwarded-Proto`)
- Frontend type safety, responsive sizing, and real mutation state

### Removed
- Three.js, React Three Fiber (`@react-three/fiber`, `@react-three/drei`)
- D3 (`d3`)
- TanStack Router Vite plugin (switched to static router)

---

## [0.0.1] - 2026-04-01

### Added
- Initial full-stack template: Bun + Elysia + React + Vite
- Role-based routing: `SUPER_ADMIN → /dev`, `ADMIN/QC → /dashboard`, `USER → /profile`
- Admin API: user management (list, role change, block/unblock), presence, logs
- Dev console (`/dev`) and dashboard (`/dashboard`) with AppShell layout
- Better Auth (pre-v1.6 — later migrated), Google OAuth
- Prisma ORM with PostgreSQL, Redis via Bun native client
- `.env.example` with all required variables
