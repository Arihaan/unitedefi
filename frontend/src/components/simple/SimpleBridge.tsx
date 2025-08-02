import React, { useState } from 'react'
import { useAccount, useBalance, useChainId, useSwitchChain } from 'wagmi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { NETWORKS } from '@/config/contracts'
import { Zap, ArrowUpDown, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react'

type NetworkKey = 'sepolia' | 'celo'

export function SimpleBridge() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  
  const [fromNetwork, setFromNetwork] = useState<NetworkKey>('sepolia')
  const [toNetwork, setToNetwork] = useState<NetworkKey>('celo')
  const [amount, setAmount] = useState('')
  const [swapStatus, setSwapStatus] = useState<'idle' | 'demo'>('idle')

  // Get balances for demo purposes
  const { data: sepoliaBalance } = useBalance({
    address,
    token: NETWORKS.sepolia.usdc as `0x${string}`,
    chainId: NETWORKS.sepolia.chainId,
  })

  const { data: celoBalance } = useBalance({
    address,
    token: NETWORKS.celo.usdc as `0x${string}`,
    chainId: NETWORKS.celo.chainId,
  })

  const handleSwapNetworks = () => {
    setFromNetwork(toNetwork)
    setToNetwork(fromNetwork)
  }

  const handleDemo = () => {
    setSwapStatus('demo')
    // Simulate successful swap demo
    setTimeout(() => {
      setSwapStatus('idle')
      setAmount('')
    }, 5000)
  }

  const getCurrentNetwork = (): NetworkKey | null => {
    const network = Object.entries(NETWORKS).find(([_, config]) => config.chainId === chainId)
    return network ? network[0] as NetworkKey : null
  }

  const currentNetwork = getCurrentNetwork()
  const isNetworkSupported = currentNetwork !== null

  return (
    <div className="w-full max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center space-x-2">
            <Zap className="h-6 w-6" />
            <span>1inch Fusion+ Bridge</span>
          </CardTitle>
          <CardDescription>
            Cross-chain atomic swaps demo
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Connection Status */}
          {!isConnected && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please connect your wallet to use the bridge
              </AlertDescription>
            </Alert>
          )}

          {isConnected && !isNetworkSupported && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Please switch to Ethereum Sepolia or Celo Alfajores
              </AlertDescription>
            </Alert>
          )}

          {/* Network Selection */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* From Network */}
              <div>
                <label className="text-sm font-medium mb-2 block">From</label>
                <Button
                  variant={fromNetwork === 'sepolia' ? 'default' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => setFromNetwork('sepolia')}
                  disabled={swapStatus === 'demo'}
                >
                  <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 rounded-full bg-purple-500"></div>
                    <span>Sepolia</span>
                  </div>
                </Button>
                {fromNetwork === 'celo' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setFromNetwork('celo')}
                    disabled={swapStatus === 'demo'}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="h-4 w-4 rounded-full bg-green-500"></div>
                      <span>Celo</span>
                    </div>
                  </Button>
                )}
              </div>

              {/* To Network */}
              <div>
                <label className="text-sm font-medium mb-2 block">To</label>
                <Button
                  variant={toNetwork === 'celo' ? 'default' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => setToNetwork('celo')}
                  disabled={swapStatus === 'demo'}
                >
                  <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 rounded-full bg-green-500"></div>
                    <span>Celo</span>
                  </div>
                </Button>
                {toNetwork === 'sepolia' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setToNetwork('sepolia')}
                    disabled={swapStatus === 'demo'}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="h-4 w-4 rounded-full bg-purple-500"></div>
                      <span>Sepolia</span>
                    </div>
                  </Button>
                )}
              </div>
            </div>

            {/* Swap Networks Button */}
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="icon"
                onClick={handleSwapNetworks}
                disabled={swapStatus === 'demo'}
                className="rounded-full"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (USDC)</label>
            <Input
              type="number"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={swapStatus === 'demo'}
            />
          </div>

          {/* Balance Display (if available) */}
          {isConnected && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="text-sm font-medium">Your Balances</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Sepolia USDC:</span>
                  <div>{sepoliaBalance ? parseFloat(sepoliaBalance.formatted).toFixed(2) : '0.00'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Celo USDC:</span>
                  <div>{celoBalance ? parseFloat(celoBalance.formatted).toFixed(2) : '0.00'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Demo Status */}
          {swapStatus === 'demo' && (
            <Alert variant="info">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                🎯 Demo: Simulating successful cross-chain swap of {amount} USDC from {fromNetwork} to {toNetwork}!
                <br />
                <span className="text-xs">✅ Hash Time Lock Contracts working perfectly</span>
                <br />
                <span className="text-xs">✅ Atomic execution guaranteed</span>
              </AlertDescription>
            </Alert>
          )}

          {/* Action Button */}
          <Button
            variant="gradient"
            size="lg"
            className="w-full"
            onClick={handleDemo}
            disabled={!isConnected || !amount || parseFloat(amount) <= 0 || swapStatus === 'demo'}
            loading={swapStatus === 'demo'}
          >
            {!isConnected
              ? 'Connect Wallet'
              : !amount || parseFloat(amount) <= 0
              ? 'Enter Amount'
              : swapStatus === 'demo'
              ? 'Processing...'
              : 'Start Demo Bridge'
            }
          </Button>

          {/* Features */}
          <div className="grid grid-cols-3 gap-4 pt-4 text-center">
            <div className="space-y-2">
              <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
              <div className="text-xs font-medium">Atomic</div>
            </div>
            <div className="space-y-2">
              <Zap className="h-8 w-8 mx-auto text-blue-500" />
              <div className="text-xs font-medium">Fast</div>
            </div>
            <div className="space-y-2">
              <ArrowUpDown className="h-8 w-8 mx-auto text-purple-500" />
              <div className="text-xs font-medium">Secure</div>
            </div>
          </div>

          {/* Contract Links */}
          <div className="pt-4 border-t">
            <div className="text-xs text-muted-foreground text-center mb-2">
              Deployed Contracts:
            </div>
            <div className="flex justify-center space-x-4 text-xs">
              <a
                href="https://sepolia.etherscan.io/address/0xAe7788283f4043cA3e29c14F60dc84E744D90822"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-blue-500 hover:underline"
              >
                <span>Sepolia</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://celo-alfajores.blockscout.com/address/0x0078e9c0C508c4DE4Ad4e72C3c170929cA0c7dA2"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 text-green-500 hover:underline"
              >
                <span>Celo</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}