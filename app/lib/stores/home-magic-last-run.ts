const LAST_RUN_BY_CHAIN_KEY = 'home-magic:last-run-by-chain'

type LastRunByChain = Record<string, number>

function readMap(): LastRunByChain {
  if (typeof window === 'undefined')
    return {}

  try {
    const raw = window.localStorage.getItem(LAST_RUN_BY_CHAIN_KEY)
    if (!raw)
      return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object')
      return {}

    const out: LastRunByChain = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value))
        out[key] = value
    }
    return out
  }
  catch {
    return {}
  }
}

function writeMap(next: LastRunByChain) {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(LAST_RUN_BY_CHAIN_KEY, JSON.stringify(next))
  }
  catch {
    // ignore storage write failures
  }
}

export function getHomeMagicLastRunMs(chainId: number): number | undefined {
  const map = readMap()
  const value = map[String(chainId)]
  return typeof value === 'number' ? value : undefined
}

export function setHomeMagicLastRunMs(chainId: number, unixMs: number) {
  const map = readMap()
  map[String(chainId)] = unixMs
  writeMap(map)
}
