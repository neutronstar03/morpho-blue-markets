import type { Config } from '@react-router/dev/config'

const IS_PRODUCTION = import.meta.env.MODE === 'production'
const basename = IS_PRODUCTION ? '/morpho-blue-markets' : ''

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  basename,
  prerender: ['/'],
} satisfies Config
