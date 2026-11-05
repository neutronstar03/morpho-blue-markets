import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'
import { fetchWithDeadline, graphqlRetryDelay, RequestDeadlineError, shouldRetryGraphqlRequest } from '../../app/lib/graphql/request-policy'

describe('bounded GraphQL requests', () => {
  test('expires a stalled attempt without retrying inside fetch', async () => {
    let attempts = 0
    await expect(fetchWithDeadline('https://example.test', {}, 10, async (_input, init) => {
      attempts++
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    })).rejects.toBeInstanceOf(RequestDeadlineError)
    expect(attempts).toBe(1)
  })
  test('deadline includes response body, not only headers', async () => {
    await expect(fetchWithDeadline('https://example.test', {}, 10, async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(new Error('body stopped')))
      },
    })))).rejects.toBeInstanceOf(RequestDeadlineError)
  })
  test('preserves caller cancellation as non-retryable', async () => {
    const controller = new AbortController()
    const pending = fetchWithDeadline('https://example.test', { signal: controller.signal }, 1000, async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')))
    }))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(shouldRetryGraphqlRequest(0, new DOMException('cancelled', 'AbortError'))).toBe(false)
  })
  test('retries transient transport/408/429/5xx only, with a bounded attempt count', () => {
    for (const status of [408, 429, 500, 503]) {
      const error = { response: { status } }
      expect(shouldRetryGraphqlRequest(0, error)).toBe(true)
      expect(shouldRetryGraphqlRequest(1, error)).toBe(true)
      expect(shouldRetryGraphqlRequest(2, error)).toBe(false)
    }
    for (const status of [200, 400, 401, 403, 404, 422])
      expect(shouldRetryGraphqlRequest(0, { response: { status, errors: ['validation'] } })).toBe(false)
    expect(shouldRetryGraphqlRequest(0, new TypeError('network'))).toBe(true)
    expect(shouldRetryGraphqlRequest(0, new Error('invalid contract'))).toBe(false)
  })
  test('honors bounded Retry-After and backoff', () => {
    expect(graphqlRetryDelay(0, { response: { headers: new Headers({ 'retry-after': '3' }) } })).toBe(3000)
    expect(graphqlRetryDelay(0, { response: { headers: new Headers({ 'retry-after': '999' }) } })).toBe(60000)
    expect(graphqlRetryDelay(1, new TypeError('network'))).toBe(2000)
    expect(shouldRetryGraphqlRequest(0, { response: { status: 429, headers: new Headers({ 'retry-after': '999' }) } })).toBe(false)
  })
})

test('React Query is the single retry owner with exact attempt counts', async () => {
  const client = new QueryClient()
  let attempts = 0
  await client.fetchQuery({ queryKey: ['transient'], retry: shouldRetryGraphqlRequest, retryDelay: () => 0, queryFn: async () => {
    attempts++
    if (attempts < 3)
      throw Object.assign(new Error('temporary'), { response: { status: 503 } })
    return true
  } })
  expect(attempts).toBe(3)
  attempts = 0
  await expect(client.fetchQuery({ queryKey: ['validation'], retry: shouldRetryGraphqlRequest, retryDelay: () => 0, queryFn: async () => {
    attempts++
    throw Object.assign(new Error('validation'), { response: { status: 200, errors: ['invalid field'] } })
  } })).rejects.toThrow('validation')
  expect(attempts).toBe(1)
  client.clear()
})
