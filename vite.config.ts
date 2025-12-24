import process from 'node:process'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const base = isProduction ? '/morpho-blue-markets/' : ''
  const gitSha = (process.env.VITE_GIT_SHA || process.env.GITHUB_SHA || (!isProduction ? '000dev' : null))?.trim() || null
  return {
    base,
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), svgr({ svgrOptions: { icon: true } })],
    define: {
      __GIT_SHA__: JSON.stringify(gitSha),
    },
  }
})
