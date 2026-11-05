export class RequestDeadlineError extends Error {
  name = 'RequestDeadlineError'
}

type HttpFetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>

// One HTTP attempt, including its body. React Query owns retries; this layer never retries.
export async function fetchWithDeadline(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}, timeoutMs = 15000, fetcher: HttpFetch = globalThis.fetch): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new RangeError('Invalid request deadline')
  const parentSignal = init.signal ?? (input instanceof Request ? input.signal : null)
  if (parentSignal?.aborted)
    throw new DOMException('Request cancelled', 'AbortError')
  const controller = new AbortController()
  const cancel = () => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', cancel, { once: true })
  let expired = false
  const timer = setTimeout(() => {
    expired = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetcher(input, { ...init, signal: controller.signal })
    const body = await response.arrayBuffer()
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  catch (error) {
    if (parentSignal?.aborted)
      throw new DOMException('Request cancelled', 'AbortError')
    if (expired)
      throw new RequestDeadlineError(`Request exceeded ${timeoutMs}ms deadline`)
    throw error
  }
  finally {
    clearTimeout(timer)
    parentSignal?.removeEventListener('abort', cancel)
  }
}

function responseOf(error: unknown) {
  if (!error || typeof error !== 'object' || !('response' in error) || !error.response || typeof error.response !== 'object')
    return undefined
  return error.response as { status?: unknown, headers?: unknown, errors?: unknown }
}

function retryAfterMilliseconds(error: unknown) {
  const headers = responseOf(error)?.headers
  const value = headers instanceof Headers ? headers.get('retry-after') : null
  if (!value)
    return null
  const seconds = Number(value)
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null
}

export function shouldRetryGraphqlRequest(failures: number, error: unknown) {
  if (failures >= 2 || (retryAfterMilliseconds(error) ?? 0) > 60000)
    return false
  if (error instanceof Error && ['AbortError', 'CancelledError', 'ApiContractError', 'UnavailableMarketMetadataError'].includes(error.name))
    return false
  const response = responseOf(error)
  if (typeof response?.status === 'number')
    return response.status === 408 || response.status === 429 || response.status >= 500
  return error instanceof TypeError || error instanceof RequestDeadlineError
}

export function graphqlRetryDelay(attempt: number, error: unknown) {
  const retryAfter = retryAfterMilliseconds(error)
  if (retryAfter != null)
    return Math.min(retryAfter, 60000)
  return Math.min(1000 * 2 ** attempt, 10000)
}
