import { describe, expect, test } from 'bun:test'
import { buildOptimizerBundle } from '../../app/lib/bundler3/optimizer-bundle'

function mkParams(): any {
  return {
    loanToken: '0x0000000000000000000000000000000000000001',
    collateralToken: '0x0000000000000000000000000000000000000002',
    oracle: '0x0000000000000000000000000000000000000003',
    irm: '0x0000000000000000000000000000000000000004',
    lltv: 1n,
  } as const
}

describe('Bundler3 optimizer bundle builder', () => {
  test('deposit-needed: returns Permit2 typedData when signature missing, then builds ordered bundle', () => {
    const chainId = 1
    const user = '0x00000000000000000000000000000000000000aa' as const
    const marketA = '0x1111111111111111111111111111111111111111111111111111111111111111' as const
    const marketB = '0x2222222222222222222222222222222222222222222222222222222222222222' as const

    const marketParamsById = new Map<string, any>([
      [marketA.toLowerCase(), mkParams()],
      [marketB.toLowerCase(), mkParams()],
    ])

    const positions = [
      { marketId: marketA, deltaAssets: -10n, maxWithdrawAssets: 10n },
      { marketId: marketB, deltaAssets: 15n, maxWithdrawAssets: 0n },
    ] as any

    const nowSec = 1_700_000_000n

    const first = buildOptimizerBundle({
      chainId,
      userAddress: user,
      marketParamsById,
      positions,
      loanToken: '0x00000000000000000000000000000000000000bb',
      nowSec,
      permit2Allowance: { amount: 0n, expiration: 0n, nonce: 1n },
    })

    expect(first.ok).toBe(true)
    if (!first.ok)
      return
    expect(first.summary.depositNeededAssets).toBe(5n)
    expect(first.permit2ToSign).toBeTruthy()
    expect(first.bundle.length).toBe(0)

    const second = buildOptimizerBundle({
      chainId,
      userAddress: user,
      marketParamsById,
      positions,
      loanToken: '0x00000000000000000000000000000000000000bb',
      nowSec,
      permit2Allowance: { amount: 0n, expiration: 0n, nonce: 1n },
      permit2Signature: '0x1234' as any,
    })

    expect(second.ok).toBe(true)
    if (!second.ok)
      return
    // permit2.permit + adapter.permit2TransferFrom + withdraw + supply
    expect(second.bundle.length).toBe(4)
  })

  test('rebalance-only: does not require Permit2', () => {
    const chainId = 1
    const user = '0x00000000000000000000000000000000000000aa' as const
    const marketA = '0x1111111111111111111111111111111111111111111111111111111111111111' as const
    const marketB = '0x2222222222222222222222222222222222222222222222222222222222222222' as const

    const marketParamsById = new Map<string, any>([
      [marketA.toLowerCase(), mkParams()],
      [marketB.toLowerCase(), mkParams()],
    ])

    const positions = [
      { marketId: marketA, deltaAssets: -10n, maxWithdrawAssets: 10n },
      { marketId: marketB, deltaAssets: 10n, maxWithdrawAssets: 0n },
    ] as any

    const res = buildOptimizerBundle({
      chainId,
      userAddress: user,
      marketParamsById,
      positions,
      nowSec: 1_700_000_000n,
    })

    expect(res.ok).toBe(true)
    if (!res.ok)
      return
    expect(res.summary.depositNeededAssets).toBe(0n)
    expect(res.permit2ToSign).toBeUndefined()
    expect(res.bundle.length).toBe(2)
  })
})
