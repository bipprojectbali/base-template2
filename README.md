# Base Template

Full-stack web application template built with Bun, Elysia, React 19, and Vite.

## Tech Stack

- **Runtime**: [Bun](https://bun.com)
- **Server**: [Elysia.js](https://elysiajs.com) with Vite middleware mode (dev) / static serving (prod)
- **Frontend**: React 19 + [TanStack Router](https://tanstack.com/router) (file-based routing) + [TanStack Query](https://tanstack.com/query)
- **UI**: [Mantine v8](https://mantine.dev) (dark/light mode, auto default) + [Mantine Modals](https://mantine.dev/x/modals/) + [react-icons](https://react-icons.github.io/react-icons/)
- **Database**: PostgreSQL via [Prisma v6](https://www.prisma.io)
- **Cache/Logs**: Redis via Bun native `Bun.RedisClient`
- **Auth**: Session-based (bcrypt + HttpOnly cookies) + Google OAuth
- **Real-time**: WebSocket presence (Bun native)
- **Dev Tools**: Click-to-source inspector (Ctrl+Shift+Cmd+C), HMR, Biome linter
- **Testing**: bun:test (unit + integration) + [Lightpanda](https://lightpanda.io) (E2E via CDP)

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- PostgreSQL running on `localhost:5432`
- Redis running on `localhost:6379`
- [Lightpanda](https://github.com/lightpanda-io/browser) (optional, for E2E tests)

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, Google OAuth credentials, etc.

# Setup database
bun run db:migrate
bun run db:seed
```

## Development

```bash
bun run dev
```

Server starts at `http://localhost:3000` (configurable via `PORT` in `.env`).

Features in dev mode:

- Hot Module Replacement (HMR) via Vite
- Click-to-source inspector: `Ctrl+Shift+Cmd+C` to toggle, click any component to open in editor
- Splash screen adapts to dark/light mode, prevents flash on reload

## Production

```bash
bun run build    # Build frontend with Vite
bun run start    # Start production server
```

## Scripts

| Script                     | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `bun run dev`              | Start dev server with HMR                        |
| `bun run build`            | Build frontend for production                    |
| `bun run start`            | Start production server                          |
| `bun run test`             | Run all tests                                    |
| `bun run test:unit`        | Run unit tests                                   |
| `bun run test:integration` | Run integration tests                            |
| `bun run test:e2e`         | Run E2E tests (requires Lightpanda + dev server) |
| `bun run typecheck`        | TypeScript type check                            |
| `bun run lint`             | Lint with Biome                                  |
| `bun run lint:fix`         | Lint and auto-fix                                |
| `bun run db:migrate`       | Run Prisma migrations                            |
| `bun run db:seed`          | Seed demo users                                  |
| `bun run db:studio`        | Open Prisma Studio                               |
| `bun run db:generate`      | Regenerate Prisma client                         |
| `bun run db:push`          | Push schema to DB without migration              |

## Project Structure

```
src/
  index.tsx          # Server entry — Vite middleware, frontend serving, audit log rotation
  app.ts             # Elysia app — API routes (auth, admin, logs, presence, hello, health)
  serve.ts           # Dev entry (workaround for Bun EADDRINUSE)
  vite.ts            # Vite dev server config, inspector plugin, dedupe plugin
  frontend.tsx       # React entry — root render, splash removal, HMR
  lib/
    db.ts            # Prisma client singleton
    env.ts           # Environment variables
    redis.ts         # Bun native Redis client singleton
    applog.ts        # App log module (Redis-backed ring buffer)
    presence.ts      # WebSocket presence tracker (in-memory)
  frontend/
    App.tsx           # Root component — MantineProvider, ModalsProvider, QueryClient, Router
    DevInspector.tsx  # Click-to-source overlay (dev only)
    components/
      ThemeToggle.tsx # Shared dark/light mode toggle button
      NotFound.tsx    # 404 page
      ErrorPage.tsx   # Error boundary page
    hooks/
      useAuth.ts     # useSession, useLogin, useLogout, getDefaultRoute
      usePresence.ts # WebSocket presence hook (real-time online status)
    routes/
      __root.tsx     # Root layout (Outlet only)
      index.tsx      # Landing page
      login.tsx      # Login page (email/password + Google OAuth)
      dev.tsx        # Dev console — SUPER_ADMIN only (users, app logs, user logs, DB schema, project viz)
      dashboard.tsx  # Admin dashboard — ADMIN & SUPER_ADMIN (stats, analytics, orders)
      profile.tsx    # User profile — all authenticated users
      blocked.tsx    # Blocked user info page
prisma/
  schema.prisma      # Database schema (User, Session, AuditLog, Role enum)
  seed.ts            # Seed script (superadmin, admin, user with bcrypt)
  migrations/        # Prisma migrations
tests/
  helpers.ts         # Test utilities (seedTestUser, createTestSession, cleanup)
  unit/              # Unit tests (env, db, password)
  integration/       # Integration tests (auth, health, hello API)
  e2e/               # E2E tests via Lightpanda CDP
    browser.ts       # Lightpanda CDP helper class
```

## Roles & Routing

Three roles with hierarchical access:

| Role | Default Route | Can Access | Description |
|------|--------------|------------|-------------|
| `SUPER_ADMIN` | `/dev` | `/dev`, `/dashboard`, `/profile` | Full system access, user management, logs |
| `ADMIN` | `/dashboard` | `/dashboard`, `/profile` | Dashboard access with analytics |
| `USER` | `/profile` | `/profile` | Profile only |

- Default role for new users is `USER`
- `SUPER_ADMIN` is assigned via seeder or `SUPER_ADMIN_EMAIL` env variable
- Blocked users are redirected to `/blocked` and their sessions are invalidated
- Tab state persisted in URL (`?tab=`) — survives page reload

## Auth

- **Email/password**: POST `/api/auth/login` — bcrypt verification, blocked check, creates DB session
- **Google OAuth**: GET `/api/auth/google` — redirects to Google, callback at `/api/auth/callback/google`
- **Session check**: GET `/api/auth/session` — returns current user (with role & blocked status) or 401
- **Logout**: POST `/api/auth/logout` — deletes session from DB

Demo users (seeded):

| Email | Password | Role |
|-------|----------|------|
| `superadmin@example.com` | `superadmin123` | SUPER_ADMIN |
| `admin@example.com` | `admin123` | ADMIN |
| `user@example.com` | `user123` | USER |

## Admin API

SUPER_ADMIN-only endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List all users |
| `PUT` | `/api/admin/users/:id/role` | Change user role (USER/ADMIN) |
| `PUT` | `/api/admin/users/:id/block` | Block/unblock user |
| `GET` | `/api/admin/presence` | List online user IDs |
| `GET` | `/api/admin/logs/app` | App logs (filter: level, limit, afterId) |
| `GET` | `/api/admin/logs/audit` | Audit logs (filter: userId, action, limit) |
| `DELETE` | `/api/admin/logs/app` | Clear all app logs |
| `DELETE` | `/api/admin/logs/audit` | Clear all audit logs |
| `GET` | `/api/admin/routes` | All routes metadata (method, path, auth, category) |
| `GET` | `/api/admin/project-structure` | Project files, imports, exports, line counts |
| `GET` | `/api/admin/env-map` | Environment variables map (status, usage, categories) |
| `GET` | `/api/admin/test-coverage` | Test coverage mapping (source → test files) |
| `GET` | `/api/admin/dependencies` | NPM packages graph (version, type, usage) |
| `GET` | `/api/admin/migrations` | Prisma migration timeline (changes, SQL preview) |
| `GET` | `/api/admin/sessions` | Active sessions with online status |

## WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /ws/presence` | Real-time user presence. Auth via session cookie. Broadcasts online users to admin subscribers. |

## Logging

| Type | Storage | Rotation | Description |
|------|---------|----------|-------------|
| **App Logs** | Redis List | Max 500 entries (LTRIM) | API requests, errors, auth events |
| **Audit Logs** | PostgreSQL | Auto-cleanup > 90 days | LOGIN, LOGOUT, LOGIN_FAILED, ROLE_CHANGED, BLOCKED, etc. |

Both can be viewed and manually cleared from the Dev Console (`/dev`).

## Database Schema Visualization

The Dev Console (`/dev` → Database tab) includes an interactive ER diagram powered by React Flow (`@xyflow/react`):

- Visual representation of all Prisma models, fields, enums, and relations
- Drag nodes to rearrange the layout
- Auto-save: node positions, zoom level, and pan position are persisted to `localStorage` and restored on reload
- Relation edges show field mappings and delete rules

## Project Structure Visualization

The Dev Console (`/dev` → Project tab) provides 4 interactive views:

| View | Description |
|------|-------------|
| **API Routes** | All endpoints (HTTP + WS + frontend pages) with method badges, auth levels, and flow edges showing login→redirect paths |
| **File Structure** | Project files as nodes with import dependency edges. Filter by category (Frontend/Backend/Lib/Tests). Shows line counts and export counts |
| **User Flow** | Navigation map showing role-based routing: login → auth check → blocked check → role check → destination page |
| **Data Flow** | Request lifecycle: client → server → auth → handler → DB/Redis → response. Includes WebSocket and audit logging flows |

All views use React Flow with auto-save positions and viewport per view.

### DevOps Views

| View | Description |
|------|-------------|
| **Env Variables** | All environment variables with set/unset status, required/optional badges, edges to consuming files |
| **Test Coverage** | Source files (color-coded: green/yellow/red) with edges to test files. Filter by coverage status |
| **Dependencies** | NPM packages grouped by category, edges to importing files. Filter runtime/dev |
| **Migrations** | Horizontal timeline of Prisma migrations with SQL preview and change summaries |

### Live Views

| View | Description |
|------|-------------|
| **Sessions** | Active user sessions with online status, role mapping, auto-refresh 10s |
| **Live Requests** | Real-time API request visualization via WebSocket. Hit counters, status colors, response times |

## Sidebar

- Collapsible sidebar on Dev Console and Dashboard (AppShell layout)
- Expanded: 260px with icons, labels, chevrons, user info
- Minimized: 60px icon-only bar with tooltips on hover
- State persisted in `localStorage` (`dev:sidebar`, `dashboard:sidebar`)

## Logout Confirmation

- Logout button shows a confirm modal (`@mantine/modals`) before logging out
- Applied on Dev Console, Dashboard, and Profile pages
- Blocked page logs out directly (no confirm needed)

## Dark/Light Mode

- Default follows device preference (`prefers-color-scheme`)
- Toggle integrated per-page: sidebar footer (dev/dashboard), top-right (landing/login/blocked), header bar (profile)
- Shared `ThemeToggle` component (`src/frontend/components/ThemeToggle.tsx`)
- Choice persisted in `localStorage` by Mantine
- Flash-free reload: `index.html` reads `localStorage` before first paint

## E2E Tests (Lightpanda)

Lightpanda runs as a Docker container:

```yaml
# docker-compose.yml
services:
  lightpanda:
    image: lightpanda/browser:nightly
    container_name: lightpanda
    restart: unless-stopped
    ports:
      - "9222:9222"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - LIGHTPANDA_DISABLE_TELEMETRY=true
    mem_limit: 256m
    cpus: "0.5"
```

```bash
docker compose up -d     # Start Lightpanda
bun run dev              # Start dev server
bun run test:e2e         # Run E2E tests
```

## Environment Variables

| Variable                   | Required | Description                                    |
| -------------------------- | -------- | ---------------------------------------------- |
| `DATABASE_URL`             | Yes      | PostgreSQL connection string                   |
| `REDIS_URL`                | Yes      | Redis connection string                        |
| `GOOGLE_CLIENT_ID`         | Yes      | Google OAuth client ID                         |
| `GOOGLE_CLIENT_SECRET`     | Yes      | Google OAuth client secret                     |
| `SUPER_ADMIN_EMAIL`        | No       | Comma-separated emails to auto-promote         |
| `AUDIT_LOG_RETENTION_DAYS` | No       | Days to keep audit logs (default: 90)          |
| `PORT`                     | No       | Server port (default: 3000)                    |
| `REACT_EDITOR`             | No       | Editor for click-to-source (default: code)     |
