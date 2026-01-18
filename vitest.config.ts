import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    globals: true,
    include: ['tests/ui/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '~': new URL('./app', import.meta.url).pathname,
    },
  },
})
