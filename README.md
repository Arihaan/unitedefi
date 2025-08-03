# 1inch Fusion+ Cross-Chain Bridge: Multi-Chain Support

A Proof of Concept implementation demonstrating cross-chain token swaps using 1inch Fusion+ principles across multiple blockchain testnets: Ethereum Sepolia, Celo Alfajores, Monad Testnet, Etherlink Testnet, and Tron Shasta.

## 🏗️ Architecture

This project implements a cross-chain atomic swap system with three main components:

1. **Smart Contracts** (`/contracts`) - Hashlock/Timelock contracts deployed on both chains
2. **Frontend** (`/frontend`) - React-based bridge UI with MetaMask integration
3. **Resolver** (`/resolver`) - Mock solver agent that facilitates cross-chain transactions

## 🔧 Features

- ✅ Multi-chain USDC swaps across 5 blockchain testnets (4 EVM + Tron)
- ✅ Hashlock and timelock functionality preservation  
- ✅ Atomic swap guarantees
- ✅ MetaMask integration with RainbowKit
- ✅ Modern bridge-like UI
- ✅ Balance tracking and transaction status
- ✅ Cross-chain resolver with multi-network support

## 🌐 Network Configuration

### Ethereum Sepolia
- Chain ID: `11155111`
- RPC: `https://ethereum-sepolia-rpc.publicnode.com`
- USDC: `0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d`
- Contracts: Settlement `0xC144D565e799ed813e09d2D43FEC191caC564Ec4` | EscrowFactory `0x3FB07e58b2717184a176fFdCA69d019372825009`

### Celo Alfajores
- Chain ID: `44787`
- RPC: `https://celo-alfajores.drpc.org`
- USDC: `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B`
- Contracts: Settlement `0x14367b834E7C39fD316730D413bF07c7e7a2E1A9` | EscrowFactory `0x3FF2736041437F74eA564505db782F86ADC69e35`

### Monad Testnet
- Chain ID: `10143`
- RPC: `https://monad-testnet.drpc.org`
- USDC: `0xc477386a8ced1fe69d5d4ecd8eaf6558da9e537c`
- Contracts: Settlement `0x1eB50687659aD0012e70f6407C4Fe2d312827df2` | EscrowFactory `0xcEeeaA149BEd3Af5FB9553f0AdA0a537efcc6256`

### Etherlink Testnet
- Chain ID: `128123`
- RPC: `https://node.ghostnet.etherlink.com`
- USDC: `0xC477386A8CED1fE69d5d4eCD8EaF6558DA9e537c`
- Contracts: Settlement `0x1eB50687659aD0012e70f6407C4Fe2d312827df2` | EscrowFactory `0xcEeeaA149BEd3Af5FB9553f0AdA0a537efcc6256`

### Tron Shasta
- Chain ID: `2`
- RPC: `https://api.shasta.trongrid.io`
- USDC: `TLcrNFz7x433NsqFrJFc3aixZGLUsC6brA`
- Contracts: Settlement `TQsFBuQZHoCi4MMtMFvb2sW5N8hntW4BZE` | EscrowFactory `TQsFBuQZHoCi4MMtMFvb2sW5N8hntW4BZE`

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Install dependencies for all components
cd contracts && npm install && cd ..
cd frontend && npm install && cd ..
cd resolver && npm install && cd ..

# Setup environment variables
cp contracts/.env.example contracts/.env
cp resolver/.env.example resolver/.env
# Edit .env files with your private keys

# Deploy contracts to all networks
npm run deploy:contracts

# Start development servers
npm run dev
```

## 📁 Project Structure

```
├── contracts/          # Smart contracts with hashlock/timelock
├── frontend/           # React UI with Web3 integration
├── resolver/           # Mock solver agent
├── scripts/            # Testing and utility scripts
├── docs/              # Documentation
└── Samples/           # 1inch reference implementations
```

## 🔐 Security Notes

- Uses cryptographic hashlocks for atomic swaps
- Implements timelocks for refund mechanisms
- Testnet-only implementation with provided test accounts
- All private keys are for testnet use only
- Environment variables used for private key management
- `.env` files are gitignored to prevent accidental exposure

## 🔧 Technical Implementation

### Cross-Chain Architecture
- **Smart Contracts**: Escrow factory pattern with hashlock/timelock mechanisms
- **Resolver Service**: Multi-network support with gas optimization
- **Frontend Integration**: RainbowKit wallet connection with chain switching
- **Tron Integration**: TronWeb support for non-EVM blockchain compatibility
- **Security**: Environment-based private key management
