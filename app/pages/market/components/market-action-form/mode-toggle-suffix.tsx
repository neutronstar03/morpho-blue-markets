interface ModeToggleSuffixProps {
  mode: 'percent' | 'asset'
  assetSymbol: string
  onPercentClick: () => void
  onAssetClick: () => void
}

export function ModeToggleSuffix({
  mode,
  assetSymbol,
  onPercentClick,
  onAssetClick,
}: ModeToggleSuffixProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onPercentClick}
        className={`px-1.5 py-0.5 rounded border border-white/10 text-xs ${mode === 'percent' ? 'bg-white/10 text-gray-100' : 'text-gray-300 hover:bg-white/10'}`}
        aria-label="Switch to percentage"
      >
        %
      </button>
      <button
        type="button"
        onClick={onAssetClick}
        className={`px-1.5 py-0.5 rounded border border-white/10 text-xs ${mode === 'asset' ? 'bg-white/10 text-gray-100' : 'text-gray-300 hover:bg-white/10'}`}
        aria-label={`Switch to ${assetSymbol} amount`}
      >
        {assetSymbol}
      </button>
    </span>
  )
}
