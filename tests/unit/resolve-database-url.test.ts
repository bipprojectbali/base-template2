import { describe, expect, test } from 'bun:test'
import { resolveDatabaseUrl } from '../../src/lib/db'

const DEV = 'postgresql://dev/main'
const TEST = 'postgresql://dev/test'

describe('resolveDatabaseUrl', () => {
  test('uses TEST_DATABASE_URL when NODE_ENV=test and it is set', () => {
    expect(resolveDatabaseUrl({ NODE_ENV: 'test', DATABASE_URL: DEV, TEST_DATABASE_URL: TEST })).toBe(TEST)
  })

  test('throws in test mode when TEST_DATABASE_URL is unset (no silent fallback to dev DB)', () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'test', DATABASE_URL: DEV })).toThrow(/TEST_DATABASE_URL is required/)
  })

  test('throws in test mode when TEST_DATABASE_URL equals DATABASE_URL', () => {
    expect(() => resolveDatabaseUrl({ NODE_ENV: 'test', DATABASE_URL: DEV, TEST_DATABASE_URL: DEV })).toThrow(
      /must point at a SEPARATE database/,
    )
  })

  test('ignores TEST_DATABASE_URL outside test mode', () => {
    expect(resolveDatabaseUrl({ NODE_ENV: 'development', DATABASE_URL: DEV, TEST_DATABASE_URL: TEST })).toBe(DEV)
    expect(resolveDatabaseUrl({ NODE_ENV: 'production', DATABASE_URL: DEV, TEST_DATABASE_URL: TEST })).toBe(DEV)
  })
})
