export type TransactionFlowKind
  = | 'optimizer'
    | 'batchWithdraw'
    | 'deposit'
    | 'withdraw'
    | 'approval'
    | 'authorization'
    | 'permit2Sign'

export type TransactionFlowStatus
  = | 'idle'
    | 'awaiting_wallet'
    | 'signing'
    | 'submitted'
    | 'confirming'
    | 'success'
    | 'error'

export type TransactionStepStatus = 'pending' | 'active' | 'completed' | 'error'

export interface TransactionStep {
  key: string
  label: string
  status: TransactionStepStatus
}

export interface TransactionRecapFact {
  label: string
  value: string
}

export interface TransactionRecapItem {
  title: string
  subtitle?: string
  value?: string
  tone?: 'default' | 'green' | 'orange'
}

export interface TransactionSuccessPayload {
  title: string
  summary?: string
  txHash?: `0x${string}`
  chainId?: number
  facts?: TransactionRecapFact[]
  items?: TransactionRecapItem[]
  showModal?: boolean
}

export interface TransactionFlowState {
  id: string
  activeAttemptId: string
  kind: TransactionFlowKind
  status: TransactionFlowStatus
  title: string
  summary?: string
  txHash?: `0x${string}`
  chainId?: number
  errorMessage?: string
  steps: TransactionStep[]
  success?: TransactionSuccessPayload
}

export interface BeginTransactionFlowInput {
  kind: TransactionFlowKind
  title: string
  summary?: string
  chainId?: number
  steps?: Array<{ key: string, label: string }>
}

export interface TransactionFlowHandle {
  flowId: string
  attemptId: string
}

export interface ScopedTransactionUpdate {
  flowId: string
  attemptId: string
}
