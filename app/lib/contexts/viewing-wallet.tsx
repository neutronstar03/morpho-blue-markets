import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getAddress, isAddress } from 'viem'

const STORAGE_KEY = 'viewing-wallet:address'

interface ViewingWalletContextType {
  viewingAddress?: Address
  isViewingWallet: boolean
  clearViewingWallet: () => void
}

const ViewingWalletContext = createContext<ViewingWalletContextType | undefined>(undefined)

function getViewingAddressFromHash(hash: string): Address | undefined {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  for (const part of raw.split('&')) {
    const [key, value] = part.split('=')
    if (key === 'w' && value && isAddress(value))
      return getAddress(value)
  }
  return undefined
}

function removeViewingWalletFromHash() {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  const nextHash = raw
    .split('&')
    .filter(part => part && !part.startsWith('w='))
    .join('&')

  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`
  window.history.replaceState(null, '', nextUrl)
}

export function ViewingWalletProvider({ children }: { children: ReactNode }) {
  const [viewingAddress, setViewingAddress] = useState<Address | undefined>(undefined)

  useEffect(() => {
    const syncFromHashOrStorage = () => {
      const hashAddress = getViewingAddressFromHash(window.location.hash)
      if (hashAddress) {
        window.localStorage.setItem(STORAGE_KEY, hashAddress)
        setViewingAddress(hashAddress)
        return
      }

      const storedAddress = window.localStorage.getItem(STORAGE_KEY)
      if (storedAddress && isAddress(storedAddress)) {
        setViewingAddress(getAddress(storedAddress))
        return
      }

      setViewingAddress(undefined)
    }

    syncFromHashOrStorage()
    window.addEventListener('hashchange', syncFromHashOrStorage)
    return () => window.removeEventListener('hashchange', syncFromHashOrStorage)
  }, [])

  const clearViewingWallet = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY)
    setViewingAddress(undefined)
    removeViewingWalletFromHash()
  }, [])

  const value = useMemo(() => ({
    viewingAddress,
    isViewingWallet: !!viewingAddress,
    clearViewingWallet,
  }), [clearViewingWallet, viewingAddress])

  return <ViewingWalletContext.Provider value={value}>{children}</ViewingWalletContext.Provider>
}

export function useViewingWallet() {
  const context = useContext(ViewingWalletContext)
  if (context === undefined)
    throw new Error('useViewingWallet must be used within a ViewingWalletProvider')
  return context
}
