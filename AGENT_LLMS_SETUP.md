# Instruksi Agent: Implementasi `llms.txt` (auto-generated + live endpoint)

> Salin SELURUH file ini ke agent di project turunan. Project itu adalah
> turunan dari **base-template** (Bun + Elysia + Prisma + React + Vite 8
> middleware mode). Tujuan: `llms.txt` yang otomatis terisi dari sumber
> kebenaran project dan disajikan live di `GET /llms.txt`.
>
> ⚠️ JANGAN beri nama file output instruksi ini `LLMS.txt`. Di macOS
> (case-insensitive FS) itu akan menimpa artifact `llms.txt` yang di-generate.

---

## 0. Konsep

`llms.txt` adalah ringkasan project untuk LLM. Kunci anti-drift: **jangan tulis
data dua kali.** Generator membaca ulang sumber yang sudah ada:

| Bagian llms.txt | Sumber kebenaran |
|-----------------|------------------|
| Nama, versi, deskripsi | `package.json` (+ fallback paragraf pertama `README.md`) |
| API Routes | `src/lib/routes-catalog.ts` (`ROUTES_CATALOG`) |
| Database Schema | `prisma/schema.prisma` via `src/lib/schema-parser.ts` (`parseSchema`) |
| Environment Variables | `src/lib/env-map-catalog.ts` (`ENV_DEFS`) |
| Recent Changes | `CHANGELOG.md` via `src/lib/changelog-parser.ts` (`parseChangelog`) |
| Documentation links | `DOC_SUMMARIES` (hardcoded di generator) |

Generator = **pure function** (`generateLlmsTxt(data)` → string) + wrapper
pembaca filesystem (`buildLlmsTxt(root)`). Ini bikin mudah dites.

---

## 1. Prasyarat — VERIFIKASI DULU, jangan asumsi

Karena project turunan, file katalog ini **mungkin sudah ada** (tapi bisa
nama/bentuk beda). Jalankan dan baca hasilnya sebelum menulis kode:

```bash
ls -la src/lib/routes-catalog.ts src/lib/env-map-catalog.ts \
       src/lib/schema-parser.ts src/lib/changelog-parser.ts 2>&1
```

Untuk tiap file yang ADA, cek nama export-nya:

```bash
grep -n "export " src/lib/routes-catalog.ts src/lib/env-map-catalog.ts \
                  src/lib/schema-parser.ts src/lib/changelog-parser.ts
```

- Jika export **persis** `ROUTES_CATALOG`, `ENV_DEFS`, `parseSchema`,
  `parseChangelog` → langsung pakai (lihat §2).
- Jika **nama beda** → sesuaikan import di generator, JANGAN rename file
  katalog yang sudah dipakai modul lain (itu kontrak internal).
- Jika **tidak ada** → katalog itu harus dibuat lebih dulu. Itu di luar scope
  instruksi ini; laporkan ke user file mana yang hilang dan minta keputusan.

Cek bentuk tipe yang dipakai generator (sesuaikan field jika beda):

```bash
grep -n "interface RouteEntry\|method\|path\|auth\|category\|description" src/lib/routes-catalog.ts | head
grep -n "envKey\|required\|default\|description" src/lib/env-map-catalog.ts | head
grep -n "models\|enums\|relations\|tableName\|fields" src/lib/schema-parser.ts | head
grep -n "version\|date\|sections" src/lib/changelog-parser.ts | head
```

---

## 2. File 1 — Generator inti

Buat `src/lib/llms-generator.ts`. Ini versi yang sudah terbukti jalan:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ChangelogEntry, parseChangelog } from './changelog-parser'
import { ENV_DEFS } from './env-map-catalog'
import { ROUTES_CATALOG, type RouteEntry } from './routes-catalog'
import { type ParsedSchema, parseSchema } from './schema-parser'

const PROJECT_ROOT = join(import.meta.dir, '../..')

export interface ProjectMeta {
  name: string
  version: string
  description: string
}

export interface DocLink {
  title: string
  path: string
  summary: string
}

export interface LlmsData {
  meta: ProjectMeta
  routes: RouteEntry[]
  schema: ParsedSchema
  env: typeof ENV_DEFS
  changelog: ChangelogEntry[]
  docs: DocLink[]
}

// One-line summaries for the doc set. Keep in sync with files in docs/.
// SESUAIKAN daftar ini dengan docs/ project turunan.
const DOC_SUMMARIES: Record<string, string> = {
  'CLAUDE.md': 'Project overview, runtime/tooling commands, folder structure',
  'README.md': 'Human-facing setup and tech stack',
  'docs/API.md': 'All HTTP route definitions and contracts',
  'docs/AUTH.md': 'Auth flow, roles, sessions, ticket status machine',
  'docs/DATABASE.md': 'Prisma schema, Redis namespaces, audit logs',
  'docs/FRONTEND.md': 'React routes, hooks, components, UI conventions',
  'docs/MCP.md': 'MCP server tools and HTTP fallback',
  'docs/FILE-HEALTH.md': 'File size limits and split rules',
}

function readFirstParagraph(absPath: string): string {
  try {
    const raw = readFileSync(absPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>')) continue
      return trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    }
  } catch {}
  return ''
}

export function collectLlmsData(root: string = PROJECT_ROOT): LlmsData {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))

  let schema: ParsedSchema = { models: [], enums: [], relations: [] }
  try {
    schema = parseSchema(readFileSync(join(root, 'prisma/schema.prisma'), 'utf-8'))
  } catch {}

  const docs: DocLink[] = Object.entries(DOC_SUMMARIES).map(([path, summary]) => ({
    title: path.split('/').pop()!.replace(/\.md$/, ''),
    path,
    summary,
  }))

  return {
    meta: {
      name: pkg.name ?? 'unknown',
      version: pkg.version ?? '0.0.0',
      description: pkg.description || readFirstParagraph(join(root, 'README.md')) || 'No description',
    },
    routes: ROUTES_CATALOG,
    schema,
    env: ENV_DEFS,
    changelog: parseChangelog(),
    docs,
  }
}

function renderRoutes(routes: RouteEntry[]): string {
  const byCategory = new Map<string, RouteEntry[]>()
  for (const r of routes) {
    const list = byCategory.get(r.category) ?? []
    list.push(r)
    byCategory.set(r.category, list)
  }
  const lines: string[] = []
  for (const [category, list] of byCategory) {
    lines.push(`\n### ${category}`)
    for (const r of list) {
      lines.push(`- \`${r.method} ${r.path}\` (${r.auth}) — ${r.description}`)
    }
  }
  return lines.join('\n')
}

function renderSchema(schema: ParsedSchema): string {
  const lines: string[] = []
  if (schema.enums.length) {
    lines.push('\n### Enums')
    for (const e of schema.enums) {
      lines.push(`- **${e.name}**: ${e.values.join(' | ')}`)
    }
  }
  if (schema.models.length) {
    lines.push('\n### Models')
    for (const m of schema.models) {
      const fieldNames = m.fields.map((f) => f.name).join(', ')
      lines.push(`- **${m.name}** (table \`${m.tableName}\`): ${fieldNames}`)
    }
  }
  return lines.join('\n')
}

function renderEnv(env: typeof ENV_DEFS): string {
  const lines: string[] = []
  for (const e of env) {
    const req = e.required ? 'required' : `optional, default: ${e.default ?? 'none'}`
    lines.push(`- \`${e.envKey}\` (${req}) — ${e.description}`)
  }
  return lines.join('\n')
}

function renderChangelog(entries: ChangelogEntry[]): string {
  const recent = entries.filter((e) => e.version !== 'Unreleased').slice(0, 3)
  if (!recent.length) return '\n_No released versions yet._'
  const lines: string[] = []
  for (const entry of recent) {
    lines.push(`\n### ${entry.version}${entry.date ? ` — ${entry.date}` : ''}`)
    for (const [section, items] of Object.entries(entry.sections)) {
      for (const item of items) {
        lines.push(`- ${section}: ${item}`)
      }
    }
  }
  return lines.join('\n')
}

function renderDocs(docs: DocLink[]): string {
  return docs.map((d) => `- [${d.title}](${d.path}): ${d.summary}`).join('\n')
}

export function generateLlmsTxt(data: LlmsData): string {
  const { meta } = data
  return `# ${meta.name} (v${meta.version})

> ${meta.description}

This file is auto-generated by \`bun run docs:llms\`. Do not edit by hand —
it is rebuilt from package.json, the route catalog, Prisma schema, env catalog,
CHANGELOG.md, and the docs/ folder. Edit those sources instead.

## Documentation
${renderDocs(data.docs)}

## API Routes
${renderRoutes(data.routes)}

## Database Schema
${renderSchema(data.schema)}

## Environment Variables
${renderEnv(data.env)}

## Recent Changes
${renderChangelog(data.changelog)}
`
}

export function buildLlmsTxt(root?: string): string {
  return generateLlmsTxt(collectLlmsData(root))
}
```

---

## 3. File 2 — CLI generator

Buat `scripts/gen-llms.ts`:

```ts
#!/usr/bin/env bun
/**
 * Generates llms.txt at the project root from live project sources.
 * Core logic lives in src/lib/llms-generator.ts.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLlmsTxt } from '../src/lib/llms-generator'

const OUTPUT_PATH = join(process.cwd(), 'llms.txt')
const isCheck = process.argv.includes('--check')

const generated = buildLlmsTxt()

if (isCheck) {
  const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf-8') : ''
  if (current !== generated) {
    console.error('✗ llms.txt is out of date. Run `bun run docs:llms` and commit the result.')
    process.exit(1)
  }
  console.log('✓ llms.txt is up to date.')
  process.exit(0)
}

writeFileSync(OUTPUT_PATH, generated)
console.log(`✓ Wrote ${OUTPUT_PATH} (${generated.length} chars)`)
```

Tambahkan ke `package.json` (bagian `scripts`):

```json
"docs:llms": "bun scripts/gen-llms.ts",
"docs:llms:check": "bun scripts/gen-llms.ts --check",
```

---

## 4. File 3 — Live endpoint Elysia

Buat `src/routes/llms.ts`:

```ts
import { Elysia } from 'elysia'
import { buildLlmsTxt } from '../lib/llms-generator'

export const llmsRouter = new Elysia().get(
  '/llms.txt',
  () =>
    new Response(buildLlmsTxt(), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    }),
  {
    detail: {
      tags: ['Utility'],
      summary: 'LLM-friendly project summary',
      description:
        'Auto-generated llms.txt: project metadata, routes, schema, env vars, and recent changes. Rebuilt live from project sources on each request.',
      responses: { 200: { description: 'Plain-text llms.txt' } },
    },
  },
)
```

Daftarkan di `src/app.ts`:

```ts
import { llmsRouter } from './routes/llms'   // di blok import
// ...
  .use(llmsRouter)                            // di rantai createApp()
```

---

## 5. ⚠️ BUG KRITIS — WAJIB DIPERBAIKI (jangan dilewati)

Project base-template menyajikan frontend lewat intersep di `src/index.tsx`.
Ada fungsi `isApiRoute(pathname)` yang menentukan apakah sebuah request
diteruskan ke Elysia atau disajikan sebagai frontend/static.

**Masalah:** `/llms.txt` mengandung titik (`.`), jadi default-nya
diperlakukan sebagai **static asset**. Akibatnya:

- **Dev (Vite):** Vite menyajikan FILE FISIK `llms.txt` dari disk (statis),
  BUKAN endpoint live. Tampak "jalan" tapi salah sumber.
- **Production:** file tidak ada di `dist/` → jatuh ke **SPA fallback** →
  balas `index.html` (HTML React), BUKAN teks. Endpoint live tak pernah kepakai
  dan di browser tampak "putih kosong".

**Fix:** daftarkan `/llms.txt` sebagai route yang diteruskan ke Elysia.
Cari di `src/index.tsx`:

```ts
const API_PREFIXES = ['/api/', '/webhook/', '/ws/', '/health']

function isApiRoute(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === '/health'
}
```

Ubah menjadi:

```ts
const API_PREFIXES = ['/api/', '/webhook/', '/ws/', '/health']
const API_EXACT = new Set(['/health', '/llms.txt'])

function isApiRoute(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname.startsWith(p)) || API_EXACT.has(pathname)
}
```

> Catatan: struktur `src/index.tsx` bisa beda di turunan. Yang penting:
> pastikan request `/llms.txt` SAMPAI ke route Elysia, bukan ke serve-frontend.
> Verifikasi via header response (lihat §7) — `Cache-Control: public, max-age=300`
> = benar (dari route); `no-cache` + `ETag` = SALAH (masih static Vite).

### Bug terkait — `res.appendHeader is not a function` (dev only)

Jika `src/index.tsx` punya shim Bun Request → Node `ServerResponse` untuk Vite
middleware mode, Vite 8 memanggil `res.appendHeader` (untuk header `Vary`).
Kalau shim tidak punya method itu, dev server error. Tambahkan ke objek shim
(di sebelah `removeHeader`), dengan semantik APPEND (bukan overwrite):

```ts
appendHeader(name: string, value: string | string[]) {
  const key = name.toLowerCase()
  const add = Array.isArray(value) ? value.join(', ') : value
  const existing = this.headers[key]
  this.headers[key] = existing ? `${existing}, ${add}` : add
  return this
},
```

---

## 6. Self-reference + tes

### 6a. Daftarkan endpoint di route catalog
Tambahkan entri ke `ROUTES_CATALOG` di `src/lib/routes-catalog.ts` supaya
`/llms.txt` muncul di dalam dirinya sendiri (sesuaikan field dengan tipe lokal):

```ts
{ method: 'GET', path: '/llms.txt', auth: 'public', category: 'utility', description: 'LLM-friendly project summary (auto-generated)' },
```

### 6b. Unit test — `tests/unit/llms-generator.test.ts`
Tes `generateLlmsTxt` dengan fixture sintetis (pure, deterministik) + smoke
test `buildLlmsTxt()` dari sumber asli. Assert minimal:
- header `# <name> (v<version>)` dan `> <description>`
- kata `auto-generated`
- route digrup per kategori, format `` `GET /path` (auth) ``
- model & enum schema muncul
- env required vs optional
- changelog merender versi rilis tapi **skip** `Unreleased`
- doc link
- `buildLlmsTxt()` memuat `## API Routes`, `## Database Schema`,
  `## Environment Variables` dan model nyata project

### 6c. Integration test — `tests/integration/llms.test.ts`
Pakai pola `createTestApp()` + `app.handle(new Request('http://localhost/llms.txt'))`
(tanpa server). Assert: status 200, `content-type` mengandung `text/plain`,
body memuat `## API Routes` + `## Database Schema`, dan menyebut `/llms.txt`.

---

## 7. Verifikasi sebelum claim selesai

```bash
bun run docs:llms          # tulis llms.txt, cek jumlah char masuk akal (>200)
bun run docs:llms:check    # harus "up to date" tepat setelah generate
bun run typecheck          # hijau
bun test                   # semua hijau (termasuk 2 file tes baru)
```

Verifikasi endpoint live BENAR (server harus di-RESTART, bukan HMR, karena
`src/index.tsx` + `app.ts` adalah server entry):

```bash
curl -s -D - -o /tmp/llms.txt http://localhost:<PORT>/llms.txt \
  | grep -iE 'HTTP|content-type|cache-control'
head -1 /tmp/llms.txt
```

Lulus jika: `200`, `text/plain; charset=utf-8`,
**`Cache-Control: public, max-age=300`**, dan baris pertama = `# <name> (v<ver>)`.
Jika `Cache-Control: no-cache` atau body diawali `<!doctype html>` → §5 belum
benar; request masih disajikan statis/SPA.

---

## 8. Dokumentasi & commit (ikuti aturan repo)

- Update `docs/API.md` → tambahkan `/llms.txt` di bagian Utility.
- Update `CLAUDE.md` → catat perintah `docs:llms` + bahwa `llms.txt` adalah
  artifact generated (jangan diedit tangan).
- Tambahkan entri `CHANGELOG.md` di bawah `[Unreleased]` (Added).
- (Opsional) Commit file `llms.txt` hasil generate. Jika di-commit, WAJIB
  jalankan `docs:llms:check` di CI agar tak pernah basi. Jika TIDAK ingin
  meng-commit (karena live endpoint sudah cukup), masukkan `llms.txt` ke
  `.gitignore` — tapi tetap commit `scripts/gen-llms.ts` agar bisa di-generate.
- Branch baru (`feature/llms-txt`), commit conventional, JANGAN push/merge
  tanpa perintah user eksplisit.

---

## 9. Daftar bug yang TIDAK boleh terulang

1. **Lupa `/llms.txt` di `isApiRoute`** → blank/HTML di prod. (§5) — paling sering.
2. **`appendHeader` hilang di shim Vite** → dev server crash. (§5)
3. **Menulis ulang data** (routes/env/schema hardcoded di generator) alih-alih
   membaca katalog → drift. Selalu baca sumber.
4. **Menamai file output `LLMS.txt`** di macOS → menimpa `llms.txt` (FS
   case-insensitive).
5. **Changelog `Unreleased` ikut ter-render** → filter `e.version !== 'Unreleased'`.
6. **Lupa restart server** setelah ubah `src/index.tsx`/`app.ts` → mengira fix
   gagal padahal hanya belum reload (server entry bukan HMR).
```
