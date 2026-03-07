import type { Config } from '@wagmi/core'
import {
  connect,
  disconnect,
  getConnection,
  getConnectors,
  reconnect,
  switchChain,
  watchConnection,
  watchConnectors,
} from '@wagmi/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSupportedChainName } from '../lib/wagmi'
import { useNetworkStore } from './network'

interface WalletConnectorOption {
  id: string
  name: string
  uid: string
  isReady: boolean
}

export const useWalletStore = defineStore('wallet', () => {
  const networkStore = useNetworkStore()

  const initialized = ref(false)
  const availableConnectors = ref<WalletConnectorOption[]>([])
  const address = ref<string | null>(null)
  const chainId = ref<number | null>(null)
  const connectorId = ref<string | null>(null)
  const connectorName = ref<string | null>(null)
  const status = ref<'connected' | 'connecting' | 'disconnected' | 'reconnecting'>('disconnected')

  const connectError = ref<string | null>(null)
  const disconnectError = ref<string | null>(null)
  const switchChainError = ref<string | null>(null)
  const reconnectError = ref<string | null>(null)

  const isConnecting = ref(false)
  const isDisconnecting = ref(false)
  const isSwitchingChain = ref(false)
  const isInitializing = ref(false)

  let stopWatchingConnection: (() => void) | null = null
  let stopWatchingConnectors: (() => void) | null = null

  function syncConnection(config: Config) {
    const connection = getConnection(config)
    address.value = connection.address ?? null
    chainId.value = connection.chainId ?? null
    connectorId.value = connection.connector?.id ?? null
    connectorName.value = connection.connector?.name ?? null
    status.value = connection.status
  }

  async function refreshConnectors(config: Config) {
    const connectors = getConnectors(config)
    availableConnectors.value = await Promise.all(
      connectors.map(async connector => ({
        id: connector.id,
        name: connector.name,
        uid: connector.uid,
        isReady: Boolean(await connector.getProvider().catch(() => undefined)),
      })),
    )
  }

  async function initialize(config: Config) {
    if (initialized.value)
      return

    initialized.value = true
    isInitializing.value = true
    syncConnection(config)
    await refreshConnectors(config)

    stopWatchingConnection = watchConnection(config, {
      onChange() {
        syncConnection(config)
      },
    })

    stopWatchingConnectors = watchConnectors(config, {
      onChange() {
        void refreshConnectors(config)
      },
    })

    reconnectError.value = null

    try {
      await reconnect(config)
    }
    catch (error) {
      reconnectError.value = error instanceof Error ? error.message : 'Wallet reconnect failed.'
    }
    finally {
      syncConnection(config)
      await refreshConnectors(config)
      isInitializing.value = false
    }
  }

  async function connectWallet(config: Config, nextConnectorId?: string) {
    connectError.value = null

    const connectors = getConnectors(config)
    const connector = nextConnectorId
      ? connectors.find(item => item.id === nextConnectorId)
      : connectors[0]

    if (!connector) {
      connectError.value = 'No wallet connector is configured for the pilot.'
      return
    }

    const provider = await connector.getProvider().catch(() => undefined)
    if (!provider) {
      connectError.value = `No injected provider was found for ${connector.name}.`
      await refreshConnectors(config)
      return
    }

    isConnecting.value = true

    try {
      await connect(config, { connector })
    }
    catch (error) {
      connectError.value = error instanceof Error ? error.message : 'Wallet connection failed.'
    }
    finally {
      isConnecting.value = false
      syncConnection(config)
      await refreshConnectors(config)
    }
  }

  async function disconnectWallet(config: Config) {
    disconnectError.value = null
    isDisconnecting.value = true

    try {
      await disconnect(config)
    }
    catch (error) {
      disconnectError.value = error instanceof Error ? error.message : 'Wallet disconnect failed.'
    }
    finally {
      isDisconnecting.value = false
      syncConnection(config)
      await refreshConnectors(config)
    }
  }

  async function switchWalletChain(config: Config, targetChainId: number) {
    switchChainError.value = null
    isSwitchingChain.value = true

    try {
      await switchChain(config, { chainId: targetChainId })
    }
    catch (error) {
      switchChainError.value = error instanceof Error ? error.message : 'Network switch failed.'
    }
    finally {
      isSwitchingChain.value = false
      syncConnection(config)
    }
  }

  function cleanup() {
    stopWatchingConnection?.()
    stopWatchingConnectors?.()
    stopWatchingConnection = null
    stopWatchingConnectors = null
    initialized.value = false
  }

  const isConnected = computed(() => status.value === 'connected')
  const currentChainName = computed(() => getSupportedChainName(chainId.value))
  const requiredChainName = computed(() => getSupportedChainName(networkStore.requiredChainId))
  const isWrongNetwork = computed(() => {
    return Boolean(isConnected.value && networkStore.requiredChainId && chainId.value !== networkStore.requiredChainId)
  })

  return {
    address,
    availableConnectors,
    chainId,
    cleanup,
    connectError,
    connectorId,
    connectorName,
    connectWallet,
    currentChainName,
    disconnectError,
    disconnectWallet,
    initialize,
    initialized,
    isConnected,
    isConnecting,
    isDisconnecting,
    isInitializing,
    isSwitchingChain,
    isWrongNetwork,
    reconnectError,
    requiredChainName,
    status,
    switchChainError,
    switchWalletChain,
  }
})
