import { defineStore } from 'pinia'

interface NetworkState {
  requiredChainId: number | null
}

export const useNetworkStore = defineStore('network', {
  state: (): NetworkState => ({
    requiredChainId: null,
  }),
  actions: {
    setRequiredChainId(chainId: number | null) {
      this.requiredChainId = chainId
    },
  },
})
