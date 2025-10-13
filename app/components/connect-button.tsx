import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Button } from './ui/button'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-300 font-mono">
          {`${address.slice(0, 6)}...${address.slice(-4)}`}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => disconnect()}
          className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          Disconnect
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <Button
          key={connector.uid}
          variant="outline"
          size="sm"
          onClick={() => connect({ connector })}
          disabled={isPending}
          className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50"
        >
          {isPending ? 'Connecting...' : `Connect ${connector.name}`}
        </Button>
      ))}
    </div>
  )
}
