import type { RouteConfig } from '@react-router/dev/routes'
import { index } from '@react-router/dev/routes'

export default [
  index('routes/market.tsx'),
  { path: 'home', file: 'routes/home.tsx' },
] satisfies RouteConfig
