import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { Badge } from '~/components/ui/badge'
import { useCollateralReview } from '~/lib/hooks/use-collateral-review'

interface MarketCollateralReviewProps {
  market: SingleMorphoMarket
}

function DetailRow({
  label,
  value,
}: {
  label: React.ReactNode
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-700/50 py-1.5 last:border-b-0">
      <span className="pt-0.5 text-gray-400 text-sm">{label}</span>
      <div className="min-w-0 max-w-[82%] text-right text-white font-normal">{value}</div>
    </div>
  )
}

function renderRankBadge(rank?: number | null) {
  if (rank == null || !Number.isFinite(rank))
    return '—'

  const variant = rank >= 4 ? 'success' : rank >= 3 ? 'warning' : 'danger'
  return (
    <Badge variant={variant}>
      {rank}
      {' '}
      / 5
    </Badge>
  )
}

function SourceLinks({ sources }: { sources: { label: string, url: string }[] }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {sources.map(source => (
        <a
          key={`${source.label}:${source.url}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-normal text-blue-400 hover:text-blue-300 underline break-all"
        >
          {source.label}
        </a>
      ))}
    </div>
  )
}

export function MarketCollateralReview({ market }: MarketCollateralReviewProps) {
  const { data: review } = useCollateralReview(
    market.morphoBlue.chain.id,
    market.collateralAsset.address,
    market.oracleAddress,
  )
  const collateralReview = review?.collateralReview
  const oracleReview = review?.oracleReview

  if (!collateralReview && !oracleReview)
    return null

  return (
    <>
      {collateralReview && (
        <>
          <h3 className="text-lg font-semibold text-white mt-4 mb-1.5 border-b-2 border-blue-500 pb-1">
            Collateral Review
          </h3>

          {collateralReview.type && (
            <DetailRow
              label="Type"
              value={<Badge variant="neutral">{collateralReview.type}</Badge>}
            />
          )}

          {(collateralReview.protocol || collateralReview.protocolUrl) && (
            <DetailRow
              label="Protocol"
              value={collateralReview.protocolUrl
                ? (
                    <a
                      href={collateralReview.protocolUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline break-all"
                    >
                      {collateralReview.protocol ?? collateralReview.protocolUrl}
                    </a>
                  )
                : (collateralReview.protocol ?? '—')}
            />
          )}

          {collateralReview.rank != null && (
            <DetailRow
              label="Rank"
              value={renderRankBadge(collateralReview.rank)}
            />
          )}

          {collateralReview.redeem && (
            <DetailRow
              label="Redeem"
              value={<span className="text-sm font-normal text-gray-300 whitespace-normal break-words">{collateralReview.redeem}</span>}
            />
          )}

          {collateralReview.notes && (
            <DetailRow
              label="Notes"
              value={<span className="block pl-3 text-sm font-normal text-gray-400 whitespace-normal break-words">{collateralReview.notes}</span>}
            />
          )}

          {collateralReview.sources.length > 0 && (
            <DetailRow
              label="Sources"
              value={<SourceLinks sources={collateralReview.sources} />}
            />
          )}
        </>
      )}

      {oracleReview && (
        <>
          <h3 className="text-lg font-semibold text-white mt-4 mb-1.5 border-b-2 border-blue-500 pb-1">
            Oracle Review
          </h3>

          {oracleReview.type && (
            <DetailRow
              label="Type"
              value={<Badge variant="neutral">{oracleReview.type}</Badge>}
            />
          )}

          {oracleReview.provider && (
            <DetailRow
              label="Provider"
              value={oracleReview.provider}
            />
          )}

          {oracleReview.rank != null && (
            <DetailRow
              label="Rank"
              value={renderRankBadge(oracleReview.rank)}
            />
          )}

          {oracleReview.pricing && (
            <DetailRow
              label="Pricing"
              value={<span className="text-sm font-normal text-gray-300 whitespace-normal break-words">{oracleReview.pricing}</span>}
            />
          )}

          {oracleReview.notes && (
            <DetailRow
              label="Notes"
              value={<span className="block pl-3 text-sm font-normal text-gray-400 whitespace-normal break-words">{oracleReview.notes}</span>}
            />
          )}

          {oracleReview.sources.length > 0 && (
            <DetailRow
              label="Sources"
              value={<SourceLinks sources={oracleReview.sources} />}
            />
          )}
        </>
      )}
    </>
  )
}
