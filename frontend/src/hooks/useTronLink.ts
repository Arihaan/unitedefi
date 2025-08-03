import { useState, useEffect, useCallback } from 'react'

declare global {
  interface Window {
    tronLink?: {
      ready: boolean
      tronWeb?: any
      request: (args: { method: string }) => Promise<any>
    }
    tronWeb?: any
  }
}

interface TronAccount {
  address: {
    base58: string
    hex: string
  }
}

interface TronBalance {
  balance: number
  tokenBalance: number
}

export function useTronLink() {
  const [isConnected, setIsConnected] = useState(false)
  const [account, setAccount] = useState<TronAccount | null>(null)
  const [balance, setBalance] = useState<TronBalance | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if TronLink is available
  const isTronLinkAvailable = useCallback(() => {
    return typeof window !== 'undefined' && window.tronLink
  }, [])

  // Initialize TronLink connection
  const initializeTronLink = useCallback(async () => {
    if (!isTronLinkAvailable()) {
      setError('TronLink not found. Please install TronLink extension.')
      return false
    }

    try {
      // Wait for TronLink to be ready
      if (!window.tronLink?.ready) {
        await new Promise((resolve) => {
          const checkReady = () => {
            if (window.tronLink?.ready) {
              resolve(true)
            } else {
              setTimeout(checkReady, 100)
            }
          }
          checkReady()
        })
      }

      // Check if already connected
      if (window.tronWeb && window.tronWeb.defaultAddress?.base58) {
        const address = {
          base58: window.tronWeb.defaultAddress.base58,
          hex: window.tronWeb.defaultAddress.hex
        }
        setAccount({ address })
        setIsConnected(true)
        await updateBalance(address.base58)
        return true
      }

      return false
    } catch (err) {
      console.error('Error initializing TronLink:', err)
      setError('Failed to initialize TronLink')
      return false
    }
  }, [isTronLinkAvailable])

  // Connect to TronLink wallet
  const connect = useCallback(async () => {
    if (!isTronLinkAvailable()) {
      setError('TronLink not found. Please install TronLink extension.')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      // Request account access
      await window.tronLink?.request({ method: 'tron_requestAccounts' })

      // Check if connection was successful
      if (window.tronWeb && window.tronWeb.defaultAddress?.base58) {
        const address = {
          base58: window.tronWeb.defaultAddress.base58,
          hex: window.tronWeb.defaultAddress.hex
        }
        setAccount({ address })
        setIsConnected(true)
        await updateBalance(address.base58)
        setIsLoading(false)
        return true
      } else {
        throw new Error('Failed to connect to TronLink')
      }
    } catch (err: any) {
      console.error('TronLink connection error:', err)
      setError(err.message || 'Failed to connect to TronLink')
      setIsLoading(false)
      return false
    }
  }, [isTronLinkAvailable])

  // Update balance
  const updateBalance = useCallback(async (address: string) => {
    if (!window.tronWeb || !address) return

    try {
      // Get TRX balance
      const trxBalance = await window.tronWeb.trx.getBalance(address)
      const trxFormatted = window.tronWeb.fromSun(trxBalance)

      // Get USDC balance (if contract is available)
      let usdcBalance = 0
      try {
        const usdcContract = await window.tronWeb.contract().at('TLcrNFz7x433NsqFrJFc3aixZGLUsC6brA')
        const balance = await usdcContract.balanceOf(address).call()
        usdcBalance = window.tronWeb.fromSun(balance) / 1e6 // USDC has 6 decimals
      } catch (err) {
        console.warn('Could not fetch USDC balance:', err)
      }

      setBalance({
        balance: parseFloat(trxFormatted),
        tokenBalance: usdcBalance
      })
    } catch (err) {
      console.error('Error updating balance:', err)
    }
  }, [])

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setAccount(null)
    setBalance(null)
    setIsConnected(false)
    setError(null)
  }, [])

  // Send USDC transaction
  const sendUSDC = useCallback(async (to: string, amount: string) => {
    if (!window.tronWeb || !account) {
      throw new Error('TronLink not connected')
    }

    try {
      const usdcContract = await window.tronWeb.contract().at('TLcrNFz7x433NsqFrJFc3aixZGLUsC6brA')
      const amountSun = window.tronWeb.toSun(parseFloat(amount) * 1e6)
      
      const result = await usdcContract.transfer(to, amountSun).send({
        feeLimit: 100_000_000,
        callValue: 0
      })

      return result
    } catch (err: any) {
      console.error('USDC transfer error:', err)
      throw new Error(`Transfer failed: ${err.message}`)
    }
  }, [account])

  // Initialize on mount
  useEffect(() => {
    initializeTronLink()
  }, [initializeTronLink])

  // Listen for account changes
  useEffect(() => {
    if (!isTronLinkAvailable()) return

    const handleAccountsChanged = () => {
      if (window.tronWeb?.defaultAddress?.base58) {
        const address = {
          base58: window.tronWeb.defaultAddress.base58,
          hex: window.tronWeb.defaultAddress.hex
        }
        setAccount({ address })
        setIsConnected(true)
        updateBalance(address.base58)
      } else {
        disconnect()
      }
    }

    // TronLink doesn't have a standard event system like MetaMask
    // We need to poll for changes or use a different approach
    const interval = setInterval(() => {
      if (window.tronWeb?.defaultAddress?.base58 !== account?.address?.base58) {
        handleAccountsChanged()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [account, disconnect, updateBalance, isTronLinkAvailable])

  return {
    isConnected,
    account,
    balance,
    isLoading,
    error,
    connect,
    disconnect,
    sendUSDC,
    updateBalance: () => account && updateBalance(account.address.base58),
    isTronLinkAvailable: isTronLinkAvailable()
  }
}