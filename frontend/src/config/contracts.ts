import { sepolia, celoAlfajores } from 'viem/chains'

// Define custom chains
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://monad-testnet.drpc.org'] }
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' }
  }
} as const

const etherlinkTestnet = {
  id: 128123,
  name: 'Etherlink Testnet',
  nativeCurrency: { name: 'XTZ', symbol: 'XTZ', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://node.ghostnet.etherlink.com'] }
  },
  blockExplorers: {
    default: { name: 'Etherlink Explorer', url: 'https://testnet.explorer.etherlink.com' }
  }
} as const

const tronShasta = {
  id: 2,
  name: 'Tron Shasta',
  nativeCurrency: { name: 'TRX', symbol: 'TRX', decimals: 6 },
  rpcUrls: {
    default: { http: ['https://api.shasta.trongrid.io'] }
  },
  blockExplorers: {
    default: { name: 'Tronscan Shasta', url: 'https://shasta.tronscan.org' }
  }
} as const

export const NETWORKS = {
  sepolia: {
    chainId: sepolia.id,
    name: 'Ethereum Sepolia',
    nativeCurrency: sepolia.nativeCurrency,
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    blockExplorer: 'https://sepolia.etherscan.io',
    usdc: '0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d',
    escrowFactory: '0x3FB07e58b2717184a176fFdCA69d019372825009',
    resolver: '0x917999645773E99d03d44817B7318861F018Cb74',
  },
  celo: {
    chainId: celoAlfajores.id,
    name: 'Celo Alfajores',
    nativeCurrency: celoAlfajores.nativeCurrency,
    rpcUrl: 'https://celo-alfajores.drpc.org',
    blockExplorer: 'https://celo-alfajores.blockscout.com',
    usdc: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    escrowFactory: '0x3FF2736041437F74eA564505db782F86ADC69e35',
    resolver: '0x917999645773E99d03d44817B7318861F018Cb74',
  },
  monad: {
    chainId: monadTestnet.id,
    name: 'Monad Testnet',
    nativeCurrency: monadTestnet.nativeCurrency,
    rpcUrl: 'https://monad-testnet.drpc.org',
    blockExplorer: 'https://explorer.monad.xyz',
    usdc: '0xc477386a8ced1fe69d5d4ecd8eaf6558da9e537c',
    escrowFactory: '0xcEeeaA149BEd3Af5FB9553f0AdA0a537efcc6256',
    resolver: '0x917999645773E99d03d44817B7318861F018Cb74',
  },
  etherlink: {
    chainId: etherlinkTestnet.id,
    name: 'Etherlink Testnet',
    nativeCurrency: etherlinkTestnet.nativeCurrency,
    rpcUrl: 'https://node.ghostnet.etherlink.com',
    blockExplorer: 'https://testnet.explorer.etherlink.com',
    usdc: '0xC477386A8CED1fE69d5d4eCD8EaF6558DA9e537c',
    escrowFactory: '0xcEeeaA149BEd3Af5FB9553f0AdA0a537efcc6256',
    resolver: '0x917999645773E99d03d44817B7318861F018Cb74',
  },
  tron: {
    chainId: tronShasta.id,
    name: 'Tron Shasta',
    nativeCurrency: tronShasta.nativeCurrency,
    rpcUrl: 'https://api.shasta.trongrid.io',
    blockExplorer: 'https://shasta.tronscan.org',
    usdc: 'TE6QE6GR1VCsJ3p9H3JDjY391Z9hqUCJem',
    escrowFactory: 'TQsFBuQZHoCi4MMtMFvb2sW5N8hntW4BZE',
    resolver: 'TPEQejXeb5ojShytfYaUEjvU25YLWBgjnM',
  },
} as const

export const SUPPORTED_TOKENS = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      [sepolia.id]: NETWORKS.sepolia.usdc,
      [celoAlfajores.id]: NETWORKS.celo.usdc,
      [monadTestnet.id]: NETWORKS.monad.usdc,
      [etherlinkTestnet.id]: NETWORKS.etherlink.usdc,
      [tronShasta.id]: NETWORKS.tron.usdc,
    },
    logo: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
  },
} as const

// Contract ABIs
export const ERC20_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const ESCROW_FACTORY_ABI = [
  {
    inputs: [
      { name: 'orderHash', type: 'bytes32' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'hashLock', type: 'bytes32' },
      { name: 'timeLocks', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'taker', type: 'address' }
    ],
    name: 'createEscrow',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'orderHash', type: 'bytes32' }],
    name: 'getEscrow',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'orderHash', type: 'bytes32' }],
    name: 'escrowExists',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'orderHash', type: 'bytes32' },
      { indexed: true, name: 'escrow', type: 'address' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'hashLock', type: 'bytes32' },
      { indexed: false, name: 'deployedAt', type: 'uint256' }
    ],
    name: 'EscrowCreated',
    type: 'event',
  },
] as const

export const ESCROW_ABI = [
  'function withdraw(bytes32 secret) external',
  'function cancel() external',
  'function getState() view returns (string)',
  'function revealedSecret() view returns (bytes32)',
  'function immutables() view returns (tuple(bytes32 orderHash, bytes32 hashLock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint256 timeLocks))',
  'function timeLocks() view returns (tuple(uint32 deployedAt, uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 publicCancellation))',
  'function withdrawn() view returns (bool)',
  'function cancelled() view returns (bool)',
  'event SecretRevealed(bytes32 indexed orderHash, bytes32 secret)',
  'event Withdrawn(bytes32 indexed orderHash, address indexed to, uint256 amount)',
  'event Cancelled(bytes32 indexed orderHash, address indexed to, uint256 amount)',
] as const

// Resolver address that users need to approve for intent-based bridging
export const RESOLVER_ADDRESS = '0x917999645773E99d03d44817B7318861F018Cb74'

export type NetworkKey = keyof typeof NETWORKS
export type TokenKey = keyof typeof SUPPORTED_TOKENS