import { describe, expect, test } from 'bun:test'
import { buildLlmsTxt, generateLlmsTxt, type LlmsData } from '../../src/lib/llms-generator'

const fixture: LlmsData = {
  meta: { name: 'demo-app', version: '1.2.3', description: 'A demo project' },
  routes: [
    { method: 'GET', path: '/health', auth: 'public', category: 'utility', description: 'Health check' },
    { method: 'POST', path: '/api/tickets', auth: 'qcOrAdmin', category: 'tickets', description: 'Create ticket' },
  ],
  schema: {
    models: [{ name: 'User', tableName: 'user', fields: [{ name: 'id', type: 'String', isId: true, isUnique: false, isOptional: false, isList: false, isRelation: false }] }],
    enums: [{ name: 'Role', values: ['USER', 'ADMIN'] }],
    relations: [],
  },
  env: [
    { name: 'PORT', envKey: 'PORT', required: false, default: '3000', category: 'app', description: 'Server port' },
    { name: 'DATABASE_URL', envKey: 'DATABASE_URL', required: true, default: null, category: 'database', description: 'PostgreSQL connection string' },
  ],
  changelog: [
    { version: '1.2.3', date: '2026-06-23', sections: { Added: ['llms.txt generator'] } },
    { version: 'Unreleased', date: null, sections: { Fixed: ['should be skipped'] } },
  ],
  docs: [{ title: 'API', path: 'docs/API.md', summary: 'All HTTP routes' }],
}

describe('generateLlmsTxt', () => {
  const out = generateLlmsTxt(fixture)

  test('includes project name and version in header', () => {
    expect(out).toContain('# demo-app (v1.2.3)')
    expect(out).toContain('> A demo project')
  })

  test('marks file as auto-generated', () => {
    expect(out).toContain('auto-generated')
  })

  test('renders routes grouped with method, path, auth', () => {
    expect(out).toContain('`GET /health` (public)')
    expect(out).toContain('`POST /api/tickets` (qcOrAdmin)')
    expect(out).toContain('### tickets')
  })

  test('renders schema models and enums', () => {
    expect(out).toContain('**User** (table `user`)')
    expect(out).toContain('**Role**: USER | ADMIN')
  })

  test('renders env vars with required/optional flag', () => {
    expect(out).toContain('`PORT` (optional, default: 3000)')
    expect(out).toContain('`DATABASE_URL` (required)')
  })

  test('renders released changelog but skips Unreleased', () => {
    expect(out).toContain('### 1.2.3 — 2026-06-23')
    expect(out).toContain('Added: llms.txt generator')
    expect(out).not.toContain('should be skipped')
  })

  test('renders doc links', () => {
    expect(out).toContain('[API](docs/API.md): All HTTP routes')
  })
})

describe('buildLlmsTxt (real project sources)', () => {
  const out = buildLlmsTxt()

  test('produces non-empty output with expected sections', () => {
    expect(out.length).toBeGreaterThan(200)
    expect(out).toContain('## API Routes')
    expect(out).toContain('## Database Schema')
    expect(out).toContain('## Environment Variables')
  })

  test('includes real models from prisma schema', () => {
    expect(out).toContain('**User**')
    expect(out).toContain('**Ticket**')
  })
})
