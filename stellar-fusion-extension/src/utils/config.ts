import { AppConfig } from '../types';

export const APP_CONFIG: AppConfig = {
  networks: {
    ethereum: {
      chainId: 11155111, // Sepolia testnet
      name: 'Sepolia',
      rpcUrl: process.env.REACT_APP_ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
      explorerUrl: 'https://sepolia.etherscan.io',
    },
    stellar: {
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      explorerUrl: 'https://stellar.expert/explorer/testnet',
    },
  },
  contracts: {
    // These will be updated after deployment
    ethereumEscrow: process.env.REACT_APP_ETHEREUM_ESCROW_ADDRESS || '0x0000000000000000000000000000000000000000',
    stellarEscrow: process.env.REACT_APP_STELLAR_ESCROW_ADDRESS || 'STELLAR_CONTRACT_ID',
  },
  tokens: {
    ethereum: {
      usdc: {
        // Sepolia USDC testnet address
        address: process.env.REACT_APP_ETHEREUM_USDC_ADDRESS || '0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d',
        symbol: 'USDC',
        decimals: 6,
      },
    },
    stellar: {
      usdc: {
        // Stellar USDC testnet contract
        address: process.env.REACT_APP_STELLAR_USDC_ADDRESS || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
        symbol: 'USDC',
        decimals: 7, // Stellar typically uses 7 decimals
      },
    },
  },
  resolver: {
    endpoint: process.env.REACT_APP_RESOLVER_ENDPOINT || 'http://localhost:3001',
    maxTimelock: 3600, // 1 hour in seconds
  },
};

// Environment-specific configurations
export const DEVELOPMENT_CONFIG = {
  ...APP_CONFIG,
  // Override for development
  resolver: {
    ...APP_CONFIG.resolver,
    endpoint: 'http://localhost:3001',
  },
};

export const PRODUCTION_CONFIG = {
  ...APP_CONFIG,
  // Production overrides would go here
};

// Get configuration based on environment
export function getConfig(): AppConfig {
  switch (process.env.NODE_ENV) {
    case 'development':
      return DEVELOPMENT_CONFIG;
    case 'production':
      return PRODUCTION_CONFIG;
    default:
      return APP_CONFIG;
  }
}

// Contract ABI fragments for essential functions
export const ETHEREUM_ESCROW_ABI = [
  {
    "type": "function",
    "name": "createEscrow",
    "inputs": [
      {"name": "maker", "type": "address"},
      {"name": "token", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "hashLock", "type": "bytes32"},
      {"name": "timelockDuration", "type": "uint256"},
      {"name": "dstChainId", "type": "uint32"},
      {"name": "orderHash", "type": "bytes32"}
    ],
    "outputs": [{"name": "escrowId", "type": "uint256"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimWithSecret",
    "inputs": [
      {"name": "escrowId", "type": "uint256"},
      {"name": "secret", "type": "bytes32"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refundEscrow",
    "inputs": [
      {"name": "escrowId", "type": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getEscrow",
    "inputs": [
      {"name": "escrowId", "type": "uint256"}
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {"name": "maker", "type": "address"},
          {"name": "resolver", "type": "address"},
          {"name": "token", "type": "address"},
          {"name": "amount", "type": "uint256"},
          {"name": "hashLock", "type": "bytes32"},
          {"name": "timelock", "type": "uint256"},
          {"name": "claimed", "type": "bool"},
          {"name": "refunded", "type": "bool"},
          {"name": "dstChainId", "type": "uint32"},
          {"name": "orderHash", "type": "bytes32"}
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isActiveEscrow",
    "inputs": [
      {"name": "escrowId", "type": "uint256"}
    ],
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "EscrowCreated",
    "inputs": [
      {"name": "escrowId", "type": "uint256", "indexed": true},
      {"name": "maker", "type": "address", "indexed": true},
      {"name": "resolver", "type": "address", "indexed": true},
      {"name": "token", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "hashLock", "type": "bytes32"},
      {"name": "timelock", "type": "uint256"},
      {"name": "dstChainId", "type": "uint32"},
      {"name": "orderHash", "type": "bytes32"}
    ]
  },
  {
    "type": "event",
    "name": "EscrowClaimed",
    "inputs": [
      {"name": "escrowId", "type": "uint256", "indexed": true},
      {"name": "claimant", "type": "address", "indexed": true},
      {"name": "secret", "type": "bytes32"}
    ]
  },
  {
    "type": "event",
    "name": "EscrowRefunded",
    "inputs": [
      {"name": "escrowId", "type": "uint256", "indexed": true},
      {"name": "refundee", "type": "address", "indexed": true}
    ]
  }
];

export const ERC20_ABI = [
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [{"name": "account", "type": "address"}],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [{"name": "", "type": "string"}],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint8"}],
    "stateMutability": "view"
  }
];

// Helper functions
export function getEthereumExplorerUrl(txHash: string): string {
  return `${APP_CONFIG.networks.ethereum.explorerUrl}/tx/${txHash}`;
}

export function getStellarExplorerUrl(txHash: string): string {
  return `${APP_CONFIG.networks.stellar.explorerUrl}/tx/${txHash}`;
}

export function getAddressExplorerUrl(address: string, chain: 'ethereum' | 'stellar'): string {
  if (chain === 'ethereum') {
    return `${APP_CONFIG.networks.ethereum.explorerUrl}/address/${address}`;
  } else {
    return `${APP_CONFIG.networks.stellar.explorerUrl}/account/${address}`;
  }
} 