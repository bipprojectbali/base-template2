# QA REPORT — bun-base-template

- **Session**: qa/2026-06-16/
- **Target**: http://localhost:3005 (v0.1.0)
- **Tester**: AI QA Agent (claude-sonnet-4-6)
- **Tanggal**: 2026-06-16
- **Test suite**: 152 pass, 0 fail (`bun run test`)

---

## RINGKASAN EKSEKUTIF

| Item                       | Nilai |
| -------------------------- | ----- |
| Total TC dieksekusi        | 42    |
| PASSED                     | 39    |
| FAILED                     | 1     |
| UNCLEAR (butuh keputusan)  | 1     |
| FIXED dalam sesi ini       | 1     |

---

## Bug yang Ditemukan

### BUG-001 ⚠ UNCLEAR — Status machine: QC/SA dapat fast-close dari OPEN

- **Fingerprint**: `ticket:fast_close_bypass:open_to_closed_by_qc_sa`
- **Halaman / Endpoint**: `PATCH /api/tickets/:id`
- **Role**: QC, SUPER_ADMIN
- **Skenario**: PATCH status CLOSED pada ticket yang masih OPEN
- **Ekspektasi**: HTTP 400 (berdasarkan linear flow `OPEN→IN_PROGRESS→READY_FOR_QC→CLOSED`)
- **Kenyataan**: HTTP 200, ticket langsung CLOSED
- **Impact**: Ticket bisa ditutup tanpa melalui review process. Apakah ini fitur atau bug?
- **Langkah Reproduksi**:
  1. Buat ticket baru (status: OPEN)
  2. `PATCH /api/tickets/:id {"status":"CLOSED"}` dengan cookie QC atau SUPER_ADMIN
  3. Response: HTTP 200, status=CLOSED
- **Evidence**: NETWORK_LOG.md NET-002
- **Root cause**: `src/lib/ticket-helpers.ts:5` — matrix OPEN memiliki `qc: ['CLOSED']`. `isQc = role === 'QC' || role === 'SUPER_ADMIN'`
- **Status**: ⚠ UNCLEAR — implementasi ini by-design dalam kode, namun tidak terdokumentasi di `docs/AUTH.md`. Apakah QC memang boleh fast-reject ticket yang invalid? Jika iya, tambahkan ke docs. Jika tidak, hapus `'CLOSED'` dari `OPEN.qc` di ticket-helpers.ts.

---

### BUG-004 ✓ FIXED — admin/users/:id/block dan /role → 500 jika ID tidak ada

- **Fingerprint**: `admin:http500_on_missing_user:put_users_id_block_role`
- **Halaman / Endpoint**: `PUT /api/admin/users/:id/block`, `PUT /api/admin/users/:id/role`
- **Role**: SUPER_ADMIN
- **Skenario**: Kirim PUT dengan user ID yang tidak ada di database
- **Ekspektasi**: HTTP 404 `{"error":"User not found"}`
- **Kenyataan (sebelum fix)**: HTTP 500 — Prisma stack trace exposed
  ```
  Invalid prisma.user.update() invocation in users.write.ts:78:21
  An operation failed because it depends on one or more records...
  ```
- **Impact (sebelum fix)**: Stack trace internal terekspos ke client. Setiap request dengan UUID sembarang memicu 500.
- **Langkah Reproduksi**:
  1. `PUT /api/admin/users/00000000-0000-0000-0000-000000000001/block {"blocked":true}` dengan cookie SA
  2. Response: HTTP 500 (sebelum fix)
- **Evidence**: NETWORK_LOG.md NET-003
- **Root cause**:
  - `/block` (`users.write.ts:77`): Tidak ada `findUnique` pre-check. `$transaction([prisma.user.update(...)])` throws Prisma P2025.
  - `/role` (`users.write.ts:26`): `findUnique` ada, tapi tidak ada null check untuk `target`. Code lanjut ke `prisma.user.update()` saat `target === null`.
- **Fix diterapkan**:
  - `/block`: tambah `findUnique` + null check → return 404 sebelum transaction
  - `/role`: tambah `if (!target)` check setelah `findUnique` → return 404
- **Verifikasi fix**:
  - `PUT .../block fake-id` → HTTP 404 `{"error":"User not found"}` ✓
  - `PUT .../role fake-id` → HTTP 404 `{"error":"User not found"}` ✓
  - Self-block dengan user ID benar → HTTP 400 `{"error":"Tidak bisa memblokir diri sendiri"}` ✓
  - `bun run test` → 152 pass, 0 fail ✓
  - `bun run typecheck` → clean ✓

---

## Temuan Tambahan (Bukan Bug, Tapi Catatan)

### FINDING-001 — Seed tidak membuat QC user

`prisma/seed.ts` hanya membuat 3 user: SUPER_ADMIN, ADMIN, USER. Tidak ada QC.
Untuk QA yang membutuhkan test role QC, harus dibuat manual.
**Saran**: Tambahkan `qc@example.com` ke seed.

### FINDING-002 — Port server bisa berbeda dari .env PORT

Server aktif di port 3005, `.env PORT=3111`. Tidak ada error, tapi dapat membingungkan.
Mungkin karena cara server distart (manual dengan port override).

### FINDING-003 — API menerima XSS payload tanpa sanitasi

`POST /api/tickets {"title":"<script>alert(1)</script>"}` → HTTP 200, tersimpan di DB.
Ini umum untuk REST API — sanitasi adalah tanggung jawab frontend (React auto-escapes).
Perlu verifikasi CH-3 (UI/UX) bahwa React render tidak mengeksekusi script.
**Status**: Tidak dites secara UI dalam sesi ini (CH-3 belum selesai). Catat sebagai perlu verifikasi.

---

## Channel Coverage

| Channel | Nama                | TC Total | Passed | Failed | Unclear | Skipped | Coverage |
| ------- | ------------------- | -------- | ------ | ------ | ------- | ------- | -------- |
| CH-1    | Static Analysis     | 8        | 8      | 0      | 0       | 0       | 100%     |
| CH-2    | API Testing         | 24       | 23     | 0      | 1       | 0       | 96%      |
| CH-3    | UI/UX Testing       | 0        | 0      | 0      | 0       | 0       | 0% ⚠    |
| CH-4    | Database Validation | 4        | 4      | 0      | 0       | 0       | 100%     |
| CH-5    | Security Audit      | 4        | 4      | 0      | 0       | 0       | 100%     |
| CH-6    | Consistency Check   | 2        | 2      | 0      | 0       | 0       | 100%     |
| TOTAL   |                     | 42       | 41     | 0      | 1       | 0       | —        |

**⚠ CH-3 (UI/UX) = 0 TC** — sesi ini fokus pada API + static analysis. agent-browser tersedia tapi belum dieksekusi untuk UI coverage. Ini adalah BLOCKER untuk declare sesi COMPLETED menurut COMPLIANCE GATE.

---

## CH-1 Static Analysis — Temuan

| Temuan | File:line | Severity | Status |
| ------ | --------- | -------- | ------ |
| `/api/admin/users/:id/block` tidak ada `findUnique` pre-check | `users.write.ts:77` | HIGH | FIXED |
| `/api/admin/users/:id/role` — `target` null tidak di-handle | `users.write.ts:31` | HIGH | FIXED |
| `QC` dalam ticket-helpers dapat close dari OPEN | `ticket-helpers.ts:5` | UNCLEAR | Needs product decision |
| `src/routes/dev.tsx` 3600+ baris | `dev.tsx:1` | WARN | Known, dari SCALING.md |
| `src/app.ts` 1800+ baris | `app.ts:1` | WARN | Known dari SCALING.md |
| `isQc = QC OR SUPER_ADMIN` — tidak ada dokumentasi di docs/ | `ticket-helpers.ts:2` | INFO | Noted |
| Seed tidak punya QC user | `seed.ts:56` | INFO | Noted |

---

## COMPLIANCE GATE STATUS

| Channel | Artifact yang dicek               | Ada? | Catatan                                     |
| ------- | --------------------------------- | ---- | ------------------------------------------- |
| CH-1    | file:line references di NETWORK_LOG | ✓  | Lihat NET-003 root cause                    |
| CH-2    | curl commands di NETWORK_LOG      | ✓    | NET-001 hingga NET-009                      |
| CH-3    | screenshots/discovery/desktop/    | ✗    | Belum dieksekusi                            |
| CH-3    | screenshots/discovery/mobile/     | ✗    | Belum dieksekusi                            |
| CH-3    | screenshots/passed + evidence/    | ✗    | Belum dieksekusi                            |
| CH-4    | DB query di NETWORK_LOG           | ✓    | NET-008 — create ticket → DB check          |
| CH-5    | adversarial payload di NETWORK_LOG| ✓    | NET-006 (XSS), NET-007 (SQL injection)      |
| CH-6    | cross-check di NETWORK_LOG        | ✓    | NET-009 — API count vs DB count             |

**Verdict: INCOMPLETE** — CH-3 belum dieksekusi. Status sesi: IN_PROGRESS (perlu lanjut sesi CH-3).

---

## Action Items untuk Sesi Berikutnya

1. **[URGENT] Eksekusi CH-3 (UI/UX)** — agent-browser discovery semua halaman per role, desktop + mobile viewport
2. **[DECISION] BUG-001** — konfirmasi apakah QC fast-close dari OPEN adalah fitur atau bug, update docs atau fix matrix
3. **[ENHANCEMENT] Tambah QC user ke seed** — agar tidak perlu buat manual setiap kali QA
4. **[INFO] Verifikasi XSS rendering** — buka ticket dengan title `<script>alert(1)</script>` di browser, pastikan React escape dengan benar
