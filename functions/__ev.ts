// Cloudflare Pages Function — analytics proxy
// Handles POST /__ev and forwards to the self-hosted Umami backend.
//
// The Umami backend URL is stored as a Cloudflare Pages secret:
//   wrangler pages secret put UMAMI_BACKEND_URL
//
// This proxy makes analytics invisible to adblockers because the browser
// only sees same-origin requests to /__ev — never the real analytics domain.

interface Env {
  UMAMI_BACKEND_URL: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const umamiBackend = context.env.UMAMI_BACKEND_URL

  if (!umamiBackend) {
    return new Response(JSON.stringify({ error: 'UMAMI_BACKEND_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const targetUrl = `${umamiBackend.replace(/\/+$/, '')}/api/send`

  // Forward the request, preserving content-type and adding the client IP
  const headers = new Headers(context.request.headers)
  headers.set('X-Forwarded-For', context.request.headers.get('CF-Connecting-IP') ?? '')
  headers.delete('cookie') // Don't leak user cookies to the analytics backend

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: context.request.body,
      redirect: 'follow',
    })

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: `Proxy error: ${message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Reject other methods — analytics should only use POST
export const onRequest: PagesFunction<Env> = async () => {
  return new Response('Method Not Allowed', { status: 405 })
}
