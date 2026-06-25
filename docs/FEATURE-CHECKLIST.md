# FEATURE-CHECKLIST — Wajib Saat Menambah Fitur Baru

Setiap fitur baru (endpoint, domain logic, schema field, route, WS channel,
dst.) wajib lengkap dengan 3 hal di bawah **sebelum** dianggap selesai —
kecuali user eksplisit membebaskan salah satunya untuk fitur tsb.

> Tujuan: setiap fitur otomatis bisa diuji (CI), diinspeksi di dev
> (`debug-dev`), dan di staging (`debug-stg`). Tanpa ini, AI maupun manusia
> buta saat investigasi bug.

## 1. Test

| Tipe Fitur | Test Wajib | Lokasi |
|------------|-----------|--------|
| HTTP endpoint baru | 3 case: happy path, unauthorized, invalid/not found | `tests/integration/<domain>.test.ts` |
| Domain logic / service / util | Happy path + ≥1 edge case | `tests/unit/<name>.test.ts` |
| Schema field baru (Prisma) | Migration jalan + ≥1 integration test yang menyentuh field | sda |
| WS channel baru | Test koneksi + 1 test broadcast/receive | `tests/integration/ws-<name>.test.ts` |
| Frontend route baru | Backend yang dipanggil wajib ikut aturan di atas | — |

- Pakai `createTestApp()` + `app.handle(new Request(...))` dari
  `tests/helpers.ts` — tidak perlu server jalan.
- Sebelum claim selesai: `bun run test`, `bun run typecheck`, `bun run lint`
  semua hijau.
- Endpoint kontrak publik (lihat `docs/AI_CONTRACT.md` §10) butuh contract test
  di `tests/contract/`.

## 2. Tool `debug-dev`

Setiap fitur wajib bisa diinspeksi via MCP server `debug-dev`
(`scripts/mcp/server.ts`, modul di `scripts/mcp/tools/*.ts`).

| Fitur Baru | Tool Inspeksi Minimum | File |
|------------|----------------------|------|
| Endpoint admin / domain baru | List + get-by-id (readonly) | `tools/<domain>.ts` |
| Tabel/model Prisma baru | Row count + sample read | `tools/db.ts` |
| Redis key namespace baru | List keys + get value | `tools/redis.ts` |
| Log/event stream baru | Tail / filter N entri terakhir | `tools/logs.ts` |
| WS channel / presence baru | Snapshot state saat ini | `tools/presence.ts` |
| Mutation berisiko (block/role/migration) | Tool terpisah, input tervalidasi (zod) | `tools/<domain>.ts` |

- **Readonly default, write opt-in.** Tool yang mengubah state diberi nama
  eksplisit (`admin_...`, `dev_...`) dan tervalidasi.
- Daftarkan via modul existing dulu; buat file baru hanya jika tidak ada yang
  cocok. Verifikasi tool muncul via `scripts/mcp/test-client.ts`.

## 3. Tool `debug-stg`

Berjalan via `scripts/mcp/stg-server.ts` + modul `scripts/mcp/tools/stg.ts`.
Menyentuh staging HANYA via HTTP (`BASE_URL` + `MCP_SECRET`) — tidak akses
langsung DB/Redis staging. **Default readonly** kecuali user eksplisit minta tulis.

| Fitur Baru | Tool Inspeksi Minimum |
|------------|----------------------|
| Endpoint readonly (GET) | Tool yang memanggil endpoint tsb di STG |
| Endpoint write | Tool readonly yang verifikasi efek (mis. create → list & cek ada) |
| Schema field baru | Tool readonly yang menampilkan field dari endpoint terkait |
| Log/event baru | Tool yang menarik log STG via endpoint admin |

- Setiap endpoint readonly baru di `debug-dev` punya pasangan di `debug-stg`,
  kecuali yang memang khusus dev (mis. dev-auth).
- Output aman ditampilkan — jangan dump password hash, session token, secret.

## Checklist Akhir

- [ ] `bun run test` hijau (unit + integration)
- [ ] `bun run typecheck` hijau
- [ ] `bun run lint` hijau
- [ ] Tool inspeksi terpanggil di `debug-dev`
- [ ] Tool inspeksi terpanggil di `debug-stg` (readonly)
- [ ] Dokumentasi relevan diupdate (lihat tabel di `CLAUDE.md`) bila menyentuh business logic
- [ ] Tidak ada file melewati batas di `docs/FILE-HEALTH.md`

## Pengecualian

Boleh skip salah satu syarat **hanya jika** user eksplisit bilang "skip test",
"skip mcp dev", atau "skip mcp stg". Catat alasan di commit message. Default:
ketiganya wajib.
