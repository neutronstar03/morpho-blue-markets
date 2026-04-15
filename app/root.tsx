import type { Route } from './+types/root'

import { useEffect } from 'react'
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from 'react-router'
import { Footer } from './components/footer'
import { TransactionDock } from './components/transaction/transaction-dock'
import { TransactionSuccessModal } from './components/transaction/transaction-success-modal'
import { UpdateAvailableToast } from './components/update-available-toast'
import { initClickTracking, trackPageview } from './lib/analytics'
import { Providers } from './lib/providers'
import './app.css'
import '@rainbow-me/rainbowkit/styles.css'

const baseUrl = import.meta.env.BASE_URL

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
  {
    rel: 'apple-touch-icon',
    sizes: '180x180',
    href: `${baseUrl}apple-touch-icon.png`,
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '32x32',
    href: `${baseUrl}favicon-32x32.png`,
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '16x16',
    href: `${baseUrl}favicon-16x16.png`,
  },
  { rel: 'shortcut icon', href: `${baseUrl}favicon.ico` },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  const location = useLocation()

  // Track pageviews on navigation changes (initial load + SPA navigations)
  // The analytics client is no-op when VITE_UMAMI_WEBSITE_ID is not set.
  useEffect(() => {
    trackPageview(location.pathname + location.search)
  }, [location.pathname, location.search])

  // Initialize declarative click tracking (data-umami-event attributes) once.
  useEffect(() => {
    initClickTracking()
  }, [])

  return (
    <Providers>
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <TransactionDock />
        <TransactionSuccessModal />
        <UpdateAvailableToast />
        <Footer />
      </div>
    </Providers>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!'
  let details = 'An unexpected error occurred.'
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error'
    details
      = error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details
  }
  else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
