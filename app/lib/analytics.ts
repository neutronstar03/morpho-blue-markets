// Lightweight Umami v2 analytics client — bundled into the SPA.
// Sends events to a first-party path (/ev) which is proxied by the
// Cloudflare Pages Function to the self-hosted Umami backend.
//
// This avoids loading an external script (which adblockers can block)
// and avoids sending requests to known analytics domains (which adblockers
// block by domain). The browser only sees same-origin requests.
//
// Umami v2 API format: { type: "event"|"identify", payload: { ... } }
// Pageviews are type "event" without a name field.
// Custom events are type "event" with a name field.
//
// NOTE: Do NOT use /__ prefix paths — Cloudflare Pages reserves /__
// for internal routes and such requests return 400 before reaching Functions.

const UMAMI_ENDPOINT = '/ev'
const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined

interface UmamiPayload {
  website: string
  hostname: string
  url?: string
  referrer?: string
  title?: string
  language?: string
  screen?: string
  name?: string
  data?: Record<string, unknown>
}

interface UmamiRequest {
  type: 'event' | 'identify'
  payload: UmamiPayload
}

// Persist the cache token Umami returns so session continuity works
// across pageviews (prevents inflated session counts).
let cacheToken: string | null = null

function send(request: UmamiRequest): void {
  if (!WEBSITE_ID) {
    // Analytics disabled — VITE_UMAMI_WEBSITE_ID not set
    return
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (cacheToken) {
    headers['x-umami-cache'] = cacheToken
  }

  fetch(UMAMI_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    keepalive: true, // ensures send completes even if page unloads
  })
    .then((res) => {
      if (res.ok) {
        return res.json()
      }
    })
    .then((data) => {
      // Store the cache token for session continuity on subsequent requests
      if (data && typeof data === 'object' && 'cache' in data && typeof data.cache === 'string') {
        cacheToken = data.cache
      }
    })
    .catch(() => {
      // silently ignore network errors — analytics must never break the app
    })
}

function screenResolution(): string {
  return `${window.screen.width}x${window.screen.height}`
}

function language(): string {
  return navigator.language
}

/** Track a pageview. Call on initial load and on client-side navigations. */
export function trackPageview(url?: string): void {
  send({
    type: 'event',
    payload: {
      website: WEBSITE_ID!,
      url: url ?? window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
      title: document.title || undefined,
      hostname: window.location.hostname,
      language: language(),
      screen: screenResolution(),
    },
  })
}

/** Track a custom event (e.g. button click, transaction submitted). */
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  send({
    type: 'event',
    payload: {
      website: WEBSITE_ID!,
      url: window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
      title: document.title || undefined,
      hostname: window.location.hostname,
      language: language(),
      screen: screenResolution(),
      name,
      data,
    },
  })
}
