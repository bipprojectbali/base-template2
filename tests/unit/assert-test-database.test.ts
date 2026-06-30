import { describe, expect, test } from 'bun:test'
import { assertTestDatabase } from '../helpers'

const DEV = 'postgresql://dev/main'
const TEST = 'postgresql://dev/test'

describe('assertTestDatabase (cleanup guard)', () => {
  test('passes when NODE_ENV=test and TEST_DATABASE_URL is distinct from DATABASE_URL', () => {
    expect(() => assertTestDatabase({ NODE_ENV: 'test', DATABASE_URL: DEV, TEST_DATABASE_URL: TEST })).not.toThrow()
  })

  test('throws when NODE_ENV is not test (protects dev/prod from cleanup)', () => {
    expect(() => assertTestDatabase({ NODE_ENV: 'development', DATABASE_URL: DEV, TEST_DATABASE_URL: TEST })).toThrow(
      /expected 'test'/,
    )
  })

  test('throws when TEST_DATABASE_URL is unset', () => {
    expect(() => assertTestDatabase({ NODE_ENV: 'test', DATABASE_URL: DEV })).toThrow(/unset or equal to DATABASE_URL/)
  })

  test('throws when TEST_DATABASE_URL equals DATABASE_URL', () => {
    expect(() => assertTestDatabase({ NODE_ENV: 'test', DATABASE_URL: DEV, TEST_DATABASE_URL: DEV })).toThrow(
      /unset or equal to DATABASE_URL/,
    )
  })
})
