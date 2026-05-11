import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ConfigEnv, Plugin, ResolvedConfig, UserConfig } from 'vite'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import { onRequestGet as collateralReview } from './functions/api/collateral-review'
import { onRequestGet as popularLoanAssets } from './functions/api/popular-loan-assets'
import { onRequestGet as tokenLiquidity } from './functions/api/token-liquidity'

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

type PagesFunctionHandler = (context: EventContext<Record<string, unknown>>) => Promise<Response>

const DEV_API_HANDLERS: Record<string, PagesFunctionHandler> = {
  '/api/collateral-review': collateralReview as PagesFunctionHandler,
  '/api/popular-loan-assets': popularLoanAssets as PagesFunctionHandler,
  '/api/token-liquidity': tokenLiquidity as PagesFunctionHandler,
}

function requestFromIncoming(req: IncomingMessage) {
  const host = req.headers.host ?? 'localhost'
  return new Request(`http://${host}${req.url ?? '/'}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
  })
}

async function writeNodeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : undefined
  res.end(body)
}

function devPagesFunctionsPlugin(): Plugin {
  return {
    name: 'mbm-dev-pages-functions',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/'
        const url = new URL(rawUrl, 'http://localhost')

        const artifactNames = new Set([
          '/blacklist.markets.json',
          '/blacklist.markets.manual.json',
          '/whitelist.collaterals.json',
        ])
        if (artifactNames.has(url.pathname)) {
          const publicPath = join(process.cwd(), 'public', url.pathname.slice(1))
          if (!existsSync(publicPath))
            return writeNodeResponse(res, new Response(JSON.stringify({ error: 'Local artifact not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }))

          return writeNodeResponse(res, new Response(readFileSync(publicPath), { headers: { 'Content-Type': 'application/json' } }))
        }

        const handler = DEV_API_HANDLERS[url.pathname]
        if (!handler)
          return next()

        try {
          const waitUntilPromises: Promise<unknown>[] = []
          const response = await handler({
            request: requestFromIncoming(req),
            env: {},
            params: {},
            waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise),
            passThroughOnException: () => {},
            next: async () => new Response('Not found', { status: 404 }),
            data: {},
            functionPath: url.pathname,
          })
          void Promise.allSettled(waitUntilPromises)
          return writeNodeResponse(res, response)
        }
        catch (error) {
          server.config.logger.error(error instanceof Error ? error.stack || error.message : String(error))
          return writeNodeResponse(res, new Response(JSON.stringify({ error: 'Local Pages Function error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const isProduction = mode === 'production'
  // Custom domain deployment — no subpath needed. The base is '/' (root) in all environments.
  // (Previously '/morpho-blue-markets/' for GitHub Pages subpath hosting.)
  const gitSha = (process.env.VITE_GIT_SHA || process.env.GITHUB_SHA || (!isProduction ? '000dev' : null))?.trim() || null
  return {
    plugins: [tailwindcss(), devPagesFunctionsPlugin(), reactRouter(), svgr({ svgrOptions: { icon: true } }), versionJsonPlugin(gitSha)],
    resolve: {
      tsconfigPaths: true,
    },
    define: {
      __GIT_SHA__: JSON.stringify(gitSha),
    },
  }
})
