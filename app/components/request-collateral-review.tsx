import { useState } from 'react'
import { collateralReviewRequest, resolveReviewRequest } from '~/lib/reviews/request-review'

export function RequestCollateralReview({ chainId, address, marketId }: { chainId: number, address: string, marketId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const links = collateralReviewRequest(chainId, address, marketId)
  return (
    <div className="mt-3 text-sm">
      <div className="flex flex-wrap gap-3">
        <a href={links.existing} target="_blank" rel="noopener noreferrer" className="underline">Check existing review requests</a>
        <a
          href={links.create}
          aria-disabled={busy}
          className="underline"
          onClick={async (event) => {
            event.preventDefault()
            if (busy)
              return
            setBusy(true)
            setError('')
            // Reserve a window during user activation, before the async lookup.
            const target = window.open('about:blank', '_blank')
            if (target)
              target.opener = null
            try {
              const url = await resolveReviewRequest(chainId, address, marketId, AbortSignal.timeout(15000))
              if (target)
                target.location.href = url
              else
                window.location.assign(url)
            }
            catch (cause) {
              target?.close()
              setError(cause instanceof Error ? cause.message : 'Review request lookup failed. Retry.')
            }
            finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Checking review requests…' : 'Request review'}
        </a>
      </div>
      {error && <p role="alert" className="mt-2">{error}</p>}
    </div>
  )
}
