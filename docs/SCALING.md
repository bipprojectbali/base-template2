# SCALING — Panduan Ringkas untuk AI

Aturan konkret men-scale Bun + Elysia + Prisma + React. Diterapkan langsung di
project ini — bukan teori.

## Prinsip Utama

1. **Jangan lewati urutan.** Fondasi → reliability → performa.
2. **Tidak ada rewrite total.** Semua perubahan reorganisasi atau additive.
3. **Ukur sebelum optimasi.** Jangan implement infinite scroll sebelum ada data
   yang menunjukkan lambat.
4. **Satu domain per commit.** Pemecahan file bertahap, bukan sekaligus.

---

## Phase 1 — Fondasi

> Sebelum menambah fitur besar apapun.

### 1A. Pecah backend monolith

`src/app.ts` (1800+ baris) sudah melewati batas. Saat menambah domain, pecah
ke sub-router:

```
src/
  app.ts              ← orchestrator, cuma .use() sub-router
  routes/
    auth.ts
    admin/{users,logs,schema,sessions}.ts
    tickets.ts
  lib/
    auth-middleware.ts  ← sudah ada
    db.ts               ← sudah ada
    cache.ts            ← buat saat dibutuhkan
    pagination.ts       ← buat saat dibutuhkan
```

Route file max 500 baris. Lebih → pecah lagi.

### 1B. Centralize auth middleware

**Sudah ada.** `src/lib/auth-middleware.ts` (`betterAuthPlugin`) + `src/app.ts`
(`guardSuperAdmin`/`guardQcOrAdmin`/`guardAuth`). Jangan buat duplikasi.

```typescript
const guard = guardSuperAdmin(authUser)
if (guard) return guard
```

### 1C. Prisma transaction di operasi kritis

Operasi multi-step harus atomic:

```typescript
// Benar — atomic
await prisma.$transaction([
  prisma.user.update({ where: { id }, data: { blocked: true } }),
  prisma.session.deleteMany({ where: { userId: id } }),
])
```

Wajib `$transaction`: update + delete bersamaan, create + relasi, bulk upsert
yang harus konsisten.

### 1D. Pagination default di semua findMany

Tidak boleh ada `findMany` tanpa `take`.

```typescript
// src/lib/pagination.ts
export function parsePagination(query: Record<string, unknown>, defaultLimit = 50, maxLimit = 200) {
  return {
    limit: Math.min(Number(query.limit) || defaultLimit, maxLimit),
    offset: Number(query.offset) || 0,
  }
}
```

Limit rekomendasi: list umum 50, audit log 100, search 20.

---

## Phase 2 — Reliability

> Setelah Phase 1 selesai.

### 2A. Integration test minimal per endpoint

**Sudah ada pattern-nya** via `tests/helpers.ts` + `tests/integration/`. Setiap
endpoint wajib ≥3 test: happy path, unauthorized, invalid/not found.

```typescript
const app = createTestApp()
const res = await app.handle(new Request('http://localhost/api/...', {
  method: 'POST',
  headers: { cookie: `better-auth.session_token=${signedToken}` },
  body: JSON.stringify({ ... }),
}))
expect(res.status).toBe(200)
```

Target: endpoint kritis (auth, admin, tickets) 60–100%, total minimal 40%.

### 2B. Redis cache untuk query berulang

Redis sudah ada (`src/lib/redis.ts`). Buat wrapper saat ada query terbukti lambat:

```typescript
// src/lib/cache.ts (buat saat dibutuhkan)
export async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch {}
  const data = await fetcher()
  if (data != null) redis.set(key, JSON.stringify(data), 'EX', ttlSeconds).catch(() => {})
  return data
}

export async function invalidateCache(...keys: string[]) {
  if (keys.length === 0) return
  redis.del(...keys).catch(() => {})
}
```

TTL: user list 60s, audit logs 30s. **Jangan cache:** session (dihandle Better
Auth via `ba:kv:*`), data sensitif. Setiap mutasi harus invalidate cache relevan.

### 2C. Soft delete untuk data penting

Tambah `deletedAt DateTime?` ke model yang tak boleh hard-delete (Ticket, User
jika perlu). Helper: `notDeleted = { deletedAt: null }`, `softDelete()` →
`{ deletedAt: new Date() }`. Project ini saat ini hard delete — terapkan saat
butuh audit trail / recovery.

### 2D. API versioning

Buat `/api/v1/` saat ada breaking change pertama. Additive changes tidak perlu
bump versi (lihat `docs/AI_CONTRACT.md`).

---

## Phase 3 — Performance & Scale

> Hanya saat ada data nyata yang menunjukkan bottleneck.

### 3A. HTTP Cache-Control static assets

**Sudah ada** di `src/index.tsx`: asset hashed (`/assets/`) →
`max-age=31536000, immutable`; lainnya → `max-age=3600`. Jangan ubah ke
`no-cache` global.

### 3B. Query tuning TanStack Query

Nilai per tipe data, bukan default global:

```typescript
// Stabil (user list, config)
{ staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, refetchIntervalInBackground: false }
// Semi real-time (session, presence)
{ staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false }
// Sering berubah (ticket status, logs)
{ staleTime: 10_000, refetchOnWindowFocus: true }
// Static (schema, routes metadata)
{ staleTime: Infinity, refetchInterval: false }
```

### 3C. Optimistic updates untuk mutasi yang sering

```typescript
const mutation = useMutation({
  mutationFn: (data) => apiFetch('/api/...', { method: 'PATCH', body: JSON.stringify(data) }),
  onMutate: async (data) => {
    await qc.cancelQueries({ queryKey: KEY })
    const previous = qc.getQueryData(KEY)
    qc.setQueryData(KEY, (old: any) => ({ ...old, /* update optimistis */ }))
    return { previous }
  },
  onError: (_e, _d, ctx) => { if (ctx?.previous) qc.setQueryData(KEY, ctx.previous) },
  onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
})
```

Pakai untuk toggle (block/unblock, active), update name/role. Jangan untuk bulk
op, create baru, operasi jarang.

### 3D. Cursor-based pagination untuk list panjang

Saat offset pagination terbukti lambat (biasanya >10k rows):

```typescript
const limit = Math.min(Number(query.limit) || 20, 100)
const items = await prisma.resource.findMany({
  take: limit + 1,
  ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  orderBy: { createdAt: 'desc' },
})
const hasMore = items.length > limit
return {
  items: hasMore ? items.slice(0, limit) : items,
  nextCursor: hasMore ? items[limit - 1]?.id : undefined,
}
```

Frontend: `useInfiniteQuery` + IntersectionObserver untuk auto-load saat scroll.

### 3E. Pecah frontend component besar

>500 baris = evaluasi, >1000 baris = wajib pecah. Kandidat: `dev.tsx` (3600+),
`dashboard.tsx` (718). Pola untuk `dev.tsx`: orchestrator (AppShell + tab
routing) + `dev/{Overview,Users,AppLogs,UserLogs,Database,Project}Panel.tsx`.
Pakai `memo()` di component yang props-nya jarang berubah.

---

## Session Expiry & Auto-Redirect

Dua layer:
1. **Polling** — `useSession` (`hooks/useAuth.ts`) dengan `refetchInterval`;
   session hilang → redirect `/login`.
2. **401 interceptor** — di `QueryCache` global, tangkap `UnauthorizedError` →
   `queryClient.setQueryData(['auth', 'session'], null)`.

---

## Code Splitting (Frontend)

Vendor splitting di `vite.config.ts` saat bundle >1MB — `manualChunks` per
vendor (`react`, `@mantine`, `@tanstack`, `react-icons`, `@xyflow`, sisanya
`vendor`).

---

## Anti-Pattern

| ❌ Jangan | ✅ Gantinya |
|---|---|
| `findMany` tanpa `take` | `parsePagination()` |
| Auth check copy-paste | `guardSuperAdmin/guardQcOrAdmin/guardAuth` |
| Multi-step DB tanpa transaction | `prisma.$transaction([...])` |
| Hard delete data penting | Soft delete `deletedAt` |
| `refetchInterval` sama semua | Sesuaikan per tipe data |
| Component >1000 baris | Pecah per panel |
| Catch error tanpa feedback | Selalu tampilkan notifikasi |
| Optimistic update tanpa rollback | Sertakan `onError` + context |
| Cache tapi lupa invalidate | Audit mutasi yang ubah data ter-cache |
