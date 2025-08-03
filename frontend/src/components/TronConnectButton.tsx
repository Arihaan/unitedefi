import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTronLink } from '@/hooks/useTronLink'
import { Wallet, ExternalLink, LogOut } from 'lucide-react'

export function TronConnectButton() {
  const { 
    isConnected, 
    account, 
    balance, 
    connect, 
    disconnect, 
    isLoading, 
    error, 
    isTronLinkAvailable 
  } = useTronLink()

  // If TronLink is not available, show install message
  if (!isTronLinkAvailable) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open('https://www.tronlink.org/', '_blank')}
        className="border-orange-200 text-orange-700 hover:bg-orange-50"
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        Install TronLink
      </Button>
    )
  }

  // If connected, show account info
  if (isConnected && account) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors" onClick={disconnect}>
        <div className="h-2 w-2 bg-orange-500 rounded-full"></div>
        <div className="flex flex-col">
          <span className="text-xs font-medium text-orange-900">
            {account.address.base58.slice(0, 6)}...{account.address.base58.slice(-4)}
          </span>
          {balance && (
            <span className="text-xs text-orange-700">
              {balance.balance.toFixed(2)} TRX
            </span>
          )}
        </div>
      </div>
    )
  }

  // If not connected, show connect button
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={connect}
      disabled={isLoading}
      className="border-orange-200 text-orange-700 hover:bg-orange-50"
    >
      <Wallet className="h-4 w-4 mr-2" />
      {isLoading ? 'Connecting...' : 'Connect Tron'}
    </Button>
  )
}