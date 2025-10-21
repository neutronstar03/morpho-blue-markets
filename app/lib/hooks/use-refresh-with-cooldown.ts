import { useCallback, useEffect, useRef, useState } from 'react'

interface UseRefreshWithCooldownOptions {
  cooldownMs?: number
}

interface UseRefreshWithCooldownResult<TArgs extends unknown[]> {
  handleRefresh: (...args: TArgs) => Promise<void>
  isRefreshing: boolean
  isCooldown: boolean
}

export function useRefreshWithCooldown<TArgs extends unknown[] = []>(
  refetch: (...args: TArgs) => Promise<unknown> | unknown,
  options?: UseRefreshWithCooldownOptions,
): UseRefreshWithCooldownResult<TArgs> {
  const { cooldownMs = 5000 } = options || {}
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCooldown, setIsCooldown] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current)
        clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleRefresh = useCallback(async (...args: TArgs) => {
    if (isRefreshing || isCooldown)
      return
    try {
      setIsRefreshing(true)
      await refetch(...args)
    }
    finally {
      setIsRefreshing(false)
      setIsCooldown(true)
      timeoutRef.current = window.setTimeout(() => {
        setIsCooldown(false)
        timeoutRef.current = null
      }, cooldownMs)
    }
  }, [isRefreshing, isCooldown, refetch, cooldownMs])

  return { handleRefresh, isRefreshing, isCooldown }
}
