import type { RouteConfig } from '@react-router/dev/routes'
import { index } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  { path: 'market/:uniqueKey/:chainId', file: 'routes/market.tsx' },
] satisfies RouteConfig
