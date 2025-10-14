import { parseUnits } from 'viem'

export function tokenAmountToWei(amount: string, decimals: number) {
  return parseUnits(amount, decimals)
}
