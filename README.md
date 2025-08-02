# 1inch Fusion+ Cross-Chain Bridge: Ethereum Sepolia ↔ Celo Alfajores

A Proof of Concept implementation demonstrating cross-chain token swaps using 1inch Fusion+ principles between Ethereum Sepolia and Celo Alfajores testnets.

## 🏗️ Architecture

This project implements a cross-chain atomic swap system with three main components:

1. **Smart Contracts** (`/contracts`) - Hashlock/Timelock contracts deployed on both chains
2. **Frontend** (`/frontend`) - React-based bridge UI with MetaMask integration
3. **Resolver** (`/resolver`) - Mock solver agent that facilitates cross-chain transactions

## 🔧 Features

- ✅ Bidirectional USDC swaps (Ethereum Sepolia ↔ Celo Alfajores)
- ✅ Hashlock and timelock functionality preservation
- ✅ Atomic swap guarantees
- ✅ MetaMask integration
- ✅ Modern bridge-like UI
- ✅ Balance tracking and transaction status

## 🌐 Network Configuration

### Ethereum Sepolia
- Chain ID: `11155111`
- RPC: `https://ethereum-sepolia-rpc.publicnode.com`
- USDC: `0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d`

### Celo Alfajores
- Chain ID: `44787`
- RPC: `https://celo-alfajores.drpc.org`
- USDC: `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B`

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Install dependencies for all components
cd contracts && npm install && cd ..
cd frontend && npm install && cd ..
cd resolver && npm install && cd ..

# Deploy contracts
npm run deploy:contracts

# Start development servers
npm run dev
```

## 📁 Project Structure

```
├── contracts/          # Smart contracts with hashlock/timelock
├── frontend/           # React UI with Web3 integration
├── resolver/           # Mock solver agent
├── docs/              # Documentation
└── Samples/           # 1inch reference implementations
```

## 🔐 Security Notes

- Uses cryptographic hashlocks for atomic swaps
- Implements timelocks for refund mechanisms
- Testnet-only implementation with provided test accounts
- All private keys are for testnet use only

## 🎯 Hackathon Requirements

- ✅ Cross-chain token swap between Ethereum Sepolia and Celo Alfajores
- ✅ Hashlock and timelock functionality preserved
- ✅ Bidirectional swap functionality
- ✅ Onchain execution on testnets
- ✅ Mock resolver agent implementation
- ✅ Compatible with 1inch infrastructure patterns