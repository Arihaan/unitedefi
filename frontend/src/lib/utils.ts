import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatUnits, parseUnits } from 'viem'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTokenAmount(amount: bigint, decimals: number, precision = 4): string {
  const formatted = formatUnits(amount, decimals)
  const num = parseFloat(formatted)
  
  if (num === 0) return '0'
  if (num < 0.0001) return '< 0.0001'
  
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  })
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!amount || amount === '') return 0n
  return parseUnits(amount, decimals)
}

export function shortenAddress(address: string, startLength = 6, endLength = 4): string {
  if (!address) return ''
  if (address.length <= startLength + endLength) return address
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

export function generateRandomBytes32(): `0x${string}` {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return `0x${Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
}

export function packTimelocks(
  deployedAt: number,
  withdrawal: number,
  publicWithdrawal: number,
  cancellation: number,
  publicCancellation: number
): bigint {
  return (
    BigInt(deployedAt) |
    (BigInt(withdrawal) << 32n) |
    (BigInt(publicWithdrawal) << 64n) |
    (BigInt(cancellation) << 96n) |
    (BigInt(publicCancellation) << 128n)
  )
}

export function unpackTimelocks(packed: bigint) {
  return {
    deployedAt: Number(packed & 0xFFFFFFFFn),
    withdrawal: Number((packed >> 32n) & 0xFFFFFFFFn),
    publicWithdrawal: Number((packed >> 64n) & 0xFFFFFFFFn),
    cancellation: Number((packed >> 96n) & 0xFFFFFFFFn),
    publicCancellation: Number((packed >> 128n) & 0xFFFFFFFFn),
  }
}

export function getExplorerUrl(chainId: number, hash: string, type: 'tx' | 'address' = 'tx'): string {
  const baseUrls: Record<number, string> = {
    11155111: 'https://sepolia.etherscan.io', // Sepolia
    44787: 'https://celo-alfajores.blockscout.com', // Celo Alfajores
  }
  
  const baseUrl = baseUrls[chainId]
  if (!baseUrl) return '#'
  
  return `${baseUrl}/${type}/${hash}`
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}