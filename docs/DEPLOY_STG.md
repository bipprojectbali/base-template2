# MCP Deploy Server

Panduan agnostik membangun MCP server deploy otomatis (Docker, VPS, PaaS,
serverless). Project ini mendaftarkan satu deploy server di `.mcp.json`:
`base-template-deploy-stg` (`scripts/mcp/deploy.ts`).

## `.mcp.json` — Konfigurasi MCP Server

File di root project yang mendaftarkan **MCP server**. Claude Code membacanya
saat startup dan me-register semua server; tool-nya muncul dengan prefix
namespace `mcp__<nama-server>__<nama-tool>`.

```json
{
  "mcpServers": {
    "base-template-deploy-stg": {
      "command": "bun",
      "args": ["run", "scripts/mcp/deploy.ts"],
      "env": {
        "STACK_NAME": "${STG_STACK_NAME}",
        "BASE_URL": "${STG_BASE_URL}",
        "ENV": "stg",
        "GH_TOKEN": "${GH_TOKEN}",
        "GH_REPO": "${GH_REPO}"
      }
    }
  }
}
```

Dua jenis transport:

| Jenis | Key | Cocok untuk |
| ----- | --- | ----------- |
| **stdio** | `command` + `args` | Tool lokal (process di-spawn, JSON-RPC via stdin/stdout) |
| **HTTP** | `type: "http"` + `url` | Tool remote (Bearer auth opsional) |

Aturan:
- **Commit `.mcp.json`** — ini konfigurasi tooling (seperti `tsconfig.json`),
  bukan secret. Yang di-ignore hanya `.env`, `*.pem`, output build.
- Nilai `${VAR}` di-interpolasi dari environment Claude Code session — token
  tidak pernah di-hardcode ke file.
- Server stdio **standalone**: jangan import dari `src/`. Server harus jalan
  walau project broken; hanya bergantung pada SDK MCP, stdlib runtime, dan CLI
  eksternal (`git`, `gh`, `docker`).

### Lima env var standar

| Env Var | Keterangan |
| ------- | ---------- |
| `STACK_NAME` | Nama stack Portainer / service / app |
| `BASE_URL` | URL target untuk verifikasi versi live |
| `ENV` | Label environment (`stg`, `prod`, `preview`) |
| `GH_TOKEN` | GitHub PAT untuk `gh` CLI + `git push` (wajib untuk operasi tulis) |
| `GH_REPO` | `owner/repo`; opsional — fallback baca `git remote get-url origin` |

Konfigurasi via `process.env` dengan fallback supaya satu script dipakai
banyak project hanya dengan beda `.mcp.json`:

```typescript
const STACK_NAME = process.env.STACK_NAME ?? "my-app"
const STAGING_URL = process.env.BASE_URL ?? "https://my-app.example.com"
const REPO = process.env.GH_REPO ?? (() => {
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8" }).trim()
    const m = url.match(/github\.com[/:](.+?\/.+?)(?:\.git)?$/)
    if (m) return m[1]
  } catch {}
  return "owner/repo"
})()
```

## MCP server vs skill

Jika pipeline butuh polling, retry, timeout, parsing output CLI, atau akses
sistem presisi → **MCP server** (kode nyata, deterministik, output JSON).
Jika hanya instruksi naratif ke Claude → **skill**.

## Pipeline: Preflight → Bump → Commit → Push → Deploy → Verify

```
1. Pre-checks      branch target benar, working tree clean
2. Preflight scan  credential leak + migration check → BLOCK sebelum mutasi
3. Version bump    patch | minor | major (package.json)
4. Git commit      chore: bump X.X.X
5. Git push        origin/<branch>
6. Trigger deploy  CI/CD, Docker, script remote
7. Wait + verify   poll sampai versi target live
```

**Preflight sebelum mutasi.** Scan dulu — kalau BLOCKED, berhenti sebelum
menyentuh file. Commit bump yang gagal deploy menyisakan noise di history dan
harus di-reset manual.

## Empat tool standar

| Tool | Fungsi | Output inti |
| ---- | ------ | ----------- |
| `deploy` | Deploy penuh (`bump`, `message?`, `skip_commit?`) | `{ success, version, target_url, steps[] }` |
| `check_version` | Bandingkan versi lokal vs target | `{ local, target, in_sync }` |
| `deploy_status` | Status CI/CD terakhir | `{ workflows[] }` |
| `preflight` | Scan tanpa deploy | `{ credential_scan, migration_check, deploy_safe }` |

## Credential scan — pattern regex

Jalan otomatis di preflight, **diff scan** (hanya baris `+`, bukan seluruh
codebase). Pipeline berhenti (`blocked_by: "credential_leak"` /
`"sensitive_file"`) jika ada temuan.

```bash
git diff origin/stg..HEAD -- . ":(exclude)*.lock" ":(exclude)package-lock.json" \
  | grep '^+' | grep -v '^+++'
```

| Pattern | Regex (ringkas) |
| ------- | --------------- |
| `anthropic_key` | `sk-ant-[a-zA-Z0-9\-_]{20,}` |
| `openai_key` | `sk-[a-zA-Z0-9]{48}` |
| `stripe_key` | `sk_(live\|test)_[a-zA-Z0-9]{24,}` |
| `github_pat` | `ghp_[a-zA-Z0-9]{36,}` |
| `github_oauth` | `gho_[a-zA-Z0-9]{36,}` |
| `github_fine_grained` | `github_pat_[a-zA-Z0-9_]{22,}` |
| `slack_token` | `xox[baprs]-[a-zA-Z0-9\-]{20,}` |
| `google_api_key` | `AIza[a-zA-Z0-9\-_]{35}` |
| `google_oauth_token` | `ya29\.[a-zA-Z0-9\-_]{20,}` |
| `private_key_pem` | `-----BEGIN [A-Z ]+ PRIVATE KEY-----` |
| `bearer_hardcoded` | `Bearer\s+[a-zA-Z0-9\-_\.]{20,}` |
| `db_url_with_creds` | `(postgres\|mysql\|mongodb\|redis)://user:pass@` |
| `hardcoded_secret` | `(password\|secret\|token)\s*[:=]\s*["'][^"']{8,}["']` |

File sensitif yang diblok jika masuk diff: `.env`/`.env.*`,
`*.pem`/`*.key`/`*.p12`/`*.pfx`, `credentials.json`, `service-account.json`,
`id_rsa`/`id_ed25519`. Nilai credential di-redact (20 char pertama + `***`).

## Migration / schema check — adaptif

```
1. git diff origin/<branch>..HEAD -- <schema-file>           deteksi perubahan schema
2. git diff origin/<branch>..HEAD --name-only -- <migrations-dir>  deteksi migrasi baru
3. schema berubah TAPI tidak ada migrasi → BLOCK
4. ada migrasi baru → WARNING
5. migrasi unstaged → WARNING (git ls-files --others --exclude-standard <dir>)
6. drift (schema vs applied) → WARNING (<orm-cli> migrate diff)
```

| ORM | Schema file | Migration dir | Drift check |
| --- | ----------- | ------------- | ----------- |
| Prisma | `prisma/schema.prisma` | `prisma/migrations/` | `prisma migrate diff` |
| Drizzle | `drizzle/schema.ts` | `drizzle/migrations/` | `drizzle-kit check` |
| TypeORM | `src/entities/*.ts` | `src/migrations/` | `typeorm migration:generate` |
| Alembic | `models/*.py` | `alembic/versions/` | `alembic check` |
| Atlas | `schema.sql` + `atlas.hcl` | `migrations/` | `atlas migrate diff` |

SQL-first (Goose, Atlas): cukup cek ada `.sql` baru di diff — tidak ada schema
file untuk drift-check. Code-first: cek schema + migration dir + drift.

## Deploy target — adaptif

**Docker + GitHub Actions** (pola referensi project ini):

```bash
export GH_TOKEN=<github-pat>
git push https://oauth2:${GH_TOKEN}@github.com/<owner>/<repo>.git <branch>
gh workflow run publish.yml --ref <branch> -f stack_env=stg
gh workflow run re-pull.yml --ref <branch> -f stack_env=stg -f stack_name=<name>
gh run view <run_id> --json status,conclusion
```

> Tidak pakai `gh auth login` karena butuh browser (device flow) — tidak cocok
> untuk MCP server background tanpa terminal interaktif.

Alternatif: **Docker + SSH** (`docker build/push` + `ssh ... docker compose up -d`),
**VPS langsung** (`git push production` atau `rsync` + `pm2 restart`),
**PaaS** (`vercel deploy --prod`, `railway up`, `flyctl deploy`, `wrangler deploy`).

Pola verifikasi versi (poll `/api/version` sampai cocok atau timeout):

```typescript
async function verifyVersion(expected: string, url: string, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/version`)
      const { version } = await res.json()
      if (version === expected) return true
    } catch { /* retry */ }
    await sleep(5_000)
  }
  return false
}
```

Timeout rekomendasi: build image 300–600s, deploy/restart 120–300s,
verify version 120–180s, health check 60s.

## Keamanan

- Semua token/secret dari `process.env` — tidak hardcode.
- Redact credential di output (20 char + `***`).
- Scan diff, bukan seluruh codebase.
- Preflight sebelum mutasi — tidak meninggalkan artifact setengah jalan.
- Server standalone, tanpa import `src/`, tanpa side-effect.
- Log internal pakai `console.error` — `stdout` khusus JSON-RPC.

## Checklist implementasi project baru

- [ ] Runtime? (Bun, Node, Python, Go)
- [ ] Branch target? (`stg`, `main`, `production`)
- [ ] Version bump: semver atau timestamp?
- [ ] ORM + lokasi schema/migration dir?
- [ ] Deploy target + cara trigger + cara cek status?
- [ ] Endpoint verifikasi? (`/api/version`, `/health`)
- [ ] Token akses staging/production?
- [ ] `GH_TOKEN` di-set di host env + di-passing via `.mcp.json` `"${GH_TOKEN}"`?
