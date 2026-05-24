// Shared card header with clickable title, custom actions, and collapse chevron — used by batch-withdraw and supply-optimizer cards.
import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

interface CollapsibleCardHeaderProps {
  title: string
  subtitle: string
  isExpanded: boolean
  onToggle: () => void
  actions?: ReactNode
}

export function CollapsibleCardHeader({
  title,
  subtitle,
  isExpanded,
  onToggle,
  actions,
}: CollapsibleCardHeaderProps) {
  return (
    <div className={cn('p-4 border-b border-gray-700 flex items-center justify-between gap-3', !isExpanded && 'min-h-20')}>
      <button
        type="button"
        className="flex flex-col items-start text-left cursor-pointer group"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
      >
        <h2 className="text-xl font-bold text-white group-hover:opacity-90 transition-opacity">{title}</h2>
        <p className={cn('text-sm text-gray-400', !isExpanded && 'hidden')}>
          {subtitle}
        </p>
      </button>

      <div className="flex items-center gap-2">
        {actions}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggle}
          className="h-8 w-8 px-0"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? `Collapse ${title}` : `Expand ${title}`}
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
