Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## Server

Elysia.js as the HTTP framework, running on Bun. API routes are in `src/app.ts` (exported as `createApp()`), frontend serving and dev tools are in `src/index.tsx`.

- `src/app.ts` — Elysia app factory with all API routes (auth, admin, hello, health, Google OAuth). Testable via `app.handle(request)`.
- `src/index.tsx` — Server entry. Adds Vite middleware (dev) or static file serving (prod), click-to-source editor integration, and `.listen()`.
- `src/serve.ts` — Dev entry (`bun --watch src/serve.ts`). Dynamic import workaround for Bun EADDRINUSE race.

## Database

PostgreSQL via Prisma v6. Client generated to `./generated/prisma` (gitignored).

- Schema: `prisma/schema.prisma` — User (id, name, email, password, role, blocked, timestamps) + Session (id, token, userId, expiresAt)
- Roles: `USER`, `ADMIN`, `SUPER_ADMIN` (enum). Default is `USER`.
- Client singleton: `src/lib/db.ts` — import `{ prisma }` from here
- Seed: `prisma/seed.ts` — demo users (superadmin, admin, user) with `Bun.password.hash` bcrypt
- Commands: `bun run db:migrate`, `bun run db:seed`, `bun run db:generate`

## Auth

Session-based auth with HttpOnly cookies stored in DB.

- Login: `POST /api/auth/login` — finds user by email, verifies password with `Bun.password.verify`, checks blocked status, creates Session record
- Google OAuth: `GET /api/auth/google` → Google → `GET /api/auth/callback/google` — upserts user, creates session
- Session: `GET /api/auth/session` — looks up session by cookie token, returns user (including role & blocked) or 401, auto-deletes expired
- Logout: `POST /api/auth/logout` — deletes session from DB, clears cookie
- Blocked users: login returns 403, existing sessions are invalidated on block, frontend redirects to `/blocked`

## Admin API (SUPER_ADMIN only)

- `GET /api/admin/users` — list all users with role, blocked status, createdAt
- `PUT /api/admin/users/:id/role` — change role to USER or ADMIN (cannot change self or to SUPER_ADMIN)
- `PUT /api/admin/users/:id/block` — block/unblock user (deletes all sessions on block)

## Role-Based Routing

| Role | Default Route | Can Access |
|------|--------------|------------|
| SUPER_ADMIN | `/dev` | `/dev`, `/dashboard`, `/profile` |
| ADMIN | `/dashboard` | `/dashboard`, `/profile` |
| USER | `/profile` | `/profile` |

- `getDefaultRoute(role)` in `src/frontend/hooks/useAuth.ts` — centralized redirect logic
- Blocked users are redirected to `/blocked` from all protected routes

## Frontend

React 19 + Vite 8 (middleware mode in dev). File-based routing with TanStack Router.

- Entry: `src/frontend.tsx` — renders App, removes splash screen, DevInspector in dev
- App: `src/frontend/App.tsx` — MantineProvider (dark, forced), QueryClientProvider, RouterProvider
- Routes: `src/frontend/routes/`
  - `__root.tsx` — Root layout
  - `index.tsx` — Landing page
  - `login.tsx` — Login page (email/password + Google OAuth)
  - `dev.tsx` — Dev console with AppShell sidebar, user management (SUPER_ADMIN only)
  - `dashboard.tsx` — Admin dashboard with AppShell sidebar, stats, analytics, orders (ADMIN+)
  - `profile.tsx` — User profile (all authenticated users)
  - `blocked.tsx` — Blocked user page with explanation
- Auth hooks: `src/frontend/hooks/useAuth.ts` — `useSession()`, `useLogin()`, `useLogout()`, `getDefaultRoute()`
- UI: Mantine v8 (dark theme `#242424`), react-icons, AppShell layout for dashboard pages
- Splash: `index.html` has inline dark CSS + spinner, removed on React mount

## Dev Tools

- Click-to-source: `Ctrl+Shift+Cmd+C` toggles inspector. Custom Vite plugin (`inspectorPlugin` in `src/vite.ts`) injects `data-inspector-*` attributes. Reads original file from disk for accurate line numbers.
- HMR: Vite 8 with `@vitejs/plugin-react` v6. `dedupeRefreshPlugin` fixes double React Refresh injection.
- Editor: `REACT_EDITOR` env var. `zed` and `subl` use `file:line:col`, others use `--goto file:line:col`.

## Testing

Tests use `bun:test`. Three levels:

```bash
bun run test              # All tests
bun run test:unit         # tests/unit/ — env, db connection, bcrypt
bun run test:integration  # tests/integration/ — API endpoints via app.handle()
bun run test:e2e          # tests/e2e/ — browser tests via Lightpanda CDP
```

- `tests/helpers.ts` — `createTestApp()`, `seedTestUser()`, `createTestSession()`, `cleanupTestData()`
- Integration tests use `createApp().handle(new Request(...))` — no server needed
- E2E tests use Lightpanda browser (Docker, `ws://127.0.0.1:9222`). App URLs use `host.docker.internal` from container. Lightpanda executes JS but POST fetch returns 407 — use integration tests for mutations.

## APIs

- `Bun.password.hash()` / `Bun.password.verify()` for bcrypt
- `Bun.file()` for static file serving in production
- `Bun.which()` / `Bun.spawn()` for editor integration
- `crypto.randomUUID()` for session tokens
