// Lightweight Umami analytics client — bundled into the SPA.
// Sends events to a first-party path (/__ev) which is proxied by the
// Cloudflare Pages Function to the self-hosted Umami backend.
//
// This avoids loading an external script (which adblockers can block)
// and avoids sending requests to known analytics domains (which adblockers
// block by domain). The browser only sees same-origin requests.

const UMAMI_ENDPOINT = '/__ev'
const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined

interface UmamiEventPayload {
  type: 'pageview' | 'event'
  url: string
  referrer?: string
  website: string
  hostname: string
  language?: string
  screen?: string
  event_name?: string
  event_data?: Record<string, unknown>
}

function send(payload: UmamiEventPayload): void {
  if (!WEBSITE_ID) {
    // Analytics disabled — VITE_UMAMI_WEBSITE_ID not set
    return
  }

  fetch(UMAMI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true, // ensures send completes even if page unloads
  }).catch(() => {
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
    type: 'pageview',
    url: url ?? window.location.pathname + window.location.search,
    referrer: document.referrer || undefined,
    website: WEBSITE_ID!,
    hostname: window.location.hostname,
    language: language(),
    screen: screenResolution(),
  })
}

/** Track a custom event (e.g. button click, transaction submitted). */
export function trackEvent(name: string, data?: Record<string, unknown>): void {
  send({
    type: 'event',
    url: window.location.pathname + window.location.search,
    referrer: document.referrer || undefined,
    website: WEBSITE_ID!,
    hostname: window.location.hostname,
    language: language(),
    screen: screenResolution(),
    event_name: name,
    event_data: data,
  })
}
