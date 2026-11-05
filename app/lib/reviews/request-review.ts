const REPOSITORY = 'https://github.com/neutronstar03/morpho-collateral-reviews'

export function collateralReviewRequest(chainId: number, address: string, marketId: string) {
  const collateralAddress = address.toLowerCase()
  const key = `${chainId}:${collateralAddress}`
  const artifact = `v1/chain/${chainId}/${collateralAddress}.json`
  const body = [
    'Research and publish the evidence AND effective binary classification.',
    `Deduplication key: ${key}`,
    `chainId: ${chainId}`,
    `collateralAddress: ${collateralAddress}`,
    `Market: https://mbm.ns03.dev/market/${marketId}/${chainId}`,
    `Artifact: ${artifact}`,
    `Prompt: ${REPOSITORY}/blob/main/docs/collateral-profile-researcher-prompt.md`,
    'Positive research -> whitelist; every other completed review -> blacklist with reason.',
    'Verify exact token identity, sources, exit route and actual MBM consumption before closing.',
    'Preserve stronger exclusions; rank and transport errors are not decisions.',
    'Check the chain/address deduplication key for an existing issue before submitting.',
  ].join('\n\n')
  return {
    existing: `${REPOSITORY}/issues?q=${encodeURIComponent(`is:issue is:open "${collateralAddress}" "${chainId}"`)}`,
    create: `${REPOSITORY}/issues/new?${new URLSearchParams({ title: `Review collateral: ${key}`, body })}`,
  }
}

// Called only on explicit user activation; this reads issues and never creates one.
export async function resolveReviewRequest(chainId: number, address: string, marketId: string, signal?: AbortSignal) {
  const key = `${chainId}:${address.toLowerCase()}`
  const query = `repo:neutronstar03/morpho-collateral-reviews is:issue "${address.toLowerCase()}"`
  const response = await fetch(`https://api.github.com/search/issues?${new URLSearchParams({ q: query, per_page: '100' })}`, { signal })
  if (!response.ok)
    throw new Error('Could not check existing review requests. Retry or check the issue list.')
  const raw: unknown = await response.json()
  if (!raw || typeof raw !== 'object' || !('items' in raw) || !Array.isArray(raw.items)
    || !('total_count' in raw) || typeof raw.total_count !== 'number' || raw.total_count > raw.items.length
    || ('incomplete_results' in raw && raw.incomplete_results === true)) {
    throw new Error('Incomplete review request lookup. Check the issue list before opening a new request.')
  }
  for (const item of raw.items) {
    if (!item || typeof item !== 'object' || typeof item.html_url !== 'string'
      || !/^https:\/\/github\.com\/neutronstar03\/morpho-collateral-reviews\/issues\/\d+$/.test(item.html_url)) {
      throw new Error('Invalid review request lookup')
    }
    const body = typeof item.body === 'string' ? item.body.toLowerCase() : ''
    const title = typeof item.title === 'string' ? item.title.toLowerCase() : ''
    if (body.includes(`deduplication key: ${key}`)
      || title.includes(key)
      || (body.includes(address.toLowerCase()) && new RegExp(`chainid:\\s*${chainId}(?![0-9])`).test(body))) {
      return item.html_url
    }
  }
  return collateralReviewRequest(chainId, address, marketId).create
}
