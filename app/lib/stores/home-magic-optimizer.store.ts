import type { OptimizeSupplyWithPositionsResult } from '~/lib/optimizer/supply-optimizer'
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
  usePrecomputedIfFresh?: boolean
}

interface HomeMagicPrecomputedResult {
  id: string
  chainId: number
  userAddressLower: string
  loanAssetAddressLower: string
  maxMarketsUsed: number
  newDepositAmount: string
  computedAt: number
  expiresAt: number
  result: OptimizeSupplyWithPositionsResult
}

interface HomeMagicOptimizerState {
  isScanning: boolean
  scanChainId?: number
  scanCurrentAssetSymbol?: string
  scanCurrentIndex: number
  scanTotalAssets: number
  opportunities: HomeMagicOpportunity[]
  precomputedResults: HomeMagicPrecomputedResult[]
  optimizerPreset?: HomeMagicOptimizerPreset
  startScan: (args: { chainId: number, totalAssets: number }) => void
  setScanProgress: (args: { assetSymbol: string, index: number }) => void
  finishScan: () => void
  clearScan: () => void
  addOpportunity: (opportunity: HomeMagicOpportunity) => void
  dismissOpportunity: (id: string) => void
  clearOpportunitiesForChain: (chainId: number) => void
  upsertPrecomputedResult: (entry: HomeMagicPrecomputedResult) => void
  consumeFreshPrecomputedResult: (args: {
    chainId: number
    userAddress: string
    loanAssetAddress: string
    maxMarketsUsed: number
    newDepositAmount: string
    nowMs?: number
  }) => OptimizeSupplyWithPositionsResult | undefined
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
  precomputedResults: [],
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
  upsertPrecomputedResult: (entry) => {
    set((state) => {
      const now = Date.now()
      const next = state.precomputedResults
        .filter(item => item.id !== entry.id && item.expiresAt > now)
      next.unshift(entry)
      return { precomputedResults: next }
    })
  },
  consumeFreshPrecomputedResult: (args) => {
    const {
      chainId,
      userAddress,
      loanAssetAddress,
      maxMarketsUsed,
      newDepositAmount,
      nowMs = Date.now(),
    } = args
    const userAddressLower = userAddress.toLowerCase()
    const loanAssetAddressLower = loanAssetAddress.toLowerCase()

    const state = get()
    const found = state.precomputedResults.find((item) => {
      return item.chainId === chainId
        && item.userAddressLower === userAddressLower
        && item.loanAssetAddressLower === loanAssetAddressLower
        && item.maxMarketsUsed === maxMarketsUsed
        && item.newDepositAmount === newDepositAmount
        && item.expiresAt >= nowMs
    })

    set(current => ({
      precomputedResults: current.precomputedResults.filter(item => item.expiresAt >= nowMs && item.id !== found?.id),
    }))

    return found?.result
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
