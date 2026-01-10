import type { Address, Hex } from 'viem'
import type { Bundler3Call, MorphoMarketParams } from '~/lib/bundler3/types'
import type { OptimizedPositionDelta } from '~/lib/optimizer/supply-optimizer'
import { getBundler3Config, PERMIT2_ADDRESS } from '~/lib/bundler3/addresses'
import {
  encodeGeneralAdapterMorphoSupply,
  encodeGeneralAdapterMorphoWithdraw,
  encodeGeneralAdapterPermit2TransferFrom,
  encodePermit2PermitCall,
} from '~/lib/bundler3/encode'
import { buildPermit2PermitSingleTypedData, toUint48Clamp, toUint160Clamp } from '~/lib/bundler3/permit2'

export interface BuildOptimizerBundleInputs {
  chainId: number
  userAddress: Address
  /**
   * Full market params required for Morpho actions, keyed by `marketId.toLowerCase()`.
   * Obtainable onchain via Morpho `idToMarketParams(marketId)`.
   */
  marketParamsById: Map<string, MorphoMarketParams>
  /** Optimizer output (already in raw loan-token asset units). */
  positions: OptimizedPositionDelta[]
  /**
   * If present, include Permit2 permit+transfer to pull `depositNeededAssets` from the wallet.
   * Note: the token must already be approved to Permit2 (ERC20 allowance).
   */
  loanToken?: Address
  nowSec: bigint
  permit2Allowance?: { amount: bigint, expiration: bigint, nonce: bigint }
  permit2Signature?: Hex
}

export interface BuildOptimizerBundleResultOk {
  ok: true
  bundler3: Address
  generalAdapter1: Address
  permit2: Address
  bundle: Bundler3Call[]
  summary: {
    marketsTouched: number
    withdrawTotalAssets: bigint
    supplyTotalAssets: bigint
    depositNeededAssets: bigint
  }
  /**
   * If set, caller must request a Permit2 signature (and then rebuild with `permit2Signature`).
   * We also return the typed data to sign.
   */
  permit2ToSign?: {
    depositNeededAssets: bigint
    typedData: ReturnType<typeof buildPermit2PermitSingleTypedData>
  }
}

export interface BuildOptimizerBundleResultErr {
  ok: false
  error: string
}

export type BuildOptimizerBundleResult = BuildOptimizerBundleResultOk | BuildOptimizerBundleResultErr

function idKey(id: string): string {
  return id.toLowerCase()
}

export function buildOptimizerBundle(inputs: BuildOptimizerBundleInputs): BuildOptimizerBundleResult {
  const cfg = getBundler3Config(inputs.chainId)
  if (!cfg)
    return { ok: false, error: `Bundler3 not configured for chainId ${inputs.chainId}` }

  const adapter = cfg.generalAdapter1 as Address
  const permit2 = PERMIT2_ADDRESS as Address

  // Only act on non-zero deltas.
  const actionable = inputs.positions.filter(p => p.deltaAssets !== 0n)
  if (actionable.length === 0)
    return { ok: false, error: 'Nothing to execute (all deltas are 0).' }

  // Liquidity safety: don’t attempt to withdraw more than optimizer says is withdrawable.
  for (const p of actionable) {
    if (p.deltaAssets < 0n) {
      const abs = -p.deltaAssets
      if (abs > p.maxWithdrawAssets)
        return { ok: false, error: 'At least one withdraw exceeds available liquidity. Re-run optimize or increase minimum move size.' }
    }
  }

  let withdrawTotal = 0n
  let supplyTotal = 0n
  for (const p of actionable) {
    if (p.deltaAssets < 0n)
      withdrawTotal += -p.deltaAssets
    else
      supplyTotal += p.deltaAssets
  }

  const depositNeeded = supplyTotal > withdrawTotal ? (supplyTotal - withdrawTotal) : 0n

  const bundle: Bundler3Call[] = []

  // Optional: Permit2 deposit (only if depositNeeded > 0).
  if (depositNeeded > 0n) {
    if (!inputs.loanToken)
      return { ok: false, error: 'Missing loan token address for Permit2 deposit.' }
    if (!inputs.permit2Allowance)
      return { ok: false, error: 'Permit2 allowance not loaded yet.' }

    const amount160 = toUint160Clamp(depositNeeded)
    const expiration48 = toUint48Clamp(inputs.nowSec + 60n * 60n * 24n * 30n) // 30d
    const nonce48 = toUint48Clamp(inputs.permit2Allowance.nonce)
    const sigDeadline = inputs.nowSec + 60n * 20n // 20m

    const hasAllowance = (inputs.permit2Allowance.amount >= depositNeeded)
      && (inputs.permit2Allowance.expiration === 0n || inputs.permit2Allowance.expiration > inputs.nowSec)

    if (!hasAllowance) {
      const typedData = buildPermit2PermitSingleTypedData({
        chainId: inputs.chainId,
        permit2,
        owner: inputs.userAddress,
        permitSingle: {
          details: {
            token: inputs.loanToken,
            amount: amount160,
            expiration: expiration48,
            nonce: nonce48,
          },
          spender: adapter,
          sigDeadline,
        },
      })

      // If signature not provided, stop here and ask caller to sign, then rebuild.
      if (!inputs.permit2Signature) {
        return {
          ok: true,
          bundler3: cfg.bundler3 as Address,
          generalAdapter1: adapter,
          permit2,
          bundle: [],
          summary: {
            marketsTouched: actionable.length,
            withdrawTotalAssets: withdrawTotal,
            supplyTotalAssets: supplyTotal,
            depositNeededAssets: depositNeeded,
          },
          permit2ToSign: { depositNeededAssets: depositNeeded, typedData },
        }
      }

      bundle.push(encodePermit2PermitCall({
        permit2,
        owner: inputs.userAddress,
        token: inputs.loanToken,
        spender: adapter,
        amount: amount160,
        expiration: Number(expiration48),
        nonce: Number(nonce48),
        sigDeadline,
        signature: inputs.permit2Signature,
      }))
    }

    // Pull exactly what is needed into the adapter (avoid trapping unallocated deposit).
    bundle.push(encodeGeneralAdapterPermit2TransferFrom({
      adapter,
      token: inputs.loanToken,
      receiver: adapter,
      amount: depositNeeded,
    }))
  }

  // Withdraws to adapter (so it can re-supply).
  for (const p of actionable) {
    if (p.deltaAssets >= 0n)
      continue
    const params = inputs.marketParamsById.get(idKey(p.marketId))
    if (!params)
      return { ok: false, error: `Missing marketParams for withdraw market ${p.marketId}` }
    bundle.push(encodeGeneralAdapterMorphoWithdraw({
      adapter,
      marketParams: params,
      assets: -p.deltaAssets,
      receiver: adapter,
    }))
  }

  // Supplies from adapter to the user’s position.
  for (const p of actionable) {
    if (p.deltaAssets <= 0n)
      continue
    const params = inputs.marketParamsById.get(idKey(p.marketId))
    if (!params)
      return { ok: false, error: `Missing marketParams for supply market ${p.marketId}` }
    bundle.push(encodeGeneralAdapterMorphoSupply({
      adapter,
      marketParams: params,
      assets: p.deltaAssets,
      onBehalf: inputs.userAddress,
    }))
  }

  return {
    ok: true,
    bundler3: cfg.bundler3 as Address,
    generalAdapter1: adapter,
    permit2,
    bundle,
    summary: {
      marketsTouched: actionable.length,
      withdrawTotalAssets: withdrawTotal,
      supplyTotalAssets: supplyTotal,
      depositNeededAssets: depositNeeded,
    },
  }
}
