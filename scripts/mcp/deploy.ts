/**
 * MCP Deploy Server — deploy ke STG via GitHub Actions + Portainer
 *
 * Pipeline: preflight → bump version → commit → push origin stg
 *           → gh workflow run publish.yml (build image)
 *           → poll workflow selesai
 *           → gh workflow run re-pull.yml (deploy ke Portainer)
 *           → poll workflow selesai
 *           → verify GET /api/version cocok
 *
 * Env vars (di-passing via .mcp.json):
 *   STACK_NAME  — nama stack di Portainer, misal: base-template
 *   BASE_URL    — URL STG untuk verifikasi, misal: https://stg.example.com
 *   ENV         — environment label, default: stg
 *   GH_TOKEN    — GitHub PAT dengan scope: repo + workflow
 *   GH_REPO     — owner/repo, auto-detect dari git remote jika tidak di-set
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

// ─── Config ──────────────────────────────────────────────────────────────────

const STACK_NAME = process.env.STACK_NAME ?? 'base-template'
const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/$/, '')
const ENV = process.env.ENV ?? 'stg'
const GH_TOKEN = process.env.GH_TOKEN ?? ''
const GH_REPO =
  process.env.GH_REPO ??
  (() => {
    try {
      const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
      const m = url.match(/github\.com[/:](.+?\/.+?)(?:\.git)?$/)
      if (m) return m[1]
    } catch {}
    return 'owner/repo'
  })()

const PACKAGE_JSON = 'package.json'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function run(cmd: string, opts?: { cwd?: string; env?: Record<string, string> }): { ok: boolean; out: string; err: string } {
  const result = spawnSync('bash', ['-c', cmd], {
    encoding: 'utf8',
    cwd: opts?.cwd,
    env: { ...process.env, ...(opts?.env ?? {}) },
  })
  return {
    ok: result.status === 0,
    out: (result.stdout ?? '').trim(),
    err: (result.stderr ?? '').trim(),
  }
}

function ghRun(args: string) {
  return run(args, { env: { GH_TOKEN } })
}

type Step = { step: string; status: 'ok' | 'blocked' | 'skip' | 'error'; detail?: string; issues?: unknown[] }

// ─── Credential scan ─────────────────────────────────────────────────────────

const CREDENTIAL_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'anthropic_key', regex: /sk-ant-[a-zA-Z0-9\-_]{20,}/ },
  { name: 'openai_key', regex: /sk-[a-zA-Z0-9]{48}/ },
  { name: 'stripe_key', regex: /sk_(live|test)_[a-zA-Z0-9]{24,}/ },
  { name: 'github_pat', regex: /ghp_[a-zA-Z0-9]{36,}/ },
  { name: 'github_oauth', regex: /gho_[a-zA-Z0-9]{36,}/ },
  { name: 'github_fine_grained', regex: /github_pat_[a-zA-Z0-9_]{22,}/ },
  { name: 'slack_token', regex: /xox[baprs]-[a-zA-Z0-9\-]{20,}/ },
  { name: 'google_api_key', regex: /AIza[a-zA-Z0-9\-_]{35}/ },
  { name: 'google_oauth_token', regex: /ya29\.[a-zA-Z0-9\-_]{20,}/ },
  { name: 'private_key_pem', regex: /-----BEGIN [A-Z ]+ PRIVATE KEY-----/ },
  { name: 'db_url_with_creds', regex: /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/ },
  { name: 'hardcoded_secret', regex: /(password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/ },
]

const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\.|$)/,
  /\.(pem|key|p12|pfx)$/,
  /credentials\.json$/,
  /service-account\.json$/,
  /^id_rsa$/,
  /^id_ed25519$/,
]

function scanCredentials(branch: string): { ok: boolean; issues: { type: string; sample: string; count: number }[] } {
  const diff = run(`git diff origin/${branch}..HEAD -- . ":(exclude)*.lock" ":(exclude)package-lock.json"`)
  const addedLines = (diff.ok ? diff.out : '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  const content = addedLines.join('\n')

  const issues: { type: string; sample: string; count: number }[] = []
  for (const { name, regex } of CREDENTIAL_PATTERNS) {
    const matches = content.match(new RegExp(regex.source, 'g')) ?? []
    if (matches.length > 0) {
      issues.push({ type: name, sample: (matches[0] ?? '').slice(0, 20) + '***', count: matches.length })
    }
  }
  return { ok: issues.length === 0, issues }
}

function scanSensitiveFiles(branch: string): { ok: boolean; files: string[] } {
  const result = run(`git diff --name-only origin/${branch}..HEAD`)
  const files = result.ok ? result.out.split('\n').filter(Boolean) : []
  const flagged = files.filter((f) => {
    const base = f.split('/').pop() ?? f
    return SENSITIVE_FILE_PATTERNS.some((p) => p.test(base))
  })
  return { ok: flagged.length === 0, files: flagged }
}

// ─── Migration check ─────────────────────────────────────────────────────────

function checkMigrations(branch: string): { ok: boolean; warnings: string[] } {
  const warnings: string[] = []

  const schemaDiff = run(`git diff origin/${branch}..HEAD -- prisma/schema.prisma`)
  const migrationDiff = run(`git diff --name-only origin/${branch}..HEAD -- prisma/migrations/`)
  const schemaChanged = schemaDiff.ok && schemaDiff.out.length > 0
  const hasMigration = migrationDiff.ok && migrationDiff.out.trim().length > 0

  if (schemaChanged && !hasMigration) {
    warnings.push('Schema prisma berubah tapi tidak ada migrasi baru — jalankan: bun run db:migrate')
  }

  if (hasMigration) {
    const newMigs = migrationDiff.out.trim().split('\n').filter(Boolean)
    warnings.push(`Ada ${newMigs.length} migrasi baru yang akan diapply: ${newMigs.map((f) => f.split('/').slice(-2)[0]).join(', ')}`)
  }

  const unstaged = run('git ls-files --others --exclude-standard prisma/migrations/')
  if (unstaged.ok && unstaged.out.trim()) {
    warnings.push('Ada file migrasi yang belum di-stage/commit')
  }

  return { ok: !warnings.some((w) => w.includes('tidak ada migrasi')), warnings }
}

// ─── Version helpers ──────────────────────────────────────────────────────────

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  return pkg.version as string
}

function bumpVersion(type: 'patch' | 'minor' | 'major'): string {
  const parts = readVersion().split('.').map(Number)
  if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0 }
  else if (type === 'minor') { parts[1]++; parts[2] = 0 }
  else parts[2]++
  const next = parts.join('.')
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  pkg.version = next
  writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n')
  return next
}

// ─── GitHub Actions helpers ───────────────────────────────────────────────────

async function triggerAndGetRunId(workflow: string, fields: string[], ref: string): Promise<string | null> {
  const fieldArgs = fields.map((f) => `-f ${f}`).join(' ')
  const before = ghRun(`gh run list --repo ${GH_REPO} --workflow ${workflow} --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null`)
  const beforeId = before.out.trim()

  const trigger = ghRun(`gh workflow run ${workflow} --repo ${GH_REPO} --ref ${ref} ${fieldArgs}`)
  if (!trigger.ok) return null

  // poll sampai run baru muncul (max 30s)
  for (let i = 0; i < 6; i++) {
    await sleep(5000)
    const latest = ghRun(`gh run list --repo ${GH_REPO} --workflow ${workflow} --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null`)
    if (latest.ok && latest.out.trim() && latest.out.trim() !== beforeId) {
      return latest.out.trim()
    }
  }
  return null
}

async function pollWorkflow(runId: string, timeoutMs = 600_000): Promise<{ status: string; conclusion: string | null }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await sleep(10_000)
    const r = ghRun(`gh run view ${runId} --repo ${GH_REPO} --json status,conclusion --jq '[.status,.conclusion] | join(":")'`)
    if (r.ok && r.out.includes(':')) {
      const [status, conclusion] = r.out.split(':')
      if (status === 'completed') return { status, conclusion: conclusion || null }
    }
  }
  return { status: 'timeout', conclusion: null }
}

async function verifyVersion(expected: string, timeoutMs = 120_000): Promise<boolean> {
  if (!BASE_URL) return false
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/version`, { signal: AbortSignal.timeout(5000) })
      const json = (await res.json()) as { version?: string }
      if (json.version === expected) return true
    } catch {}
    await sleep(5000)
  }
  return false
}

// ─── Preflight logic ──────────────────────────────────────────────────────────

function runPreflight(branch: string): {
  ok: boolean
  blockedBy: string | null
  credScan: ReturnType<typeof scanCredentials>
  fileScan: ReturnType<typeof scanSensitiveFiles>
  migrationCheck: ReturnType<typeof checkMigrations>
  treeClean: boolean
} {
  const dirty = run('git status --porcelain')
  const treeClean = dirty.ok && dirty.out.trim() === ''

  const credScan = scanCredentials(branch)
  const fileScan = scanSensitiveFiles(branch)
  const migrationCheck = checkMigrations(branch)

  let blockedBy: string | null = null
  if (!treeClean) blockedBy = 'dirty_tree'
  else if (!credScan.ok) blockedBy = 'credential_leak'
  else if (!fileScan.ok) blockedBy = 'sensitive_file'
  else if (!migrationCheck.ok) blockedBy = 'migration_missing'

  return { ok: blockedBy === null, blockedBy, credScan, fileScan, migrationCheck, treeClean }
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'deploy-stg', version: '0.1.0' })

// ── preflight ─────────────────────────────────────────────────────────────────
server.registerTool(
  'preflight',
  {
    title: 'Preflight scan',
    description: 'Scan credential leak, sensitive files, dan migrasi — tanpa melakukan deploy. Jalankan ini sebelum deploy untuk memastikan aman.',
    inputSchema: {
      branch: z.string().default(ENV).describe('Branch target, default: stg'),
    },
  },
  async ({ branch }) => {
    const result = runPreflight(branch)
    const hintMap: Record<string, string> = {
      dirty_tree: 'Working tree kotor — commit atau stash perubahan dulu sebelum deploy',
      credential_leak: `Perbaiki credential leak sebelum deploy: ${result.credScan.issues.map((i) => i.type).join(', ')}`,
      sensitive_file: `File sensitif terdeteksi di diff: ${result.fileScan.files.join(', ')}`,
      migration_missing: result.migrationCheck.warnings.join('; '),
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          deploy_safe: result.ok,
          blocked_by: result.blockedBy,
          hint: result.blockedBy ? hintMap[result.blockedBy] : null,
          tree_clean: result.treeClean,
          credential_scan: { ok: result.credScan.ok, issues: result.credScan.issues },
          sensitive_files: { ok: result.fileScan.ok, files: result.fileScan.files },
          migration_check: { ok: result.migrationCheck.ok, warnings: result.migrationCheck.warnings },
        }, null, 2),
      }],
    }
  },
)

// ── check_version ─────────────────────────────────────────────────────────────
server.registerTool(
  'check_version',
  {
    title: 'Check version',
    description: 'Bandingkan versi lokal (package.json) vs versi live di STG (/api/version). Pakai untuk tahu apakah perlu deploy atau sudah in-sync.',
    inputSchema: {},
  },
  async () => {
    const local = readVersion()
    let target: string | null = null
    let targetError: string | null = null

    if (BASE_URL) {
      try {
        const res = await fetch(`${BASE_URL}/api/version`, { signal: AbortSignal.timeout(8000) })
        const json = (await res.json()) as { version?: string }
        target = json.version ?? null
      } catch (e) {
        targetError = String(e)
      }
    } else {
      targetError = 'BASE_URL tidak di-set'
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ local, target, target_url: BASE_URL || null, target_error: targetError, in_sync: local === target }, null, 2),
      }],
    }
  },
)

// ── deploy_status ─────────────────────────────────────────────────────────────
server.registerTool(
  'deploy_status',
  {
    title: 'Deploy status',
    description: 'Cek status workflow GitHub Actions terakhir (publish + re-pull). Pakai setelah deploy untuk memantau progress.',
    inputSchema: {
      limit: z.number().int().min(1).max(10).default(3),
    },
  },
  async ({ limit }) => {
    if (!GH_TOKEN) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'GH_TOKEN tidak di-set' }) }] }
    }

    const [publishRuns, repullRuns] = await Promise.all([
      ghRun(`gh run list --repo ${GH_REPO} --workflow publish.yml --limit ${limit} --json databaseId,displayTitle,status,conclusion,createdAt,url`),
      ghRun(`gh run list --repo ${GH_REPO} --workflow re-pull.yml --limit ${limit} --json databaseId,displayTitle,status,conclusion,createdAt,url`),
    ])

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          publish: publishRuns.ok ? JSON.parse(publishRuns.out || '[]') : { error: publishRuns.err },
          re_pull: repullRuns.ok ? JSON.parse(repullRuns.out || '[]') : { error: repullRuns.err },
        }, null, 2),
      }],
    }
  },
)

// ── deploy ─────────────────────────────────────────────────────────────────────
server.registerTool(
  'deploy',
  {
    title: 'Deploy ke STG',
    description: [
      'Pipeline deploy end-to-end ke staging:',
      '1. Preflight (credential scan + migration check)',
      '2. Bump version di package.json',
      '3. Git commit + push origin stg',
      '4. Trigger gh workflow publish.yml (build Docker image)',
      '5. Poll sampai build selesai',
      '6. Trigger gh workflow re-pull.yml (deploy ke Portainer)',
      '7. Poll sampai deploy selesai',
      '8. Verify /api/version cocok dengan versi baru',
    ].join('\n'),
    inputSchema: {
      bump: z.enum(['patch', 'minor', 'major']).default('patch').describe('Tipe version bump'),
      message: z.string().optional().describe('Custom commit message (opsional, default: chore: bump vX.X.X)'),
      skip_preflight: z.boolean().default(false).describe('Skip credential scan — gunakan hanya jika yakin aman'),
      branch: z.string().default(ENV).describe('Branch target, default: stg'),
    },
  },
  async ({ bump, message, skip_preflight, branch }) => {
    const steps: Step[] = []

    if (!GH_TOKEN) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: false, blocked_by: 'no_gh_token', hint: 'Set GH_TOKEN di environment (GitHub PAT dengan scope: repo + workflow)', steps }, null, 2),
        }],
      }
    }

    // ── 1. Preflight ──────────────────────────────────────────────────────────
    if (!skip_preflight) {
      const pre = runPreflight(branch)
      const hintMap: Record<string, string> = {
        dirty_tree: 'Working tree kotor — commit atau stash perubahan dulu',
        credential_leak: `Credential leak terdeteksi: ${pre.credScan.issues.map((i) => i.type).join(', ')}`,
        sensitive_file: `File sensitif di diff: ${pre.fileScan.files.join(', ')}`,
        migration_missing: pre.migrationCheck.warnings.join('; '),
      }
      steps.push({
        step: 'preflight',
        status: pre.ok ? 'ok' : 'blocked',
        detail: pre.ok ? 'Credential scan + migration check OK' : hintMap[pre.blockedBy!],
        issues: pre.credScan.issues,
      })
      if (!pre.ok) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, blocked_by: pre.blockedBy, hint: hintMap[pre.blockedBy!], steps }, null, 2),
          }],
        }
      }
    } else {
      steps.push({ step: 'preflight', status: 'skip', detail: 'Dilewati via skip_preflight=true' })
    }

    // ── 2. Bump version ───────────────────────────────────────────────────────
    const prevVersion = readVersion()
    const newVersion = bumpVersion(bump)
    steps.push({ step: 'bump_version', status: 'ok', detail: `${prevVersion} → ${newVersion}` })

    // ── 3. Commit + push ──────────────────────────────────────────────────────
    const commitMsg = message ?? `chore: bump v${newVersion}`
    const addResult = run(`git add ${PACKAGE_JSON}`)
    const commitResult = run(`git commit -m "${commitMsg}"`)
    if (!addResult.ok || !commitResult.ok) {
      steps.push({ step: 'commit', status: 'error', detail: commitResult.err || addResult.err })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, blocked_by: 'commit_failed', steps }, null, 2) }] }
    }
    steps.push({ step: 'commit', status: 'ok', detail: commitMsg })

    const pushUrl = `https://oauth2:${GH_TOKEN}@github.com/${GH_REPO}.git`
    const pushResult = run(`git push ${pushUrl} HEAD:${branch}`)
    if (!pushResult.ok) {
      steps.push({ step: 'push', status: 'error', detail: pushResult.err.replace(GH_TOKEN, '***') })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, blocked_by: 'push_failed', steps }, null, 2) }] }
    }
    steps.push({ step: 'push', status: 'ok', detail: `origin/${branch}` })

    // ── 4. Trigger publish (build image) ──────────────────────────────────────
    const publishRunId = await triggerAndGetRunId(
      'publish.yml',
      [`stack_env=${branch}`, `tag=${newVersion}`],
      branch,
    )
    if (!publishRunId) {
      steps.push({ step: 'publish_triggered', status: 'error', detail: 'Gagal mendapatkan run ID dari publish.yml' })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, blocked_by: 'publish_trigger_failed', steps }, null, 2) }] }
    }
    steps.push({ step: 'publish_triggered', status: 'ok', detail: `run ID: ${publishRunId}` })

    // ── 5. Poll publish ───────────────────────────────────────────────────────
    const publishResult = await pollWorkflow(publishRunId, 600_000)
    if (publishResult.conclusion !== 'success') {
      steps.push({ step: 'publish_done', status: 'error', detail: `${publishResult.status}/${publishResult.conclusion}` })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, blocked_by: 'publish_failed', steps }, null, 2) }] }
    }
    steps.push({ step: 'publish_done', status: 'ok', detail: 'Image berhasil di-build dan push ke GHCR' })

    // ── 6. Trigger re-pull (deploy ke Portainer) ──────────────────────────────
    const stackFull = `${STACK_NAME}-${branch}`
    const repullRunId = await triggerAndGetRunId(
      're-pull.yml',
      [`stack_name=${STACK_NAME}`, `stack_env=${branch}`],
      branch,
    )
    if (!repullRunId) {
      steps.push({ step: 'repull_triggered', status: 'error', detail: 'Gagal mendapatkan run ID dari re-pull.yml' })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, blocked_by: 'repull_trigger_failed', steps }, null, 2) }] }
    }
    steps.push({ step: 'repull_triggered', status: 'ok', detail: `stack: ${stackFull}, run ID: ${repullRunId}` })

    // ── 7. Poll re-pull ───────────────────────────────────────────────────────
    const repullResult = await pollWorkflow(repullRunId, 600_000)
    if (repullResult.conclusion !== 'success') {
      steps.push({ step: 'repull_done', status: 'error', detail: `${repullResult.status}/${repullResult.conclusion}` })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, blocked_by: 'repull_failed', steps }, null, 2) }] }
    }
    steps.push({ step: 'repull_done', status: 'ok', detail: `Stack ${stackFull} berhasil redeploy` })

    // ── 8. Verify version ─────────────────────────────────────────────────────
    if (BASE_URL) {
      const verified = await verifyVersion(newVersion, 120_000)
      steps.push({
        step: 'verify',
        status: verified ? 'ok' : 'error',
        detail: verified ? `${BASE_URL}/api/version → ${newVersion}` : `Timeout — versi belum berubah ke ${newVersion}`,
      })
      if (!verified) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, blocked_by: 'verify_timeout', version: newVersion, steps }, null, 2) }] }
      }
    } else {
      steps.push({ step: 'verify', status: 'skip', detail: 'BASE_URL tidak di-set, skip verifikasi' })
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          version: newVersion,
          target_url: BASE_URL || null,
          steps,
        }, null, 2),
      }],
    }
  },
)

// ─── Start server ─────────────────────────────────────────────────────────────

if (!GH_TOKEN) {
  process.stderr.write('WARNING: GH_TOKEN tidak di-set — tools deploy/deploy_status tidak akan berfungsi\n')
}

const transport = new StdioServerTransport()
await server.connect(transport)
