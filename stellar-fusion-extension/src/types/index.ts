// Cross-chain swap types for Stellar Fusion+ extension

export interface CrossChainSwapOrder {
  id: string;
  maker: string;
  srcChain: 'ethereum' | 'stellar';
  dstChain: 'ethereum' | 'stellar';
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  hashLock: string; // SHA-256 hash of secret
  secret?: string; // The actual secret (32 bytes)
  timelock: number; // Expiration timestamp
  status: 'pending' | 'escrowed' | 'completed' | 'refunded' | 'expired';
  createdAt: number;
  ethereumEscrowId?: number;
  stellarEscrowId?: number;
}

export interface EthereumEscrowDetails {
  escrowId: number;
  maker: string;
  resolver: string;
  token: string;
  amount: string;
  hashLock: string;
  timelock: number;
  claimed: boolean;
  refunded: boolean;
  dstChainId: number;
  orderHash: string;
}

export interface StellarEscrowDetails {
  id: number;
  token: string;
  amount: string;
  depositor: string;
  beneficiary: string;
  hashLock: string;
  timelock: number;
  isClaimed: boolean;
  srcChainId: number;
  orderHash: string;
}

export interface WalletConnectionState {
  ethereum: {
    connected: boolean;
    address?: string;
    network?: string;
    balance?: string;
  };
  stellar: {
    connected: boolean;
    address?: string;
    network?: string;
    balance?: string;
  };
}

export interface SwapRequest {
  srcChain: 'ethereum' | 'stellar';
  dstChain: 'ethereum' | 'stellar';
  srcToken: string;
  dstToken: string;
  amount: string;
  slippage?: number;
}

export interface SwapQuote {
  srcAmount: string;
  dstAmount: string;
  estimatedGas: string;
  timelock: number; // Duration in seconds
  expiry: number; // Timestamp when quote expires
}

export interface ResolverConfig {
  ethereumRpcUrl: string;
  stellarRpcUrl: string;
  privateKeys: {
    ethereum: string;
    stellar: string;
  };
  contracts: {
    ethereumEscrow: string;
    stellarEscrow: string;
  };
  tokens: {
    ethereumUSDC: string;
    stellarUSDC: string;
  };
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations?: number;
  gasUsed?: string;
  explorerUrl?: string;
}

export interface SwapStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  transaction?: TransactionStatus;
  timestamp?: number;
}

export interface SwapProgress {
  orderId: string;
  steps: SwapStep[];
  currentStep: number;
  completed: boolean;
  failed: boolean;
  error?: string;
}

// Events
export interface EscrowCreatedEvent {
  escrowId: number;
  maker: string;
  resolver: string;
  token: string;
  amount: string;
  hashLock: string;
  timelock: number;
  dstChainId: number;
  orderHash: string;
}

export interface EscrowClaimedEvent {
  escrowId: number;
  claimant: string;
  secret: string;
}

export interface EscrowRefundedEvent {
  escrowId: number;
  refundee: string;
}

// Configuration
export interface AppConfig {
  networks: {
    ethereum: {
      chainId: number;
      name: string;
      rpcUrl: string;
      explorerUrl: string;
    };
    stellar: {
      network: 'testnet' | 'mainnet';
      horizonUrl: string;
      explorerUrl: string;
    };
  };
  contracts: {
    ethereumEscrow: string;
    stellarEscrow: string;
  };
  tokens: {
    ethereum: {
      usdc: {
        address: string;
        symbol: string;
        decimals: number;
      };
    };
    stellar: {
      usdc: {
        address: string;
        symbol: string;
        decimals: number;
      };
    };
  };
  resolver: {
    endpoint: string;
    maxTimelock: number; // Maximum timelock duration in seconds
  };
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface CreateOrderResponse {
  orderId: string;
  secret: string;
  hashLock: string;
  timelock: number;
}

export interface OrderStatusResponse {
  orderId: string;
  status: CrossChainSwapOrder['status'];
  progress: SwapProgress;
}

// Error types
export class CrossChainSwapError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CrossChainSwapError';
  }
}

export class WalletConnectionError extends Error {
  constructor(
    message: string,
    public wallet: 'metamask' | 'freighter',
    public details?: any
  ) {
    super(message);
    this.name = 'WalletConnectionError';
  }
}

export class ContractInteractionError extends Error {
  constructor(
    message: string,
    public contract: string,
    public method: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ContractInteractionError';
  }
} 