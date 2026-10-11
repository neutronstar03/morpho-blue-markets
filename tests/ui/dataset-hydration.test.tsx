import type { DatasetMeta, DatasetMetaSource } from '../../app/lib/dataset-cache'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { useDatasetMeta } from '../../app/lib/dataset-cache'

it('hydrates the prerendered status before displaying browser-cached data', async () => {
  let current: DatasetMeta = {
    status: 'uninitialized',
    source: 'none',
    refreshing: false,
    observedAtMs: null,
    cachedAtMs: null,
    publishedAtMs: null,
    lastCheckedAtMs: null,
    freshnessMs: 1000,
    nextRetryAtMs: null,
    error: null,
  }
  const source: DatasetMetaSource = {
    subscribe: () => () => {},
    getVersion: () => current.status === 'uninitialized' ? 0 : 1,
    getMeta: () => current,
  }
  function Status() {
    const meta = useDatasetMeta(source)
    return <span>{`${meta.status}:${meta.source}`}</span>
  }
  const container = document.createElement('div')
  container.innerHTML = renderToString(<Status />)
  document.body.appendChild(container)
  current = { ...current, status: 'loaded', source: 'cache', observedAtMs: Date.now() }
  const onRecoverableError = vi.fn()
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    await act(async () => {
      root = hydrateRoot(container, <Status />, { onRecoverableError })
    })
    expect(container.textContent).toBe('loaded:cache')
    expect(onRecoverableError).not.toHaveBeenCalled()
  }
  finally {
    await act(async () => root?.unmount())
    container.remove()
  }
})
