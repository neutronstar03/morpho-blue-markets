import type { Config } from '@react-router/dev/config'

export default {
  // SPA mode — DeFi apps are client-first (wallets, RPC, React Query).
  // SSR would add latency and complexity for no user-facing benefit.
  ssr: false,
  // Custom domain deployment — no basename needed (root path).
  // (Previously '/morpho-blue-markets' for GitHub Pages subpath hosting.)
  prerender: ['/'],
} satisfies Config
