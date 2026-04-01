import { NetworkIcon } from '@web3icons/react/dynamic'
import { Link } from 'react-router-dom'
import { useSwitchChain } from 'wagmi'
import { useNetworkContext } from '~/lib/contexts/network'
import { formatUsd } from '~/lib/formatters'

const OPPORTUNITY_TARGET_UTILIZATION = 0.9
const OPPORTUNITY_TOP_MARKETS = 5
const OPPORTUNITY_MIN_TOTAL_DEPLOYABLE_USD = 2000

export interface OpportunityRecapMarket {
  id: string
  marketLabel: string
  chainId: number
  chainName: string
  marketSizeUsd: number | null | undefined
  utilizationPct: string
  netSupplyApy: number
}

interface OpportunityRecapAllocation {
  id: string
  marketLabel: string
  loanSymbol: string
  allocatedUsd: number
  apy: number
}

interface OpportunityRecapChain {
  chainId: number
  chainName: string
  totalDeployableUsd: number
  blendedApy: number
  marketCountUsed: number
  topAllocations: OpportunityRecapAllocation[]
}

function estimateBorrowUsd(market: OpportunityRecapMarket): number | undefined {
  if (typeof market.marketSizeUsd === 'number' && Number.isFinite(market.marketSizeUsd)) {
    const utilization = Number.parseFloat(market.utilizationPct)
    if (Number.isFinite(utilization) && utilization >= 0)
      return market.marketSizeUsd * (utilization / 100)
  }
  return undefined
}

function estimateOpportunityRoomUsd(market: OpportunityRecapMarket): number {
  if (typeof market.marketSizeUsd !== 'number' || !Number.isFinite(market.marketSizeUsd) || market.marketSizeUsd <= 0)
    return 0

  const borrowUsd = estimateBorrowUsd(market)
  if (borrowUsd == null || !Number.isFinite(borrowUsd) || borrowUsd <= 0)
    return 0

  const targetSupplyUsd = borrowUsd / OPPORTUNITY_TARGET_UTILIZATION
  const roomUsd = targetSupplyUsd - market.marketSizeUsd
  return Number.isFinite(roomUsd) && roomUsd > 0 ? roomUsd : 0
}

function buildOpportunityRecaps(markets: OpportunityRecapMarket[]): OpportunityRecapChain[] {
  const grouped = new Map<number, { chainName: string, markets: OpportunityRecapMarket[] }>()

  for (const market of markets) {
    const existing = grouped.get(market.chainId)
    if (existing) {
      existing.markets.push(market)
    }
    else {
      grouped.set(market.chainId, {
        chainName: market.chainName,
        markets: [market],
      })
    }
  }

  const recaps: OpportunityRecapChain[] = []

  for (const [chainId, group] of grouped.entries()) {
    const allocations = group.markets
      .map((market): OpportunityRecapAllocation | undefined => {
        const roomUsd = estimateOpportunityRoomUsd(market)
        if (roomUsd <= 0)
          return undefined
        if (!Number.isFinite(market.netSupplyApy) || market.netSupplyApy <= 0)
          return undefined

        return {
          id: market.id,
          marketLabel: market.marketLabel,
          loanSymbol: market.marketLabel.split('/')[1]?.trim() || market.marketLabel,
          allocatedUsd: roomUsd,
          apy: market.netSupplyApy,
        }
      })
      .filter((allocation): allocation is OpportunityRecapAllocation => allocation != null)
      .sort((a, b) => {
        const yieldDiff = (b.allocatedUsd * b.apy) - (a.allocatedUsd * a.apy)
        if (yieldDiff !== 0)
          return yieldDiff
        return b.allocatedUsd - a.allocatedUsd
      })

    if (!allocations.length)
      continue

    const totalDeployableUsd = allocations.reduce((sum, allocation) => sum + allocation.allocatedUsd, 0)
    const weightedApy = allocations.reduce((sum, allocation) => sum + (allocation.allocatedUsd * allocation.apy), 0)
    const blendedApy = totalDeployableUsd > 0 ? (weightedApy / totalDeployableUsd) : 0
    const recap = {
      chainId,
      chainName: group.chainName,
      totalDeployableUsd,
      blendedApy,
      marketCountUsed: allocations.length,
      topAllocations: allocations.slice(0, OPPORTUNITY_TOP_MARKETS),
    }

    if (recap.totalDeployableUsd < OPPORTUNITY_MIN_TOTAL_DEPLOYABLE_USD)
      continue

    recaps.push(recap)
  }

  return recaps.sort((a, b) => {
    return b.totalDeployableUsd - a.totalDeployableUsd
  })
}

export function OpportunityRecap({ markets }: { markets: OpportunityRecapMarket[] }) {
  const { switchChain } = useSwitchChain()
  const { setRequiredChainId } = useNetworkContext()
  const recaps = buildOpportunityRecaps(markets)

  if (!recaps.length) {
    return (
      <div className="rounded-md border border-gray-700 bg-gray-900/40 p-4">
        <p className="text-sm text-gray-300">No sizable supply opportunities found for the current Markets filters.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Opportunity recap</h3>
          <p className="text-xs text-gray-400">
            Conservative estimate from the current Markets filters using room before
            {' '}
            {(OPPORTUNITY_TARGET_UTILIZATION * 100).toFixed(0)}
            % utilization.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {recaps.length}
          {' '}
          {recaps.length === 1 ? 'chain' : 'chains'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {recaps.map(recap => (
          <div key={recap.chainId} className="rounded-md border border-gray-700 bg-gray-900/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-2 text-base font-semibold text-white transition-colors hover:text-blue-300"
                  onClick={() => {
                    setRequiredChainId(recap.chainId)
                    switchChain({ chainId: recap.chainId })
                  }}
                >
                  <NetworkIcon chainId={recap.chainId} size={18} variant="branded" className="h-[18px] w-[18px]" />
                  <span>{recap.chainName}</span>
                </button>
                <p className="mt-1 text-sm text-gray-300">
                  About
                  {' '}
                  <span className="font-medium text-white">{formatUsd(recap.totalDeployableUsd)}</span>
                  {' '}
                  deployable at
                  {' '}
                  <span className="font-medium text-green-300">
                    {(recap.blendedApy * 100).toFixed(2)}
                    %
                  </span>
                  {' '}
                  blended APY.
                </p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <div>
                  {recap.marketCountUsed}
                  {' '}
                  markets
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {recap.topAllocations.map((allocation) => {
                const marketHref = `/market/${allocation.id}/${recap.chainId}`
                return (
                  <div key={allocation.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-800 bg-black/10 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link to={marketHref} className="font-medium text-white hover:text-blue-300 transition-colors">
                        {allocation.marketLabel}
                      </Link>
                      <div className="text-xs text-gray-500">{allocation.loanSymbol}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white">{formatUsd(allocation.allocatedUsd)}</div>
                      <div className="text-xs text-green-300">
                        {(allocation.apy * 100).toFixed(2)}
                        %
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
