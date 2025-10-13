import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useSupply, useTokenApproval, useTransactionStatus, useTokenBalance, formatTokenBalance, MORPHO_BLUE_ADDRESSES } from '../lib/hooks/use-morpho'
import type { MarketParams } from '../lib/hooks/use-morpho'
import { Button } from './ui/button'

interface DepositFormProps {
  marketParams: MarketParams
  loanTokenSymbol: string
  onSuccess?: () => void
}

export function DepositForm({ marketParams, loanTokenSymbol, onSuccess }: DepositFormProps) {
  const [amount, setAmount] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  const { address } = useAccount()

  const { supply, hash: supplyHash, isPending: isSupplying, error: supplyError } = useSupply(marketParams, amount)
  const { needsApproval, approve, hash: approveHash, isPending: isApprovingToken, error: approveError } = useTokenApproval(
    marketParams.loanToken,
    MORPHO_BLUE_ADDRESSES.mainnet,
    amount,
    address
  )

  const { data: tokenBalance } = useTokenBalance(marketParams.loanToken, address)
  const formattedBalance = formatTokenBalance(tokenBalance, marketParams.loanToken)

  const { isSuccess: isSupplySuccess, isLoading: isSupplyLoading } = useTransactionStatus(supplyHash)
  const { isSuccess: isApproveSuccess, isLoading: isApproveLoading } = useTransactionStatus(approveHash)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || !address) return

    try {
      if (needsApproval) {
        setIsApproving(true)
        approve()
      } else {
        supply()
      }
    } catch (error) {
      console.error('Transaction failed:', error)
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow numbers and decimals
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const isLoading = isSupplying || isApprovingToken || isSupplyLoading || isApproveLoading
  const hasError = supplyError || approveError
  const isSuccess = isSupplySuccess || isApproveSuccess

  if (isSuccess) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-green-800">
              {isSupplySuccess ? 'Deposit successful!' : 'Approval successful!'}
            </p>
          </div>
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={onSuccess}
                className="inline-flex bg-green-50 rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-50 focus:ring-green-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="deposit-amount" className="block text-sm font-medium text-gray-700 mb-2">
          Amount to Deposit ({loanTokenSymbol})
        </label>
        <input
          type="text"
          id="deposit-amount"
          value={amount}
          onChange={handleAmountChange}
          placeholder="0.0"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {address && (
          <div className="text-sm text-gray-600 mt-1">
            Wallet balance: <span className="font-medium">{formattedBalance} {loanTokenSymbol}</span>
          </div>
        )}
      </div>

      {needsApproval && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            You need to approve the token spending first. This transaction will allow Morpho Blue to use your {loanTokenSymbol}.
          </p>
        </div>
      )}

      {hasError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">
            {supplyError?.message || approveError?.message || 'Transaction failed'}
          </p>
        </div>
      )}

      <Button
        type="submit"
        disabled={!amount || isLoading || !address}
        className="w-full"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {isApproving ? 'Approving...' : 'Depositing...'}
          </>
        ) : needsApproval ? (
          `Approve ${loanTokenSymbol}`
        ) : (
          `Deposit ${amount || '0'} ${loanTokenSymbol}`
        )}
      </Button>

      {!address && (
        <p className="text-sm text-gray-500 text-center">
          Connect your wallet to deposit
        </p>
      )}
    </form>
  )
}
