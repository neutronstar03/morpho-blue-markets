import { create } from 'zustand'

export interface HomeMagicOpportunity {
  id: string
  chainId: number
  loanAssetAddress: string
  loanAssetSymbol: string
  loanAssetDecimals: number
  aprGainWad: bigint
  aprGainPct: number
  createdAt: number
}

export interface HomeMagicOptimizerPreset {
  chainId: number
  loanAssetAddress: string
  loanAssetSymbol: string
  loanAssetDecimals: number
  newDepositAmount: string
  maxMarketsUsed: number
}

interface HomeMagicOptimizerState {
  isScanning: boolean
  scanChainId?: number
  scanCurrentAssetSymbol?: string
  scanCurrentIndex: number
  scanTotalAssets: number
  opportunities: HomeMagicOpportunity[]
  optimizerPreset?: HomeMagicOptimizerPreset
  startScan: (args: { chainId: number, totalAssets: number }) => void
  setScanProgress: (args: { assetSymbol: string, index: number }) => void
  finishScan: () => void
  clearScan: () => void
  addOpportunity: (opportunity: HomeMagicOpportunity) => void
  dismissOpportunity: (id: string) => void
  clearOpportunitiesForChain: (chainId: number) => void
  setOptimizerPreset: (preset: HomeMagicOptimizerPreset) => void
  consumeOptimizerPreset: () => HomeMagicOptimizerPreset | undefined
}

export const useHomeMagicOptimizerStore = create<HomeMagicOptimizerState>((set, get) => ({
  isScanning: false,
  scanChainId: undefined,
  scanCurrentAssetSymbol: undefined,
  scanCurrentIndex: 0,
  scanTotalAssets: 0,
  opportunities: [],
  optimizerPreset: undefined,
  startScan: ({ chainId, totalAssets }) => {
    set({
      isScanning: true,
      scanChainId: chainId,
      scanCurrentAssetSymbol: undefined,
      scanCurrentIndex: 0,
      scanTotalAssets: totalAssets,
    })
  },
  setScanProgress: ({ assetSymbol, index }) => {
    set({
      scanCurrentAssetSymbol: assetSymbol,
      scanCurrentIndex: index,
    })
  },
  finishScan: () => {
    set({
      isScanning: false,
      scanCurrentAssetSymbol: undefined,
      scanCurrentIndex: 0,
      scanTotalAssets: 0,
    })
  },
  clearScan: () => {
    set({
      isScanning: false,
      scanChainId: undefined,
      scanCurrentAssetSymbol: undefined,
      scanCurrentIndex: 0,
      scanTotalAssets: 0,
    })
  },
  addOpportunity: (opportunity) => {
    set((state) => {
      const next = state.opportunities.filter(existing => existing.id !== opportunity.id)
      next.unshift(opportunity)
      return { opportunities: next }
    })
  },
  dismissOpportunity: (id) => {
    set(state => ({ opportunities: state.opportunities.filter(o => o.id !== id) }))
  },
  clearOpportunitiesForChain: (chainId) => {
    set(state => ({ opportunities: state.opportunities.filter(o => o.chainId !== chainId) }))
  },
  setOptimizerPreset: (preset) => {
    set({ optimizerPreset: preset })
  },
  consumeOptimizerPreset: () => {
    const preset = get().optimizerPreset
    if (preset)
      set({ optimizerPreset: undefined })
    return preset
  },
}))
