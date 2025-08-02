import { type NetworkKey, type TokenKey } from '@/config/contracts'

export interface SwapState {
  id: string
  orderHash: `0x${string}`
  secret: `0x${string}`
  hashLock: `0x${string}`
  fromNetwork: NetworkKey
  toNetwork: NetworkKey
  token: TokenKey
  amount: string
  amountWei: bigint
  
  // Addresses
  userAddress: `0x${string}`
  resolverAddress: `0x${string}`
  sourceEscrowAddress?: `0x${string}`
  destinationEscrowAddress?: `0x${string}`
  
  // Timestamps
  createdAt: number
  timeLocks: {
    deployedAt: number
    withdrawal: number
    publicWithdrawal: number
    cancellation: number
    publicCancellation: number
  }
  
  // Transaction hashes
  approvalTxHash?: `0x${string}`
  sourceEscrowTxHash?: `0x${string}`
  destinationEscrowTxHash?: `0x${string}`
  withdrawalTxHash?: `0x${string}`
  
  // Status
  status: SwapStatus
  error?: string
}

export enum SwapStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVING = 'approving',
  CREATING_SOURCE_ESCROW = 'creating_source_escrow',
  WAITING_FOR_DESTINATION = 'waiting_for_destination',
  READY_TO_CLAIM = 'ready_to_claim',
  CLAIMING = 'claiming',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export interface SwapFormData {
  fromNetwork: NetworkKey
  toNetwork: NetworkKey
  token: TokenKey
  amount: string
}

export interface TokenBalance {
  token: TokenKey
  balance: bigint
  formattedBalance: string
  network: NetworkKey
}

export interface NetworkInfo {
  chainId: number
  name: string
  isConnected: boolean
  isSupported: boolean
}

export interface EscrowInfo {
  address: `0x${string}`
  state: string
  isWithdrawn: boolean
  isCancelled: boolean
  revealedSecret?: `0x${string}`
  timeLocks: {
    deployedAt: number
    withdrawal: number
    publicWithdrawal: number
    cancellation: number
    publicCancellation: number
  }
}

export interface TransactionInfo {
  hash: `0x${string}`
  status: 'pending' | 'success' | 'failed'
  timestamp: number
  explorerUrl: string
}

export interface BridgeError {
  code: string
  message: string
  details?: any
}