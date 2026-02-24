import type { SupplyOptimizerProgress, SupplyOptimizerRunArgs, SupplyOptimizerRunResult } from './supply-optimizer-runner'

export type SupplyOptimizerWorkerRunArgs = Omit<SupplyOptimizerRunArgs, 'onProgress'>

export interface SupplyOptimizerWorkerRequest {
  type: 'run'
  runId: number
  args: SupplyOptimizerWorkerRunArgs
}

export interface SupplyOptimizerWorkerProgressResponse {
  type: 'progress'
  runId: number
  progress: SupplyOptimizerProgress
}

export interface SupplyOptimizerWorkerDoneResponse {
  type: 'done'
  runId: number
  result: SupplyOptimizerRunResult
}

export interface SupplyOptimizerWorkerErrorResponse {
  type: 'error'
  runId: number
  error: string
}

export type SupplyOptimizerWorkerResponse
  = SupplyOptimizerWorkerProgressResponse
    | SupplyOptimizerWorkerDoneResponse
    | SupplyOptimizerWorkerErrorResponse
