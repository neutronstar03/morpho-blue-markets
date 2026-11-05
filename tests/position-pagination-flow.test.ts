import type { UserPosition } from '../app/lib/hooks/graphql/use-user-positions'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { graphqlClient } from '../app/lib/graphql/client'
import { fetchUserPositions } from '../app/lib/hooks/graphql/use-user-positions'
import { buildLiveMarketPosition, liveMarketMetadataFromGraphPosition } from '../app/lib/morpho/live-position'
import { buildBatchWithdrawMarketItems } from '../app/pages/home/batch-withdraw/batch-withdraw-plan'
import { getPositionSuppliedAssets } from '../app/pages/home/position/position-utils'

function position(index: number): UserPosition {
  const id = `0x${index.toString(16).padStart(64, '0')}`
  return {
    market: {
      marketId: id,
      uniqueKey: id,
      loanAsset: { address: `0x${'1'.repeat(40)}`, symbol: 'TEST', decimals: 18 },
      collateralAsset: { address: `0x${'2'.repeat(40)}`, symbol: 'COL', decimals: 18 },
      oracle: null,
      warnings: [],
      irmAddress: `0x${'3'.repeat(40)}`,
      lltv: '800000000000000000',
      state: { supplyAssets: '1000', supplyShares: '1000000', netSupplyApy: 0.1, utilization: 0, supplyAssetsUsd: 1000, rewards: [] },
    },
    state: { supplyShares: '1000000', borrowShares: '0', collateral: '0' },
  }
}
afterEach(() => mock.restore())

test('page-two discovery reaches live portfolio quantities and batch-withdraw planning', async () => {
  const all = Array.from({ length: 101 }, (_, i) => position(i + 1))
  spyOn(graphqlClient, 'request')
    .mockResolvedValueOnce({ marketPositions: { items: all.slice(0, 100), pageInfo: { countTotal: 101, count: 100, limit: 100, skip: 0 } } })
    .mockResolvedValueOnce({ marketPositions: { items: all.slice(100), pageInfo: { countTotal: 101, count: 1, limit: 100, skip: 100 } } })
  const discovered = await fetchUserPositions(`0x${'0'.repeat(40)}`, 1)
  expect(discovered).toHaveLength(101)
  const last = discovered[100]
  const marketState = [1000n, 1000000n, 0n, 0n, 1n, 0n]
  const live = buildLiveMarketPosition({
    metadata: liveMarketMetadataFromGraphPosition(last),
    graphUserState: last.state,
    source: last.source,
    positionResult: [1000000n, 0n, 0n],
    marketResult: marketState,
    rateAtTarget: 0n,
    projectionTimestamp: 1,
  })
  expect(live).not.toBeNull()
  expect(getPositionSuppliedAssets(live!)).toBeGreaterThan(0n)
  const plan = buildBatchWithdrawMarketItems({
    selectedOption: last.market.loanAsset,
    selectedUserMarkets: [live!],
    marketReads: [{ status: 'success', result: marketState }],
    rateReads: [{ status: 'success', result: 0n }],
    nowSec: 1n,
  })
  expect(plan.ok).toBe(true)
  expect(String(plan.items[0]?.marketId)).toBe(last.market.uniqueKey)
})
