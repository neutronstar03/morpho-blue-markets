import type { MorphoMarketParams } from '../../app/lib/bundler3/types'
import type { OptimizedPositionDelta } from '../../app/lib/optimizer/supply-optimizer'
import { describe, expect, test } from 'bun:test'
import { decodeFunctionData } from 'viem'
import { GENERAL_ADAPTER1_ABI } from '../../app/lib/abis/bundler3'
import { getSupportedChainName } from '../../app/lib/addresses'
import { PERMIT2_ADDRESS } from '../../app/lib/bundler3/addresses'
import { buildOptimizerBundle } from '../../app/lib/bundler3/optimizer-bundle'
import { getExplorerTransactionUrl } from '../../app/lib/explorer'
import { morphoAppMarketUrl } from '../../app/lib/morpho/morpho-app'
import { config, configuredWagmiChainIds } from '../../app/lib/wagmi'

const CHAIN_ID = 4663
const BUNDLER3 = '0x6478e9393d4C5bB4d53ee881d1DE78786A0344a6'
const ADAPTER = '0xc5E188541D107e8B79e43478bDE365F1406665D6'
const USER = '0x00000000000000000000000000000000000000aa'
const MARKET_A = `0x${'1'.repeat(64)}`
const MARKET_B = `0x${'2'.repeat(64)}`
const PARAMS: MorphoMarketParams = {
  loanToken: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
  collateralToken: '0x0000000000000000000000000000000000000002',
  oracle: '0x0000000000000000000000000000000000000003',
  irm: '0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1',
  lltv: 915000000000000000n,
}

function position(marketId: string, deltaAssets: bigint): OptimizedPositionDelta {
  return {
    marketId,
    destinationKind: 'market',
    currentUserAssets: deltaAssets < 0n ? -deltaAssets : 0n,
    deltaAssets,
    maxWithdrawAssets: deltaAssets < 0n ? -deltaAssets : 0n,
    minFinalAssets: 0n,
    amountAssets: deltaAssets > 0n ? deltaAssets : 0n,
    utilizationAfterWad: 0n,
    supplyAprAfterWad: 0n,
    supplyApyAfterWad: 0n,
  }
}

describe('Robinhood mainnet integration', () => {
  test('a discovered chain can be selected for RPC reads and linked to the right apps', () => {
    expect(configuredWagmiChainIds.has(CHAIN_ID)).toBe(true)
    expect(config.getClient({ chainId: CHAIN_ID }).chain.id).toBe(CHAIN_ID)
    const chainName = getSupportedChainName(CHAIN_ID)
    expect(morphoAppMarketUrl(chainName, MARKET_A)).toBe(`https://app.morpho.org/robinhood-chain/market/${MARKET_A}`)
    expect(getExplorerTransactionUrl(CHAIN_ID, '0xabcd')).toBe('https://robinhoodchain.blockscout.com/tx/0xabcd')
  })

  test('new deposits sign Permit2 for Robinhood and its adapter', () => {
    const result = buildOptimizerBundle({
      chainId: CHAIN_ID,
      userAddress: USER,
      marketParamsById: new Map([[MARKET_A, PARAMS]]),
      positions: [position(MARKET_A, 5_000_000n)],
      loanToken: PARAMS.loanToken,
      nowSec: 1_800_000_000n,
      permit2Allowance: { amount: 0n, expiration: 0n, nonce: 3n },
    })

    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.permit2ToSign?.typedData.domain.chainId).toBe(CHAIN_ID)
    expect(result.permit2ToSign?.typedData.domain.verifyingContract).toBe(PERMIT2_ADDRESS)
    expect(result.permit2ToSign?.typedData.message.spender).toBe(ADAPTER)
    expect(result.permit2ToSign?.depositNeededAssets).toBe(5_000_000n)
  })

  test('rebalance bundles withdraw before supplying through the Robinhood adapter', () => {
    const result = buildOptimizerBundle({
      chainId: CHAIN_ID,
      userAddress: USER,
      marketParamsById: new Map([[MARKET_A, PARAMS], [MARKET_B, PARAMS]]),
      positions: [position(MARKET_A, -5_000_000n), position(MARKET_B, 5_000_000n)],
      nowSec: 1_800_000_000n,
    })

    expect(result.ok).toBe(true)
    if (!result.ok)
      throw new Error(result.error)
    expect(result.bundler3).toBe(BUNDLER3)
    expect(result.bundle).toHaveLength(2)
    expect(result.bundle.every(call => call.to === ADAPTER)).toBe(true)
    expect(result.bundle.map(call => decodeFunctionData({ abi: GENERAL_ADAPTER1_ABI, data: call.data }).functionName)).toEqual(['morphoWithdraw', 'morphoSupply'])
    expect(result.permit2ToSign).toBeUndefined()
    expect(result.summary.depositNeededAssets).toBe(0n)
  })
})
