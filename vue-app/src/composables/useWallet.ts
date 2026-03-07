import {
  useChainId,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from '@wagmi/vue'
import { computed, ref } from 'vue'

export function useWallet() {
  const { address, isConnected } = useConnection()
  const chainId = useChainId()
  const connectors = useConnectors()
  const connectMutation = useConnect()
  const disconnectMutation = useDisconnect()
  const switchChainMutation = useSwitchChain()

  const connectError = ref<string | null>(null)
  const disconnectError = ref<string | null>(null)
  const switchChainError = ref<string | null>(null)

  async function connect(connectorId?: string) {
    connectError.value = null

    const connector = connectorId
      ? connectors.value.find(item => item.id === connectorId)
      : connectors.value[0]

    if (!connector) {
      connectError.value = 'No wallet connector is available in this browser.'
      return
    }

    try {
      await connectMutation.mutateAsync({ connector })
    }
    catch (error) {
      connectError.value = error instanceof Error ? error.message : 'Wallet connection failed.'
    }
  }

  async function disconnect() {
    disconnectError.value = null

    try {
      await disconnectMutation.mutateAsync()
    }
    catch (error) {
      disconnectError.value = error instanceof Error ? error.message : 'Wallet disconnect failed.'
    }
  }

  async function switchChain(targetChainId: number) {
    switchChainError.value = null

    try {
      await switchChainMutation.mutateAsync({ chainId: targetChainId })
    }
    catch (error) {
      switchChainError.value = error instanceof Error ? error.message : 'Network switch failed.'
    }
  }

  return {
    isConnected,
    address,
    chainId,
    availableConnectors: connectors,
    supportedChains: switchChainMutation.chains,
    connect,
    disconnect,
    switchChain,
    connectError,
    disconnectError,
    switchChainError,
    isConnecting: computed(() => connectMutation.isPending.value),
    isDisconnecting: computed(() => disconnectMutation.isPending.value),
    isSwitchingChain: computed(() => switchChainMutation.isPending.value),
  }
}
