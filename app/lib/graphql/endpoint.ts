// Single source of truth for the Morpho GraphQL endpoint shared by the browser
// client, the market-detail hook, the popular-assets Pages Function, and the
// blacklist generator.
//
// Keep this module dependency-free so the app, the Cloudflare edge runtime, and
// local scripts can all import the exact same value. Live probes (2026-10-11)
// confirmed api.morpho.org serves the same identity and selected fields as the
// legacy blue-api.morpho.org host for the detail, popular, blacklist, and
// unhealthy queries.
export const MORPHO_GRAPHQL_URL = 'https://api.morpho.org/graphql'
