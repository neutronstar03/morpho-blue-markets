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
    <div className="flex items-start justify-between gap-3 border-b border-gray-700/50 py-2 last:border-b-0">
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

export function MarketCollateralReview({ market }: MarketCollateralReviewProps) {
  const { data: review } = useCollateralReview(
    market.morphoBlue.chain.id,
    market.collateralAsset.address,
  )

  if (!review)
    return null

  return (
    <>
      <h3 className="text-lg font-semibold text-white mt-6 mb-2 border-b-2 border-blue-500 pb-1">
        Collateral Review
      </h3>

      {review.type && (
        <DetailRow
          label="Type"
          value={<Badge variant="neutral">{review.type}</Badge>}
        />
      )}

      {(review.protocol || review.protocolUrl) && (
        <DetailRow
          label="Protocol"
          value={review.protocolUrl
            ? (
                <a
                  href={review.protocolUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline break-all"
                >
                  {review.protocol ?? review.protocolUrl}
                </a>
              )
            : (review.protocol ?? '—')}
        />
      )}

      {review.rank != null && (
        <DetailRow
          label="Rank"
          value={renderRankBadge(review.rank)}
        />
      )}

      {review.redeem && (
        <DetailRow
          label="Redeem"
          value={<span className="text-sm font-normal text-gray-300 whitespace-normal break-words">{review.redeem}</span>}
        />
      )}

      {review.notes && (
        <DetailRow
          label="Notes"
          value={<span className="block pl-3 text-sm font-normal text-gray-400 whitespace-normal break-words">{review.notes}</span>}
        />
      )}

      {review.sources.length > 0 && (
        <DetailRow
          label="Sources"
          value={(
            <div className="flex flex-col items-end gap-1">
              {review.sources.map(source => (
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
          )}
        />
      )}
    </>
  )
}
