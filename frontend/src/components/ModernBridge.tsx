import React, { useState, useEffect } from 'react'
import { 
  useAccount, 
  useBalance, 
  useChainId, 
  useSwitchChain, 
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract
} from 'wagmi'
import { parseUnits, formatUnits, isAddress } from 'viem'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { NETWORKS, ERC20_ABI, ESCROW_FACTORY_ABI, RESOLVER_ADDRESS } from '@/config/contracts'
import { 
  ArrowRightLeft, 
  Wallet, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle, 
  AlertTriangle,
  Copy,
  Zap,
  Settings,
  Clock,
  DollarSign,
  ChevronDown
} from 'lucide-react'

type NetworkKey = 'sepolia' | 'celo' | 'monad' | 'etherlink'

const NETWORK_LOGOS = {
  sepolia: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22none%22%3E%3Cpath%20fill%3D%22%2325292E%22%20fill-rule%3D%22evenodd%22%20d%3D%22M14%2028a14%2014%200%201%200%200-28%2014%2014%200%200%200%200%2028Z%22%20clip-rule%3D%22evenodd%22%2F%3E%3Cpath%20fill%3D%22url(%23a)%22%20fill-opacity%3D%22.3%22%20fill-rule%3D%22evenodd%22%20d%3D%22M14%2028a14%2014%200%201%200%200-28%2014%2014%200%200%200%200%2028Z%22%20clip-rule%3D%22evenodd%22%2F%3E%3Cpath%20fill%3D%22url(%23b)%22%20d%3D%22M8.19%2014.77%2014%2018.21l5.8-3.44-5.8%208.19-5.81-8.19Z%22%2F%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22m14%2016.93-5.81-3.44L14%204.34l5.81%209.15L14%2016.93Z%22%2F%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22a%22%20x1%3D%220%22%20x2%3D%2214%22%20y1%3D%220%22%20y2%3D%2228%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fff%22%20stop-opacity%3D%220%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%2214%22%20x2%3D%2214%22%20y1%3D%2214.77%22%20y2%3D%2222.96%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fff%22%20stop-opacity%3D%22.9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3C%2Fsvg%3E%0A",
  celo: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22none%22%3E%3Ccircle%20cx%3D%2214%22%20cy%3D%2214%22%20r%3D%2214%22%20fill%3D%22%23FCFF52%22%2F%3E%3Cpath%20d%3D%22M21%207H7v14h14v-4.887h-2.325a5.126%205.126%200%200%201-4.664%203.023c-2.844%200-5.147-2.325-5.147-5.147-.003-2.822%202.303-5.125%205.147-5.125%202.102%200%203.904%201.28%204.704%203.104H21V7Z%22%20fill%3D%22%23000%22%2F%3E%3C%2Fsvg%3E",
  monad: "https://img.notionusercontent.com/s3/prod-files-secure%2F8b536fe4-3bbf-45fc-b661-190b80c94bea%2F23726c6b-16c2-430e-92d7-c144a7a6719b%2FMonad_Logo_-_Default_-_Logo_Mark.svg/size/?exp=1754236333&sig=PrJz3P774ATUTnQ2P9zIIytQ5txVKJL7xjFN8WqGidY&id=16863675-94f2-80f6-9f47-f3ec0de0ddcf&table=block",
  etherlink: "https://ethglobal.b-cdn.net/organizations/ky7kr/square-logo/default.png"
}

interface SwapData {
  fromNetwork: NetworkKey
  toNetwork: NetworkKey
  amount: string
  destinationAddress: string
}

interface TransactionState {
  hash?: `0x${string}`
  isLoading: boolean
  isSuccess: boolean
  error?: string
}

interface BridgeState {
  isLoading: boolean
  isSuccess: boolean
  error?: string
  showOverlay: boolean
}

export function ModernBridge() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: writeContractData, isPending: isWritePending, error: writeError } = useWriteContract()

  // State Management
  const [swapData, setSwapData] = useState<SwapData>({
    fromNetwork: 'sepolia',
    toNetwork: 'celo',
    amount: '',
    destinationAddress: ''
  })
  
  const [txState, setTxState] = useState<TransactionState>({
    isLoading: false,
    isSuccess: false
  })
  
  const [bridgeState, setBridgeState] = useState<BridgeState>({
    isLoading: false,
    isSuccess: false,
    showOverlay: false
  })
  
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [slippage, setSlippage] = useState('0.5')
  const [gasPrice, setGasPrice] = useState('standard')

  // Get token balances for all networks
  const { data: sepoliaBalance, refetch: refetchSepoliaBalance } = useBalance({
    address,
    token: NETWORKS.sepolia.usdc as `0x${string}`,
    chainId: NETWORKS.sepolia.chainId,
  })

  const { data: celoBalance, refetch: refetchCeloBalance } = useBalance({
    address,
    token: NETWORKS.celo.usdc as `0x${string}`,
    chainId: NETWORKS.celo.chainId,
  })

  const { data: monadBalance, refetch: refetchMonadBalance } = useBalance({
    address,
    token: NETWORKS.monad.usdc as `0x${string}`,
    chainId: NETWORKS.monad.chainId,
  })

  const { data: etherlinkBalance, refetch: refetchEtherlinkBalance } = useBalance({
    address,
    token: NETWORKS.etherlink.usdc as `0x${string}`,
    chainId: NETWORKS.etherlink.chainId,
  })

  const { data: sepoliaNative } = useBalance({
    address,
    chainId: NETWORKS.sepolia.chainId,
  })

  const { data: celoNative } = useBalance({
    address,
    chainId: NETWORKS.celo.chainId,
  })

  const { data: monadNative } = useBalance({
    address,
    chainId: NETWORKS.monad.chainId,
  })

  const { data: etherlinkNative } = useBalance({
    address,
    chainId: NETWORKS.etherlink.chainId,
  })

  // Get allowances
  const { data: sepoliaAllowance, refetch: refetchSepoliaAllowance } = useReadContract({
    address: NETWORKS.sepolia.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, NETWORKS.sepolia.resolver as `0x${string}`] : undefined,
    chainId: NETWORKS.sepolia.chainId,
  })

  const { data: celoAllowance, refetch: refetchCeloAllowance } = useReadContract({
    address: NETWORKS.celo.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, NETWORKS.celo.resolver as `0x${string}`] : undefined,
    chainId: NETWORKS.celo.chainId,
  })

  const { data: monadAllowance, refetch: refetchMonadAllowance } = useReadContract({
    address: NETWORKS.monad.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, NETWORKS.monad.resolver as `0x${string}`] : undefined,
    chainId: NETWORKS.monad.chainId,
  })

  const { data: etherlinkAllowance, refetch: refetchEtherlinkAllowance } = useReadContract({
    address: NETWORKS.etherlink.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, NETWORKS.etherlink.resolver as `0x${string}`] : undefined,
    chainId: NETWORKS.etherlink.chainId,
  })

  // Transaction receipt tracking
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txState.hash,
  })

  useEffect(() => {
    if (isTxSuccess) {
      setTxState(prev => ({ ...prev, isSuccess: true, isLoading: false }))
      // Refresh balances and allowances
      refetchSepoliaBalance()
      refetchCeloBalance()
      refetchMonadBalance()
      refetchEtherlinkBalance()
      refetchSepoliaAllowance()
      refetchCeloAllowance()
      refetchMonadAllowance()
      refetchEtherlinkAllowance()
    }
  }, [isTxSuccess, refetchSepoliaBalance, refetchCeloBalance, refetchMonadBalance, refetchEtherlinkBalance, refetchSepoliaAllowance, refetchCeloAllowance, refetchMonadAllowance, refetchEtherlinkAllowance])

  // Handle writeContract data (transaction hash)
  useEffect(() => {
    if (writeContractData) {
      setTxState(prev => ({ 
        ...prev, 
        hash: writeContractData,
        isLoading: true,
        isSuccess: false 
      }))
    }
  }, [writeContractData])

  // Handle writeContract errors
  useEffect(() => {
    if (writeError) {
      console.error('Write contract error:', writeError)
      setTxState(prev => ({ 
        ...prev, 
        isLoading: false, 
        isSuccess: false, 
        error: writeError.message || 'Transaction failed' 
      }))
    }
  }, [writeError])

  const getCurrentNetwork = (): NetworkKey | null => {
    const network = Object.entries(NETWORKS).find(([_, config]) => config.chainId === chainId)
    return network ? network[0] as NetworkKey : null
  }

  const currentNetwork = getCurrentNetwork()
  const isNetworkSupported = currentNetwork !== null

  const getBalance = (network: NetworkKey) => {
    switch (network) {
      case 'sepolia': return sepoliaBalance
      case 'celo': return celoBalance
      case 'monad': return monadBalance
      case 'etherlink': return etherlinkBalance
      default: return null
    }
  }

  const getNativeBalance = (network: NetworkKey) => {
    switch (network) {
      case 'sepolia': return sepoliaNative
      case 'celo': return celoNative
      case 'monad': return monadNative
      case 'etherlink': return etherlinkNative
      default: return null
    }
  }

  const getAllowance = (network: NetworkKey) => {
    switch (network) {
      case 'sepolia': return sepoliaAllowance
      case 'celo': return celoAllowance
      case 'monad': return monadAllowance
      case 'etherlink': return etherlinkAllowance
      default: return null
    }
  }

  const formatBalance = (balance: any) => {
    if (!balance) return '0.00'
    return parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4)
  }

  const needsApproval = () => {
    if (!swapData.amount || !address) return false
    const allowance = getAllowance(swapData.fromNetwork)
    const amountWei = parseUnits(swapData.amount, 6)
    return !allowance || (allowance as bigint) < amountWei
  }

  const isValidAmount = () => {
    if (!swapData.amount || parseFloat(swapData.amount) <= 0) return false
    const balance = getBalance(swapData.fromNetwork)
    if (!balance) return false
    const amountWei = parseUnits(swapData.amount, 6)
    return balance.value >= amountWei
  }

  const isValidDestination = () => {
    return swapData.destinationAddress === '' || isAddress(swapData.destinationAddress)
  }

  const handleSwapNetworks = () => {
    setSwapData(prev => ({
      ...prev,
      fromNetwork: prev.toNetwork,
      toNetwork: prev.fromNetwork,
    }))
  }

  const handleMaxAmount = () => {
    const balance = getBalance(swapData.fromNetwork)
    if (balance) {
      const formatted = formatUnits(balance.value, balance.decimals)
      setSwapData(prev => ({ ...prev, amount: formatted }))
    }
  }

  const handleApprove = async () => {
    if (!address || !isNetworkSupported) return

    // Switch to source network if needed
    const sourceChainId = NETWORKS[swapData.fromNetwork].chainId
    if (chainId !== sourceChainId) {
      await switchChain({ chainId: sourceChainId })
      return
    }

    // Clear any previous error
    setTxState({ isLoading: false, isSuccess: false, error: undefined })
    
    writeContract({
      address: NETWORKS[swapData.fromNetwork].usdc as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [
        NETWORKS[swapData.fromNetwork].resolver as `0x${string}`,
        parseUnits(swapData.amount, 6)
      ],
    })
  }

  const handleBridge = async () => {
    if (!address || !isNetworkSupported) return

    // Switch to source network if needed
    const sourceChainId = NETWORKS[swapData.fromNetwork].chainId
    if (chainId !== sourceChainId) {
      await switchChain({ chainId: sourceChainId })
      return
    }

    try {
      // Set bridge loading state and show overlay
      setBridgeState({ 
        isLoading: true, 
        isSuccess: false, 
        error: undefined, 
        showOverlay: true 
      })
      
      // Create the cross-chain intent
      const destinationAddress = swapData.destinationAddress || address
      const amount = parseUnits(swapData.amount, 6)
      
      // Generate unique order hash
      const orderHash = `0x${Date.now().toString(16).padStart(64, '0')}` as `0x${string}`
      
      // Generate hash lock (secret hash for HTLC)
      const secret = `0x${crypto.getRandomValues(new Uint8Array(32)).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')}` as `0x${string}`
      const hashLock = `0x${await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))}` as `0x${string}`
      
      // Time locks (24 hours for withdrawal, 48 hours for cancellation)
      const timeLocks = Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
      
      console.log('Creating cross-chain intent:', {
        orderHash,
        fromNetwork: swapData.fromNetwork,
        toNetwork: swapData.toNetwork,
        amount: swapData.amount,
        destinationAddress,
        hashLock: hashLock.slice(0, 10) + '...',
        timeLocks
      })

      // Call resolver API directly - resolver will handle the token transfer
      console.log('Creating cross-chain intent via resolver API')
      
      const response = await fetch('http://localhost:3001/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromNetwork: swapData.fromNetwork,
          toNetwork: swapData.toNetwork,
          fromToken: 'USDC',
          toToken: 'USDC',
          amount: swapData.amount,
          userAddress: address,
          destinationAddress
        })
      })

      const result = await response.json()
      
      if (result.success) {
        console.log('✅ Bridge successful:', result)
        setBridgeState({ 
          isLoading: false,
          isSuccess: true,
          error: undefined,
          showOverlay: true
        })
        
      } else {
        console.error('❌ Bridge failed:', result)
        setBridgeState({ 
          isLoading: false,
          isSuccess: false,
          error: `Bridge error: ${result.error}`,
          showOverlay: true
        })
      }

      // Store the secret for later use (in a real app, this would be handled securely)
      console.log('Secret for this bridge (save this):', secret)
      
    } catch (error: any) {
      console.error('Bridge error:', error)
      setBridgeState({ 
        isLoading: false, 
        isSuccess: false, 
        error: error.message || 'Bridge failed',
        showOverlay: true
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const callResolverAPI = async (intentData: any) => {
    try {
      console.log('🔄 Calling resolver API with intent:', intentData)
      
      const response = await fetch('http://localhost:3001/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromNetwork: intentData.fromNetwork,
          toNetwork: intentData.toNetwork,
          fromToken: 'USDC',
          toToken: 'USDC',
          amount: intentData.amount,
          userAddress: intentData.userAddress,
          destinationAddress: intentData.destinationAddress
        })
      })

      const result = await response.json()
      
      if (result.success) {
        console.log('✅ Resolver API call successful:', result)
        setTxState(prev => ({ 
          ...prev, 
          isSuccess: true, 
          hash: result.orderHash,
          error: undefined 
        }))
      } else {
        console.error('❌ Resolver API call failed:', result)
        setTxState(prev => ({ 
          ...prev, 
          error: `Resolver error: ${result.error}` 
        }))
      }
    } catch (error) {
      console.error('❌ Failed to call resolver API:', error)
      setTxState(prev => ({ 
        ...prev, 
        error: `Failed to notify resolver: ${error.message}` 
      }))
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Card className="bg-white border border-gray-200 shadow-xl">
        <CardHeader className="text-center pb-4">
          <CardTitle className="flex items-center justify-center space-x-2 text-2xl">
            <Zap className="h-7 w-7 text-black" />
            <span className="text-black">
              Cross-Chain Bridge
            </span>
          </CardTitle>
          <CardDescription className="text-gray-600">
            Powered by 1inch Fusion+ • Atomic Swaps • HTLC Security
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Connection Alert */}
          {!isConnected && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Connect your wallet to start bridging tokens
              </AlertDescription>
            </Alert>
          )}

          {isConnected && !isNetworkSupported && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Switch to Ethereum Sepolia or Celo Alfajores to continue
              </AlertDescription>
            </Alert>
          )}

          {/* Success Message - Only show for approval success, not bridge success */}
          {txState.isSuccess && !bridgeState.isLoading && !bridgeState.showOverlay && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                ✅ Approval successful! You can now bridge your tokens.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {txState.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{txState.error}</AlertDescription>
            </Alert>
          )}

          {/* Network Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Bridge Route</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-gray-600 dark:text-gray-400"
              >
                <Settings className="h-4 w-4 mr-1" />
                Advanced
              </Button>
            </div>

            {/* From and To Networks Side by Side */}
            <div className="grid grid-cols-5 gap-4 items-center">
              {/* From Network */}
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium text-gray-700">From</label>
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={swapData.fromNetwork}
                      onChange={(e) => setSwapData(prev => ({ ...prev, fromNetwork: e.target.value as NetworkKey }))}
                      className="w-full p-3 pl-12 pr-10 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-black focus:border-black appearance-none cursor-pointer"
                      disabled={txState.isLoading}
                    >
                      <option value="sepolia">Ethereum Sepolia</option>
                      <option value="celo">Celo Alfajores</option>
                      <option value="monad">Monad Testnet</option>
                      <option value="etherlink">Etherlink Testnet</option>
                    </select>
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <img 
                        src={NETWORK_LOGOS[swapData.fromNetwork]} 
                        alt={NETWORKS[swapData.fromNetwork].name}
                        className="w-6 h-6 rounded-full"
                        onError={(e) => {
                          // Fallback for broken images
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Swap Arrow */}
              <div className="col-span-1 flex justify-center">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full border-2 hover:rotate-180 transition-all duration-300"
                  onClick={handleSwapNetworks}
                  disabled={txState.isLoading}
                >
                  <ArrowRightLeft className="h-5 w-5" />
                </Button>
              </div>

              {/* To Network */}
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium text-gray-700">To</label>
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={swapData.toNetwork}
                      onChange={(e) => setSwapData(prev => ({ ...prev, toNetwork: e.target.value as NetworkKey }))}
                      className="w-full p-3 pl-12 pr-10 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-black focus:border-black appearance-none cursor-pointer"
                      disabled={txState.isLoading}
                    >
                      <option value="sepolia">Ethereum Sepolia</option>
                      <option value="celo">Celo Alfajores</option>
                      <option value="monad">Monad Testnet</option>
                      <option value="etherlink">Etherlink Testnet</option>
                    </select>
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <img 
                        src={NETWORK_LOGOS[swapData.toNetwork]} 
                        alt={NETWORKS[swapData.toNetwork].name}
                        className="w-6 h-6 rounded-full"
                        onError={(e) => {
                          // Fallback for broken images
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Amount</label>
              {isConnected && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMaxAmount}
                  className="text-black hover:text-gray-700 text-xs h-6 px-2"
                  disabled={txState.isLoading}
                >
                  MAX
                </Button>
              )}
            </div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-gray-500" />
                <span className="font-semibold text-gray-700">USDC</span>
              </div>
              <Input
                type="number"
                placeholder="0.0"
                value={swapData.amount}
                onChange={(e) => setSwapData(prev => ({ ...prev, amount: e.target.value }))}
                className="pl-20 pr-4 h-14 text-xl font-semibold text-right"
                disabled={txState.isLoading}
              />
            </div>
            {swapData.amount && !isValidAmount() && (
              <p className="text-sm text-red-500">Insufficient balance</p>
            )}
          </div>

          {/* Destination Address */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Destination Address (Optional)
              </label>
              {address && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSwapData(prev => ({ ...prev, destinationAddress: address }))}
                  className="text-black hover:text-gray-700 text-xs h-6 px-2"
                  disabled={txState.isLoading}
                >
                  Use My Address
                </Button>
              )}
            </div>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="0x... (leave empty to use your address)"
                value={swapData.destinationAddress}
                onChange={(e) => setSwapData(prev => ({ ...prev, destinationAddress: e.target.value }))}
                className="pl-10"
                disabled={txState.isLoading}
              />
            </div>
            {swapData.destinationAddress && !isValidDestination() && (
              <p className="text-sm text-red-500">Invalid address format</p>
            )}
          </div>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-700">Advanced Settings</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-600">Slippage</label>
                  <Input
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    placeholder="0.5"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-600">Gas Price</label>
                  <select
                    value={gasPrice}
                    onChange={(e) => setGasPrice(e.target.value)}
                    className="w-full p-2 border rounded-md text-sm"
                  >
                    <option value="slow">Slow</option>
                    <option value="standard">Standard</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Bridge Summary */}
          {swapData.amount && parseFloat(swapData.amount) > 0 && isValidAmount() && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-black mb-3">Bridge Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">Amount to bridge:</span>
                  <span className="font-medium">{swapData.amount} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Bridge fee:</span>
                  <span>~0.1%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Estimated time:</span>
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    2-5 minutes
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">You will receive:</span>
                  <span className="font-medium">≈{(parseFloat(swapData.amount) * 0.999).toFixed(4)} USDC</span>
                </div>
              </div>
            </div>
          )}


          {/* Action Buttons */}
          <div className="space-y-3">
            {!isConnected ? (
              <div className="text-center text-gray-500">
                Connect your wallet to continue
              </div>
            ) : needsApproval() ? (
              <Button
                className="w-full bg-black text-white hover:bg-gray-800"
                size="xl"
                onClick={handleApprove}
                disabled={!isValidAmount() || !isValidDestination() || isWritePending || isTxPending}
              >
                {isWritePending ? 'Confirming...' : isTxPending ? 'Approving...' : `Approve ${swapData.amount || '0'} USDC`}
              </Button>
            ) : (
              <Button
                className="w-full bg-black text-white hover:bg-gray-800"
                size="xl"
                onClick={handleBridge}
                disabled={!isValidAmount() || !isValidDestination() || isWritePending || isTxPending || bridgeState.isLoading}
              >
                {isWritePending ? 'Confirming...' : isTxPending ? 'Bridging...' : bridgeState.isLoading ? 'Processing...' : `Bridge ${swapData.amount || '0'} USDC`}
              </Button>
            )}

          </div>

          {/* Security Features */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
            <div className="text-center">
              <div className="h-8 w-8 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-black" />
              </div>
              <div className="text-xs font-medium text-gray-700">Atomic</div>
              <div className="text-xs text-gray-500">Guaranteed execution</div>
            </div>
            <div className="text-center">
              <div className="h-8 w-8 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                <Zap className="h-5 w-5 text-black" />
              </div>
              <div className="text-xs font-medium text-gray-700">Fast</div>
              <div className="text-xs text-gray-500">2-5 minutes</div>
            </div>
            <div className="text-center">
              <div className="h-8 w-8 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-black" />
              </div>
              <div className="text-xs font-medium text-gray-700">Secure</div>
              <div className="text-xs text-gray-500">HTLC protected</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bridge Overlay Popup */}
      {bridgeState.showOverlay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center relative">
            {/* Close button */}
            <button
              onClick={() => {
                setBridgeState({ isLoading: false, isSuccess: false, showOverlay: false, error: undefined })
                setSwapData(prev => ({ ...prev, amount: '', destinationAddress: '' }))
                setTxState({ isLoading: false, isSuccess: false })
                window.location.reload()
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              ×
            </button>

            {bridgeState.isLoading && (
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto">
                  <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Processing Bridge</h3>
                <p className="text-gray-600">Your tokens are being transferred cross-chain...</p>
              </div>
            )}

            {bridgeState.isSuccess && (
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-green-900">Bridge Successful!</h3>
                <p className="text-gray-600">Your tokens have been successfully transferred to {NETWORKS[swapData.toNetwork].name}</p>
                <p className="text-sm text-gray-500">You should see the tokens in your destination wallet within a few minutes.</p>
              </div>
            )}

            {bridgeState.error && (
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-10 h-10 text-red-600" />
                </div>
                <h3 className="text-xl font-semibold text-red-900">Bridge Failed</h3>
                <p className="text-gray-600">{bridgeState.error}</p>
                <p className="text-sm text-gray-500">Please try again or contact support if the issue persists.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}