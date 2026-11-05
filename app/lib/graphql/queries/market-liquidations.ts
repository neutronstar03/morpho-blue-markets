import { gql } from 'graphql-request'

export const GetMarketLiquidationCount = gql`
  query GetMarketLiquidationCount($uniqueKey: String!, $chainId: Int!) {
    transactions: marketTransactions(
      first: 1
      where: { marketUniqueKey_in: [$uniqueKey], chainId_in: [$chainId], type_in: [Liquidation] }
    ) {
      pageInfo { countTotal }
    }
  }
`

export function parseLiquidationCount(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || !('transactions' in raw))
    throw new Error('Invalid liquidation count response')
  const transactions = raw.transactions
  if (!transactions || typeof transactions !== 'object' || !('pageInfo' in transactions))
    throw new Error('Missing liquidation pageInfo')
  const page = transactions.pageInfo
  if (!page || typeof page !== 'object' || !('countTotal' in page)
    || typeof page.countTotal !== 'number' || !Number.isSafeInteger(page.countTotal) || page.countTotal < 0) {
    throw new Error('Invalid liquidation total')
  }
  return page.countTotal
}
