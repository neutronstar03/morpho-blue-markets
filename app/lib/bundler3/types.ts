export interface Bundler3Call {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  skipRevert: boolean
  callbackHash: `0x${string}`
}

export interface MorphoMarketParams {
  loanToken: `0x${string}`
  collateralToken: `0x${string}`
  oracle: `0x${string}`
  irm: `0x${string}`
  lltv: bigint
}
