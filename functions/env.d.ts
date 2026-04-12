// Type declarations for Cloudflare Pages Functions
// This file provides just the types needed by the analytics proxy,
// avoiding polluting the browser app's global types with Cloudflare Worker types.

interface Env {
  UMAMI_BACKEND_URL: string
}

interface EventContext<Environment = Env> {
  request: Request
  env: Environment
  params: Record<string, string>
  data: Record<string, unknown>
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>
  functionPath: string
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException: () => void
}

type PagesFunction<Environment = Env> = (
  context: EventContext<Environment>,
) => Promise<Response> | Response
