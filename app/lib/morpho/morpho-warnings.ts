export interface MorphoWarning {
  type: string
  level?: 'YELLOW' | 'RED' | string
}

export function isOracleMisconfiguredWarning(
  warnings: MorphoWarning[] | undefined,
) {
  return (warnings ?? []).some((w) => {
    const normalized = String(w.type || '').toLowerCase()
    return normalized.includes('incorrect_oracle_configuration')
  })
}
