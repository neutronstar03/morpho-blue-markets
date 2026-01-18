import type { Plugin, ResolvedConfig } from 'vite'
import process from 'node:process'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import tsconfigPaths from 'vite-tsconfig-paths'

function versionJsonPlugin(gitSha: string | null): Plugin {
  let isSsrBuild = false
  return {
    name: 'emit-version-json',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      isSsrBuild = !!config?.build?.ssr
    },
    generateBundle() {
      // react-router builds both server and client; we only want the file in the client output
      if (isSsrBuild)
        return

      const payload = {
        gitSha,
        builtAt: new Date().toISOString(),
      }

      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(payload),
      })
    },
  }
}

export default defineConfig(({ mode }: { mode: string }) => {
  const isProduction = mode === 'production'
  const base = isProduction ? '/morpho-blue-markets/' : ''
  const gitSha = (process.env.VITE_GIT_SHA || process.env.GITHUB_SHA || (!isProduction ? '000dev' : null))?.trim() || null
  return {
    base,
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), svgr({ svgrOptions: { icon: true } }), versionJsonPlugin(gitSha)],
    define: {
      __GIT_SHA__: JSON.stringify(gitSha),
    },
  }
})
