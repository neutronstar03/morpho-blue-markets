import type { ReactNode } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { X } from 'lucide-react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { getSupportedChainName } from '~/lib/addresses'
import { useNetworkContext } from '~/lib/contexts/network'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { useForceMagicVisual } from '~/lib/hooks/use-force-magic-visual'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import { cn } from '~/lib/utils'
import { Button } from './ui/button'
import { Container } from './ui/container'

export function Header({ children }: { children: ReactNode }) {
  const { requiredChainId } = useNetworkContext()
  const { viewingAddress, isViewingWallet, clearViewingWallet } = useViewingWallet()
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
            {isViewingWallet && viewingAddress && (
              <div className="flex items-center gap-2 rounded-lg border border-cyan-700 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-100">
                <span className="hidden sm:inline text-cyan-300">Viewing Wallet</span>
                <span className="font-mono text-xs">
                  {`${viewingAddress.slice(0, 6)}...${viewingAddress.slice(-4)}`}
                </span>
                <button
                  type="button"
                  onClick={clearViewingWallet}
                  className="rounded p-0.5 text-cyan-200 hover:bg-cyan-800/50 hover:text-white"
                  title="Stop viewing wallet"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <ConnectButton accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }} />
          </div>
        </div>
      </Container>
    </header>
  )
}
