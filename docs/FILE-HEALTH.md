# FILE-HEALTH — Aturan Ukuran & Struktur File

Tujuan: file tetap kecil, kohesif, mudah diproses AI maupun manusia.

## Batas Ukuran

| Tipe File | Maks Baris | Maks Karakter |
|-----------|-----------|---------------|
| Route handler | 150 | 6.000 |
| Service / use-case | 300 | 12.000 |
| Repository / query | 250 | 10.000 |
| Schema / validation | 200 | 8.000 |
| Types / interfaces | 300 | 10.000 |
| Utility / helper | 200 | 8.000 |
| Config | 100 | 4.000 |
| Test file | 400 | 16.000 |

> **Hard limit global:** tidak ada file melebihi **500 baris** atau **20.000
> karakter**, kecuali file generated (migration, seed, generated types).

## Aturan Wajib

1. **Satu file, satu tanggung jawab.** Harus bisa dijelaskan dalam satu
   kalimat pendek. Butuh kata "dan" lebih dari sekali → pecah.
2. **Tidak ada "god file".** Jangan campur >1 route group dalam satu handler,
   business logic dengan transport layer (HTTP/WS/queue), atau type definition
   dengan implementation panjang.
3. **Penamaan eksplisit.** Pola `[domain].[layer].ts` (`user.service.ts`).
   Hindari `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`.
4. **Index file = re-export only**, maks 50 baris.
5. **Tidak ada barrel import dalam** (>2 level) — menyulitkan trace dependency.

## Kapan Pecah File

Salah satu terpenuhi → pecah:
- Melebihi batas baris/karakter di tabel.
- Ada ≥2 fungsi/class yang tidak saling bergantung dalam satu file.
- File punya >3 exported symbol utama.
- Sulit dinamai spesifik tanpa kata "dan".
- Edit di satu bagian sering memicu konflik di bagian lain.

Pola pemecahan: service besar → `*.query.service.ts` / `*.command.service.ts`
/ `*.notification.service.ts`; handler besar → `*.route.ts` (registration) +
`*.handler.ts` + `*.middleware.ts`; types besar → `types/<domain>.types.ts`.

## Instruksi untuk AI

1. **Tolak menambah kode** ke file yang sudah mendekati/melebihi batas, kecuali
   tambahan sangat kecil (<10 baris) dan kohesif.
2. **Proaktif sarankan refactor** saat mendeteksi file tumbuh tidak sehat,
   sebelum menambah fitur ke file tsb. Jangan pecah sendiri tanpa izin user.
3. **Jangan buat "helper dump"** — setiap helper punya file bernama spesifik.
4. **Selalu buat file baru** jika implementasi tidak masuk alami ke file yang ada.
5. **Periksa ukuran sebelum edit** — jika >80% batas, sarankan pecah dulu.
6. **Pakai inspektor, jangan menebak:**
   - Frontend: `/dev?tab=file-health` (SUPER_ADMIN).
   - Backend: `GET /api/admin/file-health` (lihat `docs/API.md`).
   - MCP: tool `project_file_health` via `debug-dev` (lokal) atau
     `stg_file_health` via `debug-stg` (staging).

## Pengecualian

Dikecualikan dari batas ukuran: `*.generated.ts`, `*.migration.ts` /
`*_migration.sql`, `*.seed.ts`, file di `__fixtures__/` atau `__mocks__/`.

Pengecualian **tidak berlaku** untuk config runtime (`app.ts`, `server.ts`) —
tetap harus ringkas.
