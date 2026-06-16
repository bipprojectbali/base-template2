# ENV PRECHECK

- Target: http://localhost:3005
- Build: 0.1.0 (from /api/version)
- Git: 431cf0a — main
- Time: 2026-06-16 13:00

## Checks

| Check                       | Status | Evidence                                                  |
| --------------------------- | ------ | --------------------------------------------------------- |
| Server health               | ✓ 200  | `GET /health → {"status":"ok"}`                           |
| API version reachable       | ✓ 200  | `GET /api/version → {"name":"bun-react-template","version":"0.1.0"}` |
| Landing console clean       | ✓      | Tidak ada fatal error di landing                          |
| Seed data ada               | ✓      | 4 user setelah seed + create QC manual                    |

## Auth per role

| Role         | Email                    | Login via   | Status | Cookie path                      | Catatan               |
| ------------ | ------------------------ | ----------- | ------ | -------------------------------- | --------------------- |
| SUPER_ADMIN  | superadmin@example.com   | dev-auth    | ✓      | /tmp/qa-session/cookie-superadmin.txt | role confirmed |
| ADMIN        | admin@example.com        | dev-auth    | ✓      | /tmp/qa-session/cookie-admin.txt | role confirmed        |
| QC           | qc@example.com           | dev-auth    | ✓      | /tmp/qa-session/cookie-qc.txt    | dibuat manual, role confirmed |
| USER         | user@example.com         | dev-auth    | ✓      | /tmp/qa-session/cookie-user.txt  | role confirmed        |
| guest        | (tanpa login)            | —           | ✓      | —                                | 401 pada endpoint protected |

## Masalah yang Ditemukan dan Dimitigasi

| Masalah                                           | Mitigasi                                                |
| ------------------------------------------------- | ------------------------------------------------------- |
| `bun run db:seed` gagal — Prisma v7 adapter issue | Fix: tambah `PrismaPg` adapter di `prisma/seed.ts`      |
| dev-auth cookie tidak signed → session invalid    | Fix: tambah HMAC-SHA256 signing di `src/routes/dev-auth.ts` |
| QC user tidak ada di seed                         | Buat manual via `prisma.user.upsert` + dev-auth         |
| Port aktual 3005, bukan 3111 dari `.env`          | Semua curl command pakai port 3005                      |

## Test data

| Data                   | Status | Evidence                                      |
| ---------------------- | ------ | --------------------------------------------- |
| SUPER_ADMIN user       | ✓      | superadmin@example.com                        |
| ADMIN user             | ✓      | admin@example.com                             |
| QC user                | ✓      | qc@example.com (dibuat manual)                |
| USER user              | ✓      | user@example.com                              |
| Ticket test data       | ✓      | Beberapa ticket dibuat selama QA              |

## Catatan / Blocker
- Tidak ada blocker tersisa saat QA dimulai
