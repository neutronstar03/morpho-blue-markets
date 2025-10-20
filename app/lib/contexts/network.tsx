import type { ReactNode } from 'react'
import {
  createContext,

  useContext,
  useMemo,
  useState,
} from 'react'

interface NetworkContextType {
  requiredChainId: number | null
  setRequiredChainId: (chainId: number | null) => void
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [requiredChainId, setRequiredChainId] = useState<number | null>(null)

  const value = useMemo(
    () => ({ requiredChainId, setRequiredChainId }),
    [requiredChainId],
  )

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  )
}

export function useNetworkContext() {
  const context = useContext(NetworkContext)
  if (context === undefined) {
    throw new Error('useNetworkContext must be used within a NetworkProvider')
  }
  return context
}
