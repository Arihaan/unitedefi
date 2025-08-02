import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useChainId } from 'wagmi'
import { ModernBridge } from '@/components/ModernBridge'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { NETWORKS } from '@/config/contracts'
import { 
  Zap, 
  Github, 
  Twitter, 
  Globe, 
  Activity, 
  AlertTriangle,
  ExternalLink,
  Shield,
  Clock,
  ArrowRightLeft
} from 'lucide-react'

function App() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()

  const isNetworkSupported = () => {
    return Object.values(NETWORKS).some(network => network.chainId === chainId)
  }

  const getCurrentNetwork = () => {
    const network = Object.entries(NETWORKS).find(([_, config]) => config.chainId === chainId)
    return network ? network[1] : null
  }

  const currentNetwork = getCurrentNetwork()

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-black">
                1inch Fusion+ Bridge
              </h1>
              <p className="text-xs text-gray-600">Cross-chain atomic swaps</p>
            </div>
          </div>

          {/* Connect Button Only */}
          <ConnectButton />
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 bg-black rounded-2xl flex items-center justify-center">
              <ArrowRightLeft className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4 text-black">
            Cross-Chain Bridge
          </h1>
          <p className="text-xl text-gray-600 mb-6 max-w-2xl mx-auto">
            Bridge tokens seamlessly between multiple testnets with atomic swaps powered by 1inch Fusion+ technology
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Badge variant="outline" className="text-sm border-gray-300 bg-gray-50">
              ⚛️ Atomic Execution
            </Badge>
            <Badge variant="outline" className="text-sm border-gray-300 bg-gray-50">
              🔒 HTLC Security
            </Badge>
            <Badge variant="outline" className="text-sm border-gray-300 bg-gray-50">
              ⚡ Lightning Fast
            </Badge>
          </div>
        </div>

        {/* Network Warning */}
        {isConnected && !isNetworkSupported() && (
          <div className="max-w-2xl mx-auto mb-8">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You're connected to an unsupported network. Please switch to Ethereum Sepolia, Celo Alfajores, Monad Testnet, or Etherlink Testnet to use the bridge.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Main Bridge Interface */}
        <div className="flex justify-center mb-16">
          <ModernBridge />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="text-center md:text-left mb-4 md:mb-0">
              <div className="text-sm text-gray-600 mb-1">
                Built for ETHGlobal hackathon using 1inch Fusion+ technology
              </div>
              <div className="text-xs text-gray-500">
                Atomic cross-chain swaps • HTLC security • Professional resolvers
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="border-gray-300 bg-gray-50">
                🏆 ETHGlobal Submission
              </Badge>
              <div className="flex items-center space-x-2 text-gray-400">
                <Globe className="h-4 w-4" />
                <Github className="h-4 w-4" />
                <Twitter className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App