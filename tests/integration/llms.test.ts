import { describe, expect, test } from 'bun:test'
import { createTestApp } from '../helpers'

const app = createTestApp()

describe('GET /llms.txt', () => {
  test('returns 200 plain-text with project header', async () => {
    const res = await app.handle(new Request('http://localhost/llms.txt'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body).toContain('## API Routes')
    expect(body).toContain('## Database Schema')
  })

  test('is publicly accessible (no auth required)', async () => {
    const res = await app.handle(new Request('http://localhost/llms.txt'))
    expect(res.status).toBe(200)
  })

  test('lists itself in the routes section', async () => {
    const res = await app.handle(new Request('http://localhost/llms.txt'))
    const body = await res.text()
    expect(body).toContain('/llms.txt')
  })
})
