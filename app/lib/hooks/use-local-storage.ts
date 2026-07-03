import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const initialValueRef = useRef<{ key: string, value: T } | null>(null)
  if (!initialValueRef.current || initialValueRef.current.key !== storageKey)
    initialValueRef.current = { key: storageKey, value: initialValue }
  const stableInitialValue = initialValueRef.current.value

  const getStorage = useCallback((): Storage | undefined => {
    if (storage)
      return storage
    if (typeof window === 'undefined')
      return undefined
    return window.localStorage
  }, [storage])

  // Clear corrupt data to avoid repeated parse failures.
  const handleParseError = useCallback((error: unknown) => {
    const s = getStorage()
    if (s)
      s.removeItem(storageKey)
    console.warn('useLocalStorage: failed to parse stored value, removing key', storageKey, error)
  }, [getStorage, storageKey])

  const readRawValue = useCallback(() => {
    const s = getStorage()
    if (!s)
      return null
    return s.getItem(storageKey)
  }, [getStorage, storageKey])

  // Deserialize with fallback to initialValue on parse errors.
  const parseStoredValue = useCallback((raw: string) => {
    try {
      return deserialize(raw)
    }
    catch (error) {
      handleParseError(error)
      return stableInitialValue
    }
  }, [deserialize, handleParseError, stableInitialValue])

  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined')
      return stableInitialValue
    const raw = readRawValue()
    if (raw != null)
      return parseStoredValue(raw)
    return stableInitialValue
  })

  useEffect(() => {
    if (!isClient)
      return
    const raw = readRawValue()
    if (raw != null)
      setValue(parseStoredValue(raw))
    else
      setValue(stableInitialValue)
  }, [isClient, readRawValue, parseStoredValue, stableInitialValue])

  // Keep value in sync across tabs.
  useEffect(() => {
    if (!isClient || !sync)
      return
    const handler = (e: StorageEvent) => {
      if (e.key !== storageKey)
        return
      try {
        if (e.newValue == null) {
          setValue(stableInitialValue)
        }
        else {
          setValue(parseStoredValue(e.newValue))
        }
      }
      catch (error) {
        handleParseError(error)
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [isClient, sync, storageKey, parseStoredValue, stableInitialValue, handleParseError])

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
    setValue(stableInitialValue)
  }, [getStorage, storageKey, stableInitialValue])

  return [value, setStoredValue, remove]
}
