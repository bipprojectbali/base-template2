# Base Template

Full-stack web application template built with Bun, Elysia, React 19, and Vite.

## Tech Stack

- **Runtime**: [Bun](https://bun.com)
- **Server**: [Elysia.js](https://elysiajs.com) with Vite middleware mode (dev) / static serving (prod)
- **Frontend**: React 19 + [TanStack Router](https://tanstack.com/router) (file-based routing) + [TanStack Query](https://tanstack.com/query)
- **UI**: [Mantine v8](https://mantine.dev) (dark theme) + [react-icons](https://react-icons.github.io/react-icons/)
- **Database**: PostgreSQL via [Prisma v6](https://www.prisma.io)
- **Auth**: Session-based (bcrypt + HttpOnly cookies) + Google OAuth
- **Dev Tools**: Click-to-source inspector (Ctrl+Shift+Cmd+C), HMR, Biome linter
- **Testing**: bun:test (unit + integration) + [Lightpanda](https://lightpanda.io) (E2E via CDP)

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- PostgreSQL running on `localhost:5432`
- [Lightpanda](https://github.com/lightpanda-io/browser) (optional, for E2E tests)

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, Google OAuth credentials, etc.

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
- Splash screen (dark) prevents white flash on reload

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
  index.tsx          # Server entry — Vite middleware, frontend serving, editor integration
  app.ts             # Elysia app — API routes (auth, admin, hello, health, Google OAuth)
  serve.ts           # Dev entry (workaround for Bun EADDRINUSE)
  vite.ts            # Vite dev server config, inspector plugin, dedupe plugin
  frontend.tsx       # React entry — root render, splash removal, HMR
  lib/
    db.ts            # Prisma client singleton
    env.ts           # Environment variables
  frontend/
    App.tsx           # Root component — MantineProvider, QueryClient, Router
    DevInspector.tsx  # Click-to-source overlay (dev only)
    hooks/
      useAuth.ts     # useSession, useLogin, useLogout, getDefaultRoute
    routes/
      __root.tsx     # Root layout
      index.tsx      # Landing page
      login.tsx      # Login page (email/password + Google OAuth)
      dev.tsx        # Dev console — SUPER_ADMIN only, user management
      dashboard.tsx  # Admin dashboard — ADMIN & SUPER_ADMIN
      profile.tsx    # User profile — all authenticated users
      blocked.tsx    # Blocked user info page
prisma/
  schema.prisma      # Database schema (User, Session, Role enum)
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
| `SUPER_ADMIN` | `/dev` | `/dev`, `/dashboard`, `/profile` | Full system access, user management |
| `ADMIN` | `/dashboard` | `/dashboard`, `/profile` | Dashboard access with analytics |
| `USER` | `/profile` | `/profile` | Profile only |

- Default role for new users is `USER`
- `SUPER_ADMIN` is assigned via seeder or `SUPER_ADMIN_EMAIL` env variable
- Blocked users are redirected to `/blocked` and their sessions are invalidated

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

SUPER_ADMIN-only endpoints for user management:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List all users |
| `PUT` | `/api/admin/users/:id/role` | Change user role (USER/ADMIN) |
| `PUT` | `/api/admin/users/:id/block` | Block/unblock user |

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

| Variable               | Required | Description                                |
| ---------------------- | -------- | ------------------------------------------ |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string               |
| `GOOGLE_CLIENT_ID`     | Yes      | Google OAuth client ID                     |
| `GOOGLE_CLIENT_SECRET` | Yes      | Google OAuth client secret                 |
| `SUPER_ADMIN_EMAIL`    | No       | Comma-separated emails to auto-promote     |
| `PORT`                 | No       | Server port (default: 3000)                |
| `REACT_EDITOR`         | No       | Editor for click-to-source (default: code) |
