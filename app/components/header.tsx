import type { ReactNode } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { getSupportedChainName } from '~/lib/addresses'
import { useNetworkContext } from '~/lib/contexts/network'
import { useForceMagicVisual } from '~/lib/hooks/use-force-magic-visual'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import { cn } from '~/lib/utils'
import { Button } from './ui/button'
import { Container } from './ui/container'

export function Header({ children }: { children: ReactNode }) {
  const { requiredChainId } = useNetworkContext()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const isScanning = useHomeMagicOptimizerStore(state => state.isScanning)
  const isMagicForced = useForceMagicVisual()
  const showMagicVisual = isScanning || isMagicForced

  const isWrongNetwork
    = isConnected && requiredChainId && chainId !== requiredChainId
  return (
    <header className={cn('bg-gray-800 shadow-lg border-b border-gray-700', showMagicVisual && 'magic-header-bg')}>
      <Container>
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            {children}
          </div>
          <div className="flex items-center gap-4">
            {isWrongNetwork && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => switchChain({ chainId: requiredChainId })}
                  className="border-purple-600 text-purple-500 hover:bg-purple-700 hover:text-white"
                >
                  <span className="hidden sm:inline">
                    Switch to
                    {' '}
                    {getSupportedChainName(requiredChainId)}
                  </span>
                  <span className="sm:hidden">
                    Switch Network
                  </span>
                </Button>
              </div>
            )}
            <ConnectButton accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }} />
          </div>
        </div>
      </Container>
    </header>
  )
}
