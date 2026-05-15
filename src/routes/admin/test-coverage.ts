import { Elysia } from 'elysia'
import { betterAuthPlugin } from '../../lib/auth-middleware'
import { guardSuperAdmin } from '../../lib/route-helpers'

export const adminTestCoverageRouter = new Elysia({ tags: ['Admin — Info'] })
  .use(betterAuthPlugin)

  .get('/api/admin/test-coverage', async ({ authUser }) => {
    const guard = guardSuperAdmin(authUser); if (guard) return guard
    const fs = await import('node:fs')
    const pathMod = await import('node:path')
    const root = process.cwd()
    const exts = new Set(['.ts', '.tsx'])
    const skipDirs = new Set(['node_modules', 'dist', 'generated', '.git'])

    interface SrcFile { path: string; lines: number; exports: string[]; testedBy: string[]; coverage: string }
    interface TestFile { path: string; lines: number; type: string; targets: string[] }

    function scanDir(dir: string, collect: string[]) {
      const abs = pathMod.join(root, dir)
      if (!fs.existsSync(abs)) return
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (skipDirs.has(entry.name)) continue
        const rel = pathMod.join(dir, entry.name).replace(/\\/g, '/')
        if (entry.isDirectory()) scanDir(rel, collect)
        else if (exts.has(pathMod.extname(entry.name))) collect.push(rel)
      }
    }

    const srcPaths: string[] = []
    scanDir('src', srcPaths)
    const srcFiltered = srcPaths.filter((f) => !f.includes('routeTree.gen'))

    const testPaths: string[] = []
    scanDir('tests', testPaths)
    const testFiltered = testPaths.filter((f) => f.includes('.test.'))

    const testFiles: TestFile[] = testFiltered.map((tp) => {
      const content = fs.readFileSync(pathMod.join(root, tp), 'utf-8')
      const lines = content.split('\n').length
      const type = tp.includes('/unit/') ? 'unit' : tp.includes('/integration/') ? 'integration' : 'other'
      const targets: string[] = []
      for (const m of content.matchAll(/from\s+['"]([^'"]*(?:src|lib)[^'"]*)['"]/g)) {
        let resolved = m[1].replace(/^.*?src\//, 'src/')
        if (resolved.startsWith('.')) {
          resolved = pathMod.normalize(pathMod.join(pathMod.dirname(tp), resolved)).replace(/\\/g, '/')
        }
        for (const ext of ['', '.ts', '.tsx']) {
          const full = resolved + ext
          if (srcFiltered.includes(full)) { targets.push(full); break }
        }
      }
      if (/fetch\(['"`]\/api\//.test(content) || /createApp|createTestApp/.test(content)) {
        if (!targets.includes('src/app.ts')) targets.push('src/app.ts')
      }
      return { path: tp, lines, type, targets: [...new Set(targets)] }
    })

    const testedByMap: Record<string, string[]> = {}
    for (const tf of testFiles) {
      for (const target of tf.targets) {
        if (!testedByMap[target]) testedByMap[target] = []
        testedByMap[target].push(tf.path)
      }
    }

    const sourceFiles: SrcFile[] = srcFiltered.map((sp) => {
      const content = fs.readFileSync(pathMod.join(root, sp), 'utf-8')
      const lines = content.split('\n').length
      const exports: string[] = []
      for (const m of content.matchAll(/export\s+(?:default\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g)) {
        exports.push(m[1])
      }
      const tb = testedByMap[sp] || []
      const coverage = tb.length === 0 ? 'uncovered' : tb.some((tf) => tf.includes('/unit/')) ? 'covered' : 'partial'
      return { path: sp, lines, exports, testedBy: tb, coverage }
    })

    const covered = sourceFiles.filter((f) => f.coverage === 'covered').length
    const partial = sourceFiles.filter((f) => f.coverage === 'partial').length
    const uncovered = sourceFiles.filter((f) => f.coverage === 'uncovered').length

    return {
      sourceFiles,
      testFiles,
      summary: {
        totalSource: sourceFiles.length, totalTests: testFiles.length, covered, partial, uncovered,
        coveragePercent: Math.round(((covered + partial * 0.5) / sourceFiles.length) * 100),
      },
    }
  }, {
    detail: {
      summary: 'Test coverage mapping',
      description: 'Maps source files to their test files. Coverage: covered (unit), partial (integration only), uncovered.',
      security: [{ cookieAuth: [] }],
      responses: {
        200: { description: 'Coverage report' },
        401: { description: 'Unauthenticated' },
        403: { description: 'Forbidden — requires SUPER_ADMIN' },
      },
    }
  })
