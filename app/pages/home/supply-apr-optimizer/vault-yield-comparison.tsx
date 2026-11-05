import { useId, useState } from 'react'
import { Button } from '~/components/ui/button'
import { useMarketAprByVaults } from '~/lib/hooks/graphql/use-market-apr-by-vaults'

interface Props {
  chainId: number
  chainName: string
  assetAddress?: string
  assetSymbol?: string
}
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 })

export function VaultYieldComparison(props: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section aria-label="Vault yield comparison" className="rounded-md border border-gray-700 p-3 space-y-3">
      <Button type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        {open ? 'Hide vault yields' : 'Compare vault yields'}
      </Button>
      {open && <div id={id}><VaultYieldResults key={`${props.chainId}:${props.assetAddress ?? ''}`} {...props} /></div>}
    </section>
  )
}

function VaultYieldResults({ chainId, chainName, assetAddress, assetSymbol }: Props) {
  const query = useMarketAprByVaults([chainId], { minNetApy: 0, minLiquidityUsd: 50_000 })
  const vaults = (query.data?.eligibleVaults ?? [])
    .filter(vault => vault.chain.id === chainId && (!assetAddress || vault.asset.address.toLowerCase() === assetAddress.toLowerCase()))
    .sort((a, b) => (b.avgNetApy ?? 0) - (a.avgNetApy ?? 0) || a.address.localeCompare(b.address))
  return (
    <div className="space-y-2 text-sm">
      <p>
        {chainName}
        {assetAddress ? ` · ${assetSymbol ?? assetAddress}` : ' · All eligible assets'}
        {' · Listed vaults with at least $50,000 liquidity and non-negative average net APY.'}
      </p>
      <p className="text-gray-400">Average net APY is a comparison reference. It does not change the optimizer's Market APR.</p>
      <p role="status" aria-live="polite">
        {query.isPlaceholderData ? 'Cached vault data; refreshing live data.' : query.isError ? 'Live vault data unavailable.' : query.isFetching ? 'Loading live vault data…' : query.data ? 'Live vault data loaded.' : ''}
      </p>
      {query.isError && (
        <div role="alert">
          <p>
            Live vault data could not be refreshed.
            {query.data ? ' Previously loaded data may be stale.' : ''}
          </p>
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>Retry live vault data</Button>
        </div>
      )}
      {query.data && vaults.length === 0 && <p>{`No matching eligible vaults in the ${query.isPlaceholderData ? 'cached' : 'loaded'} data.`}</p>}
      {vaults.length > 0 && (
        <div role="region" aria-label="Vault yield table, scroll for more vaults" tabIndex={0} className="overflow-auto max-h-80 rounded border border-gray-700">
          <table className="w-full text-left">
            <caption className="sr-only">{`Vault yield comparison for ${chainName}${assetSymbol ? ` and ${assetSymbol}` : ''}`}</caption>
            <thead>
              <tr>
                <th className="p-2">Vault</th>
                <th className="p-2">Asset</th>
                <th className="p-2 whitespace-nowrap">Average net APY</th>
                <th className="p-2">Liquidity</th>
              </tr>
            </thead>
            <tbody>
              {vaults.map(vault => (
                <tr key={`${vault.version}:${vault.address}`}>
                  <td className="p-2">
                    <span>{vault.name}</span>
                    <code className="block text-xs text-gray-400" title={vault.address}>
                      {vault.address.slice(0, 8)}
                      …
                      {vault.address.slice(-4)}
                      {' '}
                      ·
                      {' '}
                      {vault.version}
                    </code>
                  </td>
                  <td className="p-2">{vault.asset.symbol}</td>
                  <td className="p-2">{vault.avgNetApy === null ? 'Unavailable' : percent.format(vault.avgNetApy)}</td>
                  <td className="p-2 whitespace-nowrap">{vault.liquidityUsd === null ? 'Unavailable' : usd.format(vault.liquidityUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
