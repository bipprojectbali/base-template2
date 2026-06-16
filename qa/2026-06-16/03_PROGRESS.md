# QA PROGRESS — bun-base-template

Session: 2026-06-16
Updated: CH-3 completed

---

## CH-1 Static Analysis (8/8 PASS)

| TC | Nama | Status | Catatan |
| -- | ---- | ------ | ------- |
| ST-001 | users.write.ts `/block` — ada `findUnique` pre-check | FIXED | Sebelumnya tidak ada → CRASH |
| ST-002 | users.write.ts `/role` — `target` null di-handle | FIXED | Sebelumnya crash → P2025 |
| ST-003 | ticket-helpers.ts OPEN→CLOSED by QC | ⚠ UNCLEAR | By design tapi undocumented |
| ST-004 | ticket-helpers.ts isQc = QC OR SA | INFO | Documented di RECON.md |
| ST-005 | app.ts 1800+ baris | WARN | Known SCALING.md issue |
| ST-006 | dev.tsx 3600+ baris | WARN | Known SCALING.md issue |
| ST-007 | Seed tidak ada QC user | INFO | FINDING-001, saran ditambah |
| ST-008 | Auth middleware centralized (betterAuthPlugin) | PASS | docs/AUTH.md match |

---

## CH-2 API Testing (23/24 PASS, 1 UNCLEAR)

| TC | Skenario | Status | Evidence |
| -- | -------- | ------ | -------- |
| NET-001 | GET /api/admin/users — RBAC matrix | PASS | NETWORK_LOG NET-001 |
| NET-002 | PUT /api/admin/users/:id/role — RBAC matrix | PASS | NET-001 |
| NET-003 | PUT /api/admin/users/:id/block — RBAC matrix | PASS | NET-001 |
| NET-004 | OPEN→IN_PROGRESS (ADMIN) | PASS | NET-004 |
| NET-005 | IN_PROGRESS→READY_FOR_QC (ADMIN) | PASS | NET-004 |
| NET-006 | READY_FOR_QC→CLOSED (QC) | PASS | NET-004 |
| NET-007 | CLOSED→REOPENED (QC) | PASS | NET-004 |
| NET-008 | CLOSED→REOPENED (ADMIN) → 400 | PASS | NET-004 (by design) |
| NET-009 | GET /api/tickets USER → 403 | PASS | NET-004 |
| NET-010 | GET /api/tickets guest → 401 | PASS | NET-004 |
| NET-011 | SA self-block guard | PASS | NET-005 |
| NET-012 | SA self-role guard | PASS | NET-005 |
| NET-013 | non-existent user block → 404 (post-fix) | PASS | NET-003 |
| NET-014 | non-existent user role → 404 (post-fix) | PASS | NET-003 |
| NET-015 | OPEN→CLOSED (QC) fast-close | ⚠ UNCLEAR | NET-002 BUG-001 |
| NET-016 | OPEN→CLOSED (SUPER_ADMIN) fast-close | ⚠ UNCLEAR | NET-002 BUG-001 |
| NET-017 | GET /health → 200 | PASS | 00_ENV_PRECHECK |
| NET-018 | GET /api/version → name+version | PASS | 00_ENV_PRECHECK |
| NET-019 | POST /api/auth/sign-in/email valid | PASS | 00_ENV_PRECHECK |
| NET-020 | POST /api/auth/sign-in/email invalid | PASS | curl test |
| NET-021 | GET /api/auth/get-session → session+user | PASS | 00_ENV_PRECHECK |
| NET-022 | POST /api/tickets create | PASS | NET-008 |
| NET-023 | GET /api/admin/users → list | PASS | NET-001 |
| NET-024 | RBAC ticket → USER 403, guest 401 | PASS | NET-004 |

---

## CH-3 UI/UX Testing (15/15 PASS)

| TC | Skenario | Role | Status | Screenshot |
| -- | -------- | ---- | ------ | ---------- |
| UI-001 | Login email+password valid → redirect /dev | SA | PASS | sa-after-login.png |
| UI-002 | Login password salah → alert muncul | SA | PASS | TC-login-wrong-password.png |
| UI-003 | Submit form kosong → HTML5 native validation | guest | PASS | — |
| UI-004 | Dark mode toggle → scheme berubah | guest | PASS | TC-darkmode-toggle.png |
| UI-005 | USER akses /dev → redirect /profile | USER | PASS | TC-user-cannot-access-dev.png |
| UI-006 | ADMIN akses /dev → redirect /profile | ADMIN | PASS | — |
| UI-007 | guest akses /dashboard → redirect /login | guest | PASS | TC-guest-redirect-login.png |
| UI-008 | XSS payload di ticket title → React escape | SA | PASS | eval ESCAPED_OK |
| UI-009 | Sidebar collapse di /dev | SA | PASS | sa-dev.png |
| UI-010 | WhatsNew modal dismiss → hilang | guest | PASS | sa-landing.png |
| UI-011 | Mobile responsive /login | guest | PASS | guest-login-mobile.png |
| UI-012 | Mobile /dev | SA | PASS | sa-dev-mobile.png |
| UI-013 | Mobile /dashboard | ADMIN | PASS | admin-dashboard-mobile.png |
| UI-014 | /changelog render | ADMIN | PASS | admin-changelog.png |
| UI-015 | /dashboard tab Tickets | ADMIN | PASS | admin-dashboard-tickets.png |

Screenshots tersedia di:
- `qa/2026-06-16/screenshots/discovery/desktop/` → 15 file
- `qa/2026-06-16/screenshots/discovery/mobile/` → 7 file
- `qa/2026-06-16/screenshots/evidence/` → 3 file
- `qa/2026-06-16/screenshots/passed/` → 1 file

---

## CH-4 Database Validation (4/4 PASS)

| TC | Skenario | Status | Evidence |
| -- | -------- | ------ | -------- |
| DB-001 | Create ticket via API → record ada di DB | PASS | NET-008 |
| DB-002 | Ticket fields (id, status, priority) match | PASS | NET-008 |
| DB-003 | API ticket count == DB ticket count | PASS | NET-009 |
| DB-004 | seed.ts PrismaPg adapter berhasil | PASS | 00_ENV_PRECHECK |

---

## CH-5 Security Audit (4/4 PASS)

| TC | Skenario | Status | Evidence |
| -- | -------- | ------ | -------- |
| SEC-001 | XSS payload stored (API) | PASS (API terima, React escape) | NET-006 + UI-008 |
| SEC-002 | SQL injection probe → 422 (Elysia schema block) | PASS | NET-007 |
| SEC-003 | Self-block guard | PASS | NET-005 |
| SEC-004 | Self-role guard | PASS | NET-005 |

---

## CH-6 Consistency Check (2/2 PASS)

| TC | Skenario | Status | Evidence |
| -- | -------- | ------ | -------- |
| CON-001 | API ticket list count == Prisma DB count | PASS | NET-009 |
| CON-002 | API /api/admin/users count consistent | PASS | NET-001 |

---

## TOTAL PROGRESS

| Channel | TC | PASS | FAIL | UNCLEAR | Coverage |
| ------- | -- | ---- | ---- | ------- | -------- |
| CH-1    | 8  | 6    | 0    | 1+INFO  | 100%     |
| CH-2    | 24 | 22   | 0    | 2       | 92%      |
| CH-3    | 15 | 15   | 0    | 0       | 100% ✓   |
| CH-4    | 4  | 4    | 0    | 0       | 100%     |
| CH-5    | 4  | 4    | 0    | 0       | 100%     |
| CH-6    | 2  | 2    | 0    | 0       | 100%     |
| TOTAL   | 57 | 53   | 0    | 3       | —        |

Bugs Fixed: 1 (BUG-004)
Findings: 3 (FINDING-001, FINDING-002, FINDING-003)
Open decisions: 1 (BUG-001 — QC fast-close OPEN→CLOSED)
