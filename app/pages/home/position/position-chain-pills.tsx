import type { ChainPositionPillItem } from './position-types'

function ChainPill({
  item,
  isActive,
  isSwitching,
  onClick,
}: {
  item: ChainPositionPillItem
  isActive: boolean
  isSwitching: boolean
  onClick: () => void
}) {
  const Icon = item.Icon

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSwitching || isActive}
      className={[
        'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-xs transition-colors',
        isActive
          ? 'border-gray-500 bg-gray-700 text-white'
          : 'border-gray-700 bg-gray-900/70 text-gray-200 hover:border-gray-600 hover:bg-gray-800',
        isSwitching ? 'cursor-wait opacity-70' : '',
      ].join(' ')}
    >
      <span className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-transparent">
        {Icon
          ? <Icon size={16} variant="branded" className="h-4 w-4" />
          : <span className="text-[9px] font-semibold text-white">{item.label.slice(0, 1)}</span>}
      </span>
      <span>{item.label}</span>
      {item.count > 1 && <span className="text-gray-400">{item.count}</span>}
    </button>
  )
}

export function PositionChainPills({
  items,
  currentChainId,
  isSwitching,
  onSelectChain,
}: {
  items: ChainPositionPillItem[]
  currentChainId?: number
  isSwitching: boolean
  onSelectChain: (chainId: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
      {items.map(item => (
        <ChainPill
          key={item.chainId}
          item={item}
          isActive={item.chainId === currentChainId}
          isSwitching={isSwitching}
          onClick={() => onSelectChain(item.chainId)}
        />
      ))}
    </div>
  )
}
