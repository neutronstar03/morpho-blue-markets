import { useLocation } from 'react-router-dom'
import { useHomeMagicOptimizerScan } from './hooks/use-home-magic-optimizer-scan'

function HomeScan() {
  useHomeMagicOptimizerScan()
  return null
}

// Unmount the query owner before its hooks run on detail routes. Shared dataset
// preload and header opportunity state have independent, global lifecycles.
export function HomeMagicOptimizerEffects() {
  const { pathname } = useLocation()
  return pathname === '/' ? <HomeScan /> : null
}
