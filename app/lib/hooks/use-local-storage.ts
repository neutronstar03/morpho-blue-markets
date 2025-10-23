import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIsClient } from '~/lib/hooks/use-is-client'

interface UseLocalStorageOptions<T> {
  prefix?: string
  sync?: boolean
  storage?: Storage
  serialize?: (value: T) => string
  deserialize?: (value: string) => T
}

type SetValue<T> = (value: T | ((prev: T) => T)) => void

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: UseLocalStorageOptions<T>,
): [T, SetValue<T>, () => void] {
  const {
    prefix = 'use-ls:',
    sync = true,
    storage,
    serialize = JSON.stringify,
    deserialize = JSON.parse as (value: string) => T,
  } = options || {}

  const isClient = useIsClient()

  const storageKey = useMemo(() => `${prefix}${key}`, [prefix, key])

  const getStorage = useCallback((): Storage | undefined => {
    if (storage)
      return storage
    if (typeof window === 'undefined')
      return undefined
    return window.localStorage
  }, [storage])

  const [value, setValue] = useState<T>(initialValue)

  useEffect(() => {
    if (!isClient)
      return
    try {
      const s = getStorage()
      if (!s)
        return
      const raw = s.getItem(storageKey)
      if (raw != null) {
        setValue(deserialize(raw))
      }
    }
    catch {
      // ignore read/parse errors
    }
  }, [isClient, storageKey, getStorage, deserialize])

  useEffect(() => {
    if (!isClient || !sync)
      return
    const handler = (e: StorageEvent) => {
      if (e.key !== storageKey)
        return
      try {
        if (e.newValue == null) {
          setValue(initialValue)
        }
        else {
          setValue(deserialize(e.newValue))
        }
      }
      catch {
        // ignore parse errors
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [isClient, sync, storageKey, deserialize, initialValue])

  const setStoredValue: SetValue<T> = useCallback((next) => {
    setValue((prev) => {
      const computed = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      try {
        const s = getStorage()
        if (s)
          s.setItem(storageKey, serialize(computed))
      }
      catch {
        // ignore write errors
      }
      return computed
    })
  }, [getStorage, storageKey, serialize])

  const remove = useCallback(() => {
    try {
      const s = getStorage()
      if (s)
        s.removeItem(storageKey)
    }
    catch {
      // ignore remove errors
    }
    setValue(initialValue)
  }, [getStorage, storageKey, initialValue])

  return [value, setStoredValue, remove]
}
