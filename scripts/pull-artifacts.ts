import process from 'node:process'

const DEFAULT_BASE_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1'

function parseArgValue(name: string) {
  const idx = Bun.argv.findIndex(a => a === name)
  if (idx === -1)
    return undefined
  return Bun.argv[idx + 1]
}

function parseFlag(name: string) {
  return Bun.argv.includes(name)
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok)
    throw new Error(`Fetch failed (${res.status}) ${url}`)
  return res.json()
}

async function main() {
  const baseUrl = (parseArgValue('--base-url') ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const pullBlacklist = parseFlag('--blacklist')
  const pullOracleProviders = parseFlag('--oracle-providers')
  const pullWhitelist = parseFlag('--whitelist') || (!pullBlacklist && !pullOracleProviders)

  if (pullWhitelist) {
    const url = `${baseUrl}/whitelist.collaterals.json`
    const json = await fetchJson(url)
    await Bun.write('public/whitelist.collaterals.json', `${JSON.stringify(json, null, 2)}\n`)
    console.log(`Wrote public/whitelist.collaterals.json from ${url}`)
  }

  if (pullBlacklist) {
    const url = `${baseUrl}/blacklist.markets.json`
    const json = await fetchJson(url)
    await Bun.write('public/blacklist.markets.json', `${JSON.stringify(json, null, 2)}\n`)
    console.log(`Wrote public/blacklist.markets.json from ${url}`)
  }

  if (pullOracleProviders) {
    const url = `${baseUrl}/oracle-providers.json`
    const json = await fetchJson(url)
    await Bun.write('public/oracle-providers.json', `${JSON.stringify(json, null, 2)}\n`)
    console.log(`Wrote public/oracle-providers.json from ${url}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
