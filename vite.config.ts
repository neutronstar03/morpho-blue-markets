import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  const base = isProduction ? '/morpho-blue-markets/' : ''
  return {
    base,
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  }
})
