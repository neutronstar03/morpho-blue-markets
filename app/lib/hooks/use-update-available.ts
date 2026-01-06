import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface RemoteVersion {
  gitSha?: string | null
  builtAt?: string
}

function isLikelyGitSha(value: string): boolean {
  const s = value.trim()
  return /^[a-f0-9]{7,40}$/i.test(s)
}

async function fetchRemoteVersion(signal: AbortSignal): Promise<RemoteVersion | null> {
  const url = `${import.meta.env.BASE_URL}version.json?v=${Date.now()}`
  const res = await fetch(url, {
    signal,
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
  })
  if (!res.ok)
    return null

  const json = (await res.json()) as unknown
  if (!json || typeof json !== 'object')
    return null

  const gitSha = 'gitSha' in json ? (json as any).gitSha : null
  const builtAt = 'builtAt' in json ? (json as any).builtAt : undefined
  return {
    gitSha: typeof gitSha === 'string' ? gitSha : null,
    builtAt: typeof builtAt === 'string' ? builtAt : undefined,
  }
}

export function useUpdateAvailable(options?: { pollIntervalMs?: number }) {
  const pollIntervalMs = options?.pollIntervalMs ?? 60_000

  const localSha = useMemo(() => {
    const s = typeof __GIT_SHA__ === 'string' ? __GIT_SHA__.trim() : null
    if (!s || s === '000dev')
      return null
    return s
  }, [])

  const [isAvailable, setIsAvailable] = useState(false)
  const [latestSha, setLatestSha] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const lastCheckedAtRef = useRef<number>(0)

  const checkOnce = useCallback(async () => {
    if (dismissed)
      return
    if (!localSha || !isLikelyGitSha(localSha))
      return

    const now = Date.now()
    // avoid spamming checks if multiple triggers fire back-to-back (interval + visibilitychange)
    if (now - lastCheckedAtRef.current < 5_000)
      return
    lastCheckedAtRef.current = now

    const controller = new AbortController()
    try {
      const remote = await fetchRemoteVersion(controller.signal)
      const remoteSha = remote?.gitSha?.trim() || null
      if (!remoteSha || !isLikelyGitSha(remoteSha))
        return

      if (remoteSha !== localSha) {
        setLatestSha(remoteSha)
        setIsAvailable(true)
      }
    }
    catch {
      // ignore network/cors/cache transient issues
    }
    finally {
      controller.abort()
    }
  }, [dismissed, localSha])

  useEffect(() => {
    void checkOnce()

    const id = window.setInterval(() => {
      void checkOnce()
    }, pollIntervalMs)

    const onVisibility = () => {
      if (document.visibilityState === 'visible')
        void checkOnce()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkOnce, pollIntervalMs])

  const refresh = useCallback(() => {
    window.location.reload()
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  return { isAvailable: isAvailable && !dismissed, latestSha, refresh, dismiss }
}
