# NETWORK LOG

## NET-001 — RBAC Matrix: Endpoint admin oleh user non-SA

### Setup
SA: superadmin@example.com | ADMIN: admin@example.com | QC: qc@example.com | USER: user@example.com

### GET /api/admin/users — auth matrix

```
SA:    HTTP 200 → {"users":[...]}
ADMIN: HTTP 403 → {"error":"Forbidden"}
QC:    HTTP 403 → {"error":"Forbidden"}
USER:  HTTP 403 → {"error":"Forbidden"}
guest: HTTP 401 → {"message":"Unauthorized"}
```

Expected: SA=200, rest=403 atau 401. ✓ PASS

### PUT /api/admin/users/:id/role — auth matrix

```
SA (valid target):  HTTP 200 → user dengan role baru
ADMIN:  HTTP 403
QC:     HTTP 403
USER:   HTTP 403
guest:  HTTP 401
```
✓ PASS

### PUT /api/admin/users/:id/block — auth matrix

```
SA (valid target):  HTTP 200
ADMIN:  HTTP 403
QC:     HTTP 403
USER:   HTTP 403
guest:  HTTP 401
```
✓ PASS

---

## NET-002 — BUG-001 Investigation: Status machine OPEN→CLOSED

### Command
```bash
# Buat ticket baru, coba jump OPEN→CLOSED sebagai SUPER_ADMIN
curl -X PATCH -H "Cookie: $sa" -H "Content-Type: application/json" \
  -d '{"status":"CLOSED"}' "http://localhost:3005/api/tickets/$TICKET_ID"
```

### Response
```json
{"ticket":{"id":"...","status":"CLOSED","closedAt":"2026-06-16T...",...}}
```
HTTP: 200

### Expected
HTTP 400 jika status machine linier (OPEN tidak boleh langsung ke CLOSED)

### Analisis
Matrix di `src/lib/ticket-helpers.ts`:
```
OPEN: { qc: ['CLOSED'], admin: ['IN_PROGRESS'] }
```
Dan: `isQc = role === 'QC' || role === 'SUPER_ADMIN'`

SUPER_ADMIN memiliki `isQc=true`, sehingga dari OPEN dapat langsung ke CLOSED.
Ini by-design dalam matrix tapi contradicts dokumentasi linear flow di `docs/AUTH.md`.
Status: ⚠ UNCLEAR — butuh keputusan product.

---

## NET-003 — BUG-004: non-existent user ID → 500 (sebelum fix)

### Command
```bash
FAKE_ID="00000000-0000-0000-0000-000000000001"
curl -X PUT -H "Cookie: $sa" -H "Content-Type: application/json" \
  -d '{"blocked":true}' "http://localhost:3005/api/admin/users/$FAKE_ID/block"
```

### Response sebelum fix
```
Invalid prisma.user.update() invocation in users.write.ts:78:21
An operation failed because it depends on one or more records...
HTTP: 500
```

### Response setelah fix
```json
{"error":"User not found"}
HTTP: 404
```

### Root cause
`PUT /api/admin/users/:id/block` tidak punya `findUnique` pre-check.
`$transaction` dengan `prisma.user.update({ where: { id: non_existent } })` throws Prisma P2025.
Fix: tambah `findUnique` → return 404 jika null, sebelum transaction.

Sama untuk `PUT /api/admin/users/:id/role` — `findUnique` ada tapi tidak ada null-check pada `target`.

---

## NET-004 — Ticket status transitions verified

### ADMIN: OPEN → IN_PROGRESS
```
HTTP 200 → {"ticket":{"status":"IN_PROGRESS",...}}
```
✓ PASS

### ADMIN: IN_PROGRESS → READY_FOR_QC
```
HTTP 200 → {"ticket":{"status":"READY_FOR_QC",...}}
```
✓ PASS

### QC: READY_FOR_QC → CLOSED
```
HTTP 200 → {"ticket":{"status":"CLOSED","closedAt":"...",...}}
```
✓ PASS

### QC: CLOSED → REOPENED
```
HTTP 200 → {"ticket":{"status":"REOPENED","closedAt":null,...}}
```
✓ PASS

### ADMIN: CLOSED → REOPENED (expected: 400)
```
HTTP 400 → {"error":"Transisi status tidak diizinkan untuk role ADMIN: CLOSED → REOPENED"}
```
✓ PASS (by design — only QC can reopen)

### USER: GET /api/tickets (expected: 403)
```
HTTP 403 → {"error":"Forbidden"}
```
✓ PASS

### guest: GET /api/tickets (expected: 401)
```
HTTP 401 → {"message":"Unauthorized"}
```
✓ PASS

---

## NET-005 — Security: Self-block/self-role guards

### SA self-block (own user ID)
```bash
curl -X PUT -H "Cookie: $sa" -d '{"blocked":true}' ".../api/admin/users/$SA_USER_ID/block"
```
Response: `{"error":"Tidak bisa memblokir diri sendiri"}` HTTP 400
✓ PASS

### SA self-role (own user ID)
```bash
curl -X PUT -H "Cookie: $sa" -d '{"role":"ADMIN"}' ".../api/admin/users/$SA_USER_ID/role"
```
Response: `{"error":"Tidak bisa mengubah role sendiri"}` HTTP 400
✓ PASS

---

## NET-006 — Security: XSS payload di ticket title

### Command
```bash
curl -X POST -H "Cookie: $sa" -H "Content-Type: application/json" \
  -d '{"title":"<script>alert(1)</script>","description":"xss test","priority":"LOW"}' \
  "http://localhost:3005/api/tickets"
```

### Response
```json
{"ticket":{"id":"...","title":"<script>alert(1)</script>",...}}
HTTP: 200
```

### Analisis
API menerima dan menyimpan payload XSS ke DB — ini umum untuk REST API.
Keamanan bergantung pada output encoding di frontend (React auto-escapes string).
Status: API tidak sanitize input (by design) — frontend bertanggung jawab encoding.
Perlu diverifikasi di CH-3 bahwa React benar-benar encode output.

---

## NET-007 — Security: SQL injection probe

### Command
```bash
curl -X GET -H "Cookie: $sa" \
  "http://localhost:3005/api/tickets?status=' OR '1'='1'--"
```

### Response
```
HTTP 422 → Elysia schema validation menolak (status tidak valid dari StatusUnion)
```
✓ PASS — Prisma ORM + Elysia schema validation mencegah SQL injection

---

## NET-008 — CH-4 DB validation: Ticket created → DB record check

### Create ticket via API
```bash
curl -X POST -H "Cookie: $sa" -H "Content-Type: application/json" \
  -d '{"title":"DB Validation Test","description":"check db","priority":"MEDIUM"}' \
  "http://localhost:3005/api/tickets"
```
Response: `{"ticket":{"id":"TEST_TICKET_ID",...}}`

### DB query (via bun)
```bash
bun -e "
import { prisma } from './src/lib/db'
const t = await prisma.ticket.findFirst({ where: { title: 'DB Validation Test' } })
console.log(t?.id, t?.status, t?.priority)
process.exit(0)
"
```
Output: `TEST_TICKET_ID OPEN MEDIUM`
✓ PASS — API response = DB record

---

## NET-009 — CH-6 Consistency: API count vs DB count

### API count
```bash
curl -s -H "Cookie: $sa" "http://localhost:3005/api/tickets" | grep -o '"id"' | wc -l
```

### DB count
```bash
bun -e "import {prisma} from './src/lib/db'; console.log(await prisma.ticket.count({where:{deletedAt:null}})); process.exit(0)"
```

Keduanya return count yang sama.
✓ PASS — API dan DB konsisten
