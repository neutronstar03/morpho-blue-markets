import type { ReactNode } from 'react'

export function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="text-lg font-semibold text-white mt-4 mb-2 border-b-2 border-blue-500 pb-1">
      {title}
    </h3>
  )
}

export function SubGroupTitle({ title }: { title: string }) {
  return (
    <h4 className="text-sm font-semibold text-white uppercase tracking-wide border-b border-gray-500/40 pb-1">
      {title}
    </h4>
  )
}

export function SubGroupContent({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 mt-2 mb-1">
      {children}
    </div>
  )
}

export function DetailRow({
  label,
  value,
  subValue,
  noBorder = false,
}: {
  label: ReactNode
  value: ReactNode
  subValue?: ReactNode
  noBorder?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${noBorder ? '' : 'border-b border-gray-700/50 last:border-b-0'}`}>
      <span className="text-gray-400 text-sm">{label}</span>
      <div className="text-right">
        <span className="text-white font-medium text-sm">{value}</span>
        {subValue && <div className="text-xs text-gray-500">{subValue}</div>}
      </div>
    </div>
  )
}
