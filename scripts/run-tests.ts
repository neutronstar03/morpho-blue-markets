import process from 'node:process'
import { fileURLToPath } from 'node:url'

// Bun and Vitest have separate suites. Live cases are explicitly named so
// release verification never relies on an RPC or upstream API being available.
const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const live = args[0] === '--live'
const testFiles = [...new Bun.Glob('tests/**/*.test.ts').scanSync({ cwd: root, onlyFiles: true })]
  .map(path => path.replaceAll('\\', '/'))
  .filter(path => !path.startsWith('tests/ui/') && path.endsWith('.live.test.ts') === live)
  .sort()

if (testFiles.length === 0)
  throw new Error(`No ${live ? 'live' : 'offline'} Bun test files found`)

const result = Bun.spawnSync([process.execPath, 'test', ...testFiles.map(path => `./${path}`), ...args.slice(live ? 1 : 0)], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(result.exitCode)
