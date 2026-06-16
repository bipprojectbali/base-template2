# TIMELINE — QA Session 2026-06-16

Append-only, kronologis.

---

2026-06-16 13:00 session start — target http://localhost:3005 v0.1.0
2026-06-16 13:00 env precheck — server reachable (GET /health → 200)
2026-06-16 13:05 found: bun run db:seed gagal — Prisma v7 driver adapter missing
2026-06-16 13:05 fix applied: PrismaPg adapter di prisma/seed.ts
2026-06-16 13:10 seed berhasil — superadmin, admin, user seeded
2026-06-16 13:10 found: dev-auth cookie tidak signed → session invalid
2026-06-16 13:10 fix applied: HMAC-SHA256 signing di src/routes/dev-auth.ts
2026-06-16 13:15 QC user dibuat manual via prisma.user.upsert
2026-06-16 13:20 login verified semua 4 role — SA, ADMIN, QC, USER
2026-06-16 13:22 fase 1 — static analysis mulai
2026-06-16 13:22 CH-1 — baca src/lib/ticket-helpers.ts, src/routes/admin/users.write.ts
2026-06-16 13:23 CH-1 — found: users.write.ts tanpa findUnique pre-check → potential 500
2026-06-16 13:24 CH-2 — RBAC matrix testing mulai
2026-06-16 13:24 CH-2 — GET /api/admin/users: SA=200, rest=403/401 ✓
2026-06-16 13:25 CH-2 — PUT /api/admin/users/:id/role: matrix correct ✓
2026-06-16 13:25 CH-2 — PUT /api/admin/users/:id/block: matrix correct ✓
2026-06-16 13:25 CH-2 — tickets RBAC: QC/ADMIN/SA=200, USER/guest=403/401 ✓
2026-06-16 13:26 CH-2 — ticket status transitions testing
2026-06-16 13:26 found BUG-001 (OPEN→CLOSED by SA) — UNCLEAR
2026-06-16 13:27 CH-2 — false positive: QC→CLOSED blank response (stale cookie saat itu)
2026-06-16 13:27 CH-2 — false positive: ADMIN CLOSED→REOPENED → 400 (by design, only QC can)
2026-06-16 13:28 found BUG-004 — self-block/role 500 (ternyata salah user ID, SESSION ID bukan USER ID)
2026-06-16 13:28 investigation: session.id vs session.userId vs user.id — confirmed SESSION ID ≠ USER ID
2026-06-16 13:29 BUG-004 re-classified: real bug adalah "non-existent user ID → 500 bukan 404"
2026-06-16 13:29 re-verified: BUG-002 INVALID (QC bisa close fresh ticket dari READY_FOR_QC — HTTP 200 ✓)
2026-06-16 13:29 re-verified: BUG-003 INVALID (ADMIN tidak bisa reopen by design, QC bisa — HTTP 200 ✓)
2026-06-16 13:29 re-verified: self-block dengan USER ID yang benar → HTTP 400 ✓ (guard bekerja)
2026-06-16 13:30 fix BUG-004: tambah findUnique + null check di users.write.ts block dan role endpoints
2026-06-16 13:30 verify: non-existent ID → HTTP 404 ✓
2026-06-16 13:30 typecheck clean ✓
2026-06-16 13:30 bun run test → 152 pass, 0 fail ✓
2026-06-16 13:30 CH-4 — DB validation: create ticket → DB check (count match) ✓
2026-06-16 13:30 CH-5 — XSS payload stored (API accepts), needs CH-3 browser verify
2026-06-16 13:30 CH-5 — SQL injection probe → Prisma + Elysia schema validation blocks ✓
2026-06-16 13:30 CH-5 — self-block/role guards verified ✓
2026-06-16 13:30 CH-6 — API count vs DB count — consistent ✓
2026-06-16 13:30 QA artifacts written (RECON, SESSION, ENV_PRECHECK, NETWORK_LOG, REPORT, TIMELINE)
2026-06-16 13:30 status: INCOMPLETE — CH-3 UI/UX belum dieksekusi (agent-browser tersedia)
2026-06-16 14:00 CH-3 dimulai — agent-browser 0.27.0
2026-06-16 14:00 CH-3 — landing page (/) discovery + screenshot desktop + mobile ✓
2026-06-16 14:05 CH-3 — login page discovery: form fields, error handling, dark mode ✓
2026-06-16 14:05 TC UI-001: login valid → redirect /dev ✓
2026-06-16 14:05 TC UI-002: login password salah → alert "Invalid email or password" ✓
2026-06-16 14:07 TC UI-003: submit form kosong → HTML5 required validation ✓
2026-06-16 14:08 TC UI-004: dark mode toggle → scheme berubah ✓
2026-06-16 14:10 CH-3 — /dev (SA) discovery: 6 tabs diverifikasi, screenshot desktop + mobile ✓
2026-06-16 14:10 TC UI-009: sidebar collapse di /dev ✓
2026-06-16 14:15 CH-3 — /dashboard (ADMIN) discovery + screenshot, tab Tickets ✓
2026-06-16 14:15 TC UI-015: /dashboard tab Tickets ✓
2026-06-16 14:17 CH-3 — /dashboard (QC) discovery + screenshot ✓
2026-06-16 14:18 CH-3 — /profile (USER) discovery + screenshot ✓
2026-06-16 14:20 CH-3 — /changelog discovery + screenshot ✓
2026-06-16 14:22 TC UI-005: USER akses /dev → redirect /profile ✓
2026-06-16 14:22 TC UI-006: ADMIN akses /dev → redirect /profile ✓
2026-06-16 14:23 TC UI-007: guest akses /dashboard → redirect /login ✓
2026-06-16 14:25 TC UI-008: XSS payload di ticket → React escape (ESCAPED_OK) ✓
2026-06-16 14:26 TC UI-010: WhatsNew modal dismiss ✓
2026-06-16 14:27 Mobile testing: set device "iPhone 14", 7 halaman di-screenshot ✓
2026-06-16 14:30 CH-3 artifacts: 01_SITEMAP.md, 03_PROGRESS.md, 04_REPORT.md updated
2026-06-16 14:30 COMPLIANCE GATE: PASS — semua channel selesai
2026-06-16 14:30 SESSION STATUS: COMPLETED — BUG-001 open (needs product decision)
