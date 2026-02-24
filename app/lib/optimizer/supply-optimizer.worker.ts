/// <reference lib="webworker" />

import type { SupplyOptimizerProgress } from './supply-optimizer-runner'
import type { SupplyOptimizerWorkerRequest, SupplyOptimizerWorkerResponse } from './supply-optimizer-worker-types'
import { runSupplyOptimizer } from './supply-optimizer-runner'

const workerCtx = globalThis as unknown as DedicatedWorkerGlobalScope

const PROGRESS_INTERVAL_MS = 200
const MIN_PERCENT_DELTA = 2

let lastProgressAt = 0
let lastProgress: SupplyOptimizerProgress | undefined

function shouldSendProgress(progress: SupplyOptimizerProgress): boolean {
  const now = Date.now()
  if (!lastProgress)
    return true
  if (progress.phase !== lastProgress.phase)
    return true

  const prevPercent = lastProgress.percent
  const nextPercent = progress.percent
  if (prevPercent != null && nextPercent != null && Math.abs(nextPercent - prevPercent) >= MIN_PERCENT_DELTA)
    return true

  return (now - lastProgressAt) >= PROGRESS_INTERVAL_MS
}

function postProgress(runId: number, progress: SupplyOptimizerProgress) {
  if (!shouldSendProgress(progress))
    return
  lastProgressAt = Date.now()
  lastProgress = progress
  const message: SupplyOptimizerWorkerResponse = {
    type: 'progress',
    runId,
    progress,
  }
  workerCtx.postMessage(message)
}

workerCtx.onmessage = (event: MessageEvent<SupplyOptimizerWorkerRequest>) => {
  const message = event.data
  if (!message || message.type !== 'run')
    return

  const { runId, args } = message
  lastProgressAt = 0
  lastProgress = undefined

  try {
    const result = runSupplyOptimizer({
      ...args,
      onProgress: (progress) => {
        postProgress(runId, progress)
      },
    })

    const done: SupplyOptimizerWorkerResponse = {
      type: 'done',
      runId,
      result,
    }
    workerCtx.postMessage(done)
  }
  catch (error: any) {
    const fail: SupplyOptimizerWorkerResponse = {
      type: 'error',
      runId,
      error: error?.message ?? 'Optimizer failed',
    }
    workerCtx.postMessage(fail)
  }
}

export {}
