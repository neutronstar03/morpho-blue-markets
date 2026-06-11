import type { Route } from './+types/euler'
import { Link } from 'react-router-dom'
import { Header } from '~/components/header'
import { Main } from '~/components/ui/main'
import { EulerVaultExplorer } from '~/pages/euler/euler-vault-explorer'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Euler vaults | mbm' },
    { name: 'description', content: 'Euler vault explorer' },
  ]
}

export default function EulerPage() {
  return (
    <>
      <Header>
        <div className="flex items-baseline gap-3">
          <Link to="/" className="text-xl font-semibold text-white hover:text-blue-300">
            mbm
          </Link>
          <span className="text-sm text-gray-500">/</span>
          <h1 className="text-xl font-semibold text-white">Euler</h1>
        </div>
      </Header>

      <Main>
        <EulerVaultExplorer />
      </Main>
    </>
  )
}
