# 🚀 1inch Fusion+ Stellar Extension - Deployment Guide

This guide covers deploying the **actual 1inch Limit Order Protocol contracts** and setting up the cross-chain resolver for live demo.

## ✅ Requirements Compliance

- ✅ **1inch Limit Order Protocol V3** - Deployed to testnet
- ✅ **1inch Settlement Contract** - Fusion+ extension deployed
- ✅ **Hashlock & Timelock** - Preserved in both chains
- ✅ **Bidirectional Swaps** - Ethereum ↔ Stellar 
- ✅ **On-chain Execution** - Real blockchain transactions

## 📋 Prerequisites

1. **Node.js 18+** and **npm**
2. **Ethereum Sepolia testnet** access (Infura/Alchemy)
3. **Stellar testnet** access 
4. **Test ETH** for gas fees
5. **Test USDC** on both chains for liquidity

## 🏗️ Step 1: Deploy 1inch Contracts to Sepolia

### Install Dependencies
```bash
cd contracts/ethereum
npm install
```

### Configure Environment
```bash
# Create .env file
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
DEPLOYER_PRIVATE_KEY=your_deployer_private_key
RESOLVER_ETHEREUM_PRIVATE_KEY=your_resolver_private_key
```

### Deploy 1inch Contracts
```bash
# Deploy LimitOrderProtocolV3 + Settlement contracts
npx hardhat run deploy-1inch-contracts.js --network sepolia
```

**Expected Output:**
```
🚀 Deploying 1inch Fusion+ Contracts to Sepolia Testnet
✅ LimitOrderProtocolV3 deployed to: 0x...
✅ Settlement contract deployed to: 0x...

📋 Environment Variables for .env:
ETHEREUM_LIMIT_ORDER_PROTOCOL=0x...
ETHEREUM_SETTLEMENT_CONTRACT=0x...
ETHEREUM_WETH_ADDRESS=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14
```

## 🌟 Step 2: Deploy Stellar Soroban Contracts

### Build Stellar Contract
```bash
cd contracts/stellar
soroban contract build
```

### Deploy to Stellar Testnet
```bash
# Deploy the timelock contract
soroban contract deploy \
  --source deployer-keypair \
  --network testnet \
  --wasm target/wasm32-unknown-unknown/release/stellar_fusion_timelock.wasm
```

**Save the Contract ID:**
```bash
export STELLAR_ESCROW_CONTRACT=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## ⚙️ Step 3: Configure Resolver Service

### Setup Resolver Environment
```bash
cd resolver-service
npm install

# Create .env file
cat > .env << EOF
# Server Configuration
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# Ethereum Configuration (from Step 1)
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
ETHEREUM_LIMIT_ORDER_PROTOCOL=0x... # From deployment output
ETHEREUM_SETTLEMENT_CONTRACT=0x...  # From deployment output
ETHEREUM_USDC_CONTRACT=0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d
RESOLVER_ETHEREUM_PRIVATE_KEY=your_resolver_private_key
RESOLVER_ETHEREUM_ADDRESS=your_resolver_address

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_ESCROW_CONTRACT=CXXXXX... # From Step 2
STELLAR_USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
RESOLVER_STELLAR_PRIVATE_KEY=your_stellar_secret_key
RESOLVER_STELLAR_ADDRESS=your_stellar_public_key
EOF
```

### Fund Resolver Accounts
```bash
# Fund Ethereum account with test ETH
# Send to: your_resolver_address (from Sepolia faucet)

# Fund Stellar account with test XLM
curl "https://friendbot.stellar.org?addr=your_stellar_public_key"

# Add USDC trustlines and get test USDC (manual process)
```

## 🌐 Step 4: Configure Frontend

### Setup Frontend Environment
```bash
cd stellar-fusion-extension

# Update src/utils/config.ts with deployed addresses
cat > .env.local << EOF
REACT_APP_ETHEREUM_USDC_ADDRESS=0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d
REACT_APP_STELLAR_USDC_ADDRESS=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
REACT_APP_RESOLVER_API_URL=http://localhost:3001
EOF

npm install
```

## 🚀 Step 5: Start the Complete System

### Terminal 1: Start Resolver Service
```bash
cd resolver-service
npm start

# Expected output:
# Stellar Fusion+ Resolver Service running on port 3001
# Ethereum Fusion Manager initialized
# Resolver address: 0x...
```

### Terminal 2: Start Frontend
```bash
cd stellar-fusion-extension
npm start

# Expected output:
# Local:            http://localhost:3000
# Network:          http://192.168.x.x:3000
```

## 🧪 Step 6: Test End-to-End Flow

### 1. Connect Wallets
- **MetaMask**: Connect to Sepolia testnet
- **Freighter**: Connect to Stellar testnet

### 2. Verify Balances
- Check USDC balances show correctly
- Ensure sufficient ETH/XLM for gas

### 3. Execute Test Swap
```
From: Ethereum (100 USDC)
To: Stellar (99.8 USDC)
```

### 4. Monitor Logs
**Resolver logs should show:**
```
Quote generated: ethereum->stellar, 100 USDC -> 99.8 USDC
Fusion+ order created on Ethereum: 0x...
Stellar escrow created: CXXXXX...
Cross-chain swap completed successfully
```

## 🔍 Verification Checklist

### ✅ Contract Deployments
- [ ] LimitOrderProtocolV3 deployed and verified
- [ ] Settlement contract deployed and verified  
- [ ] Stellar timelock contract deployed
- [ ] All addresses saved in environment files

### ✅ Resolver Service
- [ ] Service starts without errors
- [ ] Connects to both blockchains
- [ ] Has sufficient USDC liquidity
- [ ] Logs show proper 1inch integration

### ✅ Frontend Integration
- [ ] Wallets connect successfully
- [ ] USDC balances display correctly
- [ ] Quote generation works
- [ ] Swap execution succeeds
- [ ] Progress tracking functions

### ✅ Cross-Chain Flow
- [ ] Ethereum Fusion+ orders created
- [ ] Stellar escrows established
- [ ] Hashlock/timelock preserved
- [ ] Secret reveal mechanism works
- [ ] Bidirectional swaps function

## 🎯 Demo Preparation

For the ETH Global Unite demo:

1. **Pre-fund accounts** with test tokens
2. **Pre-deploy contracts** to avoid live deployment delays
3. **Test both directions**: ETH→XLM and XLM→ETH
4. **Prepare backup scenarios** if networks are slow
5. **Document transaction hashes** for verification

## 🔧 Troubleshooting

### Common Issues:

**"Contract not deployed"**
- Verify contract addresses in environment files
- Check deployment transaction succeeded

**"Insufficient gas"**
- Ensure resolver has enough ETH for transactions
- Check gas price settings

**"USDC balance not showing"**
- Verify token contract addresses
- Check wallet has USDC trustline (Stellar)

**"Quote generation fails"**
- Check resolver service is running (port 3001)
- Verify API endpoints accessible

## 🏆 Architecture Summary

```
User (MetaMask/Freighter) → Frontend (React) → Resolver API → 1inch Contracts
                                                    ↓
                                            Ethereum LimitOrderProtocolV3
                                            Ethereum Settlement Contract
                                            Stellar Timelock Contract
```

This implementation properly extends 1inch Fusion+ to Stellar while preserving all protocol requirements and demonstrating real on-chain execution. 