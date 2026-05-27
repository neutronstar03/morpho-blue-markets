import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useQuery } from '@tanstack/react-query'
import { formatUnits, parseUnits } from 'viem'
import { STALE_TIME_MEDIUM_MS } from '~/lib/hooks/query-stale-times'
import { useOraclePrice } from '~/lib/hooks/rpc/use-oracle-price'

const MIN_SWAP_USD = 5_000
const MAX_SWAP_USD = 50_000
const BORROW_PCT = 0.05
const USD_CHUNK = 1_000
const SELL_AMOUNT_SIGNIFICANT_DIGITS = 2

function computeTargetUsd(borrowAssetsUsd: number): number {
  const raw = borrowAssetsUsd * BORROW_PCT
  const clamped = Math.max(MIN_SWAP_USD, Math.min(MAX_SWAP_USD, raw))
  return Math.round(clamped / USD_CHUNK) * USD_CHUNK
}

function getCollateralPriceUsd(market: SingleMorphoMarket): number | null {
  if (market.collateralAsset.price?.usd != null && Number.isFinite(market.collateralAsset.price.usd)) {
    return market.collateralAsset.price.usd
  }

  // Direct price from Morpho (added to query in use-market.ts)
  if (market.collateralAsset.priceUsd != null && Number.isFinite(market.collateralAsset.priceUsd)) {
    return market.collateralAsset.priceUsd
  }

  // Fallback: collateralAssetsUsd / collateralAssets
  const collateralAssets = market.state.collateralAssets
  const collateralAssetsUsd = market.state.collateralAssetsUsd
  if (collateralAssets != null && collateralAssetsUsd != null && Number.isFinite(collateralAssetsUsd)) {
    const assetsNum = Number(formatUnits(BigInt(collateralAssets), market.collateralAsset.decimals))
    if (assetsNum > 0) {
      return collateralAssetsUsd / assetsNum
    }
  }

  return null
}

function getLoanPriceUsd(market: SingleMorphoMarket): number | null {
  if (market.loanAsset.price?.usd != null && Number.isFinite(market.loanAsset.price.usd)) {
    return market.loanAsset.price.usd
  }

  return null
}

function roundBigIntToSignificantDigits(value: bigint, digits: number): bigint {
  if (value <= 0n) {
    return value
  }

  const valueStr = value.toString()
  if (valueStr.length <= digits) {
    return value
  }

  const keep = valueStr.slice(0, digits)
  const shouldRoundUp = Number(valueStr[digits]) >= 5
  const roundedLeading = BigInt(keep) + (shouldRoundUp ? 1n : 0n)
  const zeros = valueStr.length - digits

  return roundedLeading * 10n ** BigInt(zeros)
}

function computeSellAmount(targetUsd: number, priceUsd: number, decimals: number): bigint {
  const tokenAmount = targetUsd / priceUsd
  // toFixed ensures we don't pass scientific notation to parseUnits
  const tokenAmountStr = tokenAmount.toFixed(decimals)
  const rawSellAmount = parseUnits(tokenAmountStr, decimals)

  return roundBigIntToSignificantDigits(rawSellAmount, SELL_AMOUNT_SIGNIFICANT_DIGITS)
}

export interface SwapEstimateData {
  grossBuyAmount: string
  netBuyAmount: string
  sellAmount: string
  sources: string[]
  zid: string
}

export interface UseSwapEstimateReturn {
  data: SwapEstimateData | undefined
  effectivePrice: number | undefined
  sellAmountFormatted: string | undefined
  isLoading: boolean
  error: Error | null
}

export function useSwapEstimate(market: SingleMorphoMarket): UseSwapEstimateReturn {
  const chainId = market.morphoBlue.chain.id
  const borrowAssetsUsd = market.state.borrowAssetsUsd
  const { oraclePrice } = useOraclePrice(market)
  const collateralPriceUsd = getCollateralPriceUsd(market)
  const loanPriceUsd = getLoanPriceUsd(market)
  const oracleDerivedPriceUsd = oraclePrice != null && loanPriceUsd != null
    ? oraclePrice * loanPriceUsd
    : null
  const priceUsd = collateralPriceUsd ?? oracleDerivedPriceUsd
  const targetUsd = Number.isFinite(borrowAssetsUsd) && borrowAssetsUsd > 0
    ? computeTargetUsd(borrowAssetsUsd)
    : undefined
  const sellAmount = targetUsd != null && priceUsd != null && priceUsd > 0
    ? computeSellAmount(targetUsd, priceUsd, market.collateralAsset.decimals)
    : undefined
  const sellAmountParam = sellAmount != null && sellAmount > 0n ? sellAmount.toString() : undefined

  const { data, isLoading, error } = useQuery<SwapEstimateData>({
    queryKey: ['swap-estimate', market.uniqueKey, chainId, sellAmountParam],
    queryFn: async () => {
      if (sellAmountParam == null) {
        throw new Error('No swap amount available for collateral')
      }

      const params = new URLSearchParams({
        chainId: String(chainId),
        sellToken: market.collateralAsset.address,
        buyToken: market.loanAsset.address,
        sellAmount: sellAmountParam,
      })

      const res = await fetch(`/api/swap-estimate?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const json = await res.json()
      if (json.error) {
        throw new Error(json.error)
      }

      return json as SwapEstimateData
    },
    enabled: chainId !== 747474 && sellAmountParam != null, // Katana is unsupported by 0x
    staleTime: STALE_TIME_MEDIUM_MS,
  })

  const effectivePrice = data
    ? (Number(data.grossBuyAmount) / Number(data.sellAmount))
    * 10 ** (market.collateralAsset.decimals - market.loanAsset.decimals)
    : undefined

  const sellAmountFormatted = data
    ? formatUnits(BigInt(data.sellAmount), market.collateralAsset.decimals)
    : undefined

  return { data, effectivePrice, sellAmountFormatted, isLoading, error }
}
