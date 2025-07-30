#!/bin/bash

# Master Deployment Script for Stellar Fusion+ Project
# Deploys both Ethereum (1inch) and Stellar (HTLC) contracts

set -e

echo "🚀 Stellar Fusion+ Complete Contract Deployment"
echo "==============================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command_exists node; then
    echo "❌ Node.js not found. Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

if ! command_exists npm; then
    echo "❌ NPM not found. Please install npm"
    exit 1
fi

if ! command_exists stellar; then
    echo "❌ Stellar CLI not found. Please install from:"
    echo "https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup"
    exit 1
fi

if ! command_exists rustc; then
    echo "❌ Rust not found. Please install from https://rustup.rs/"
    exit 1
fi

echo "✅ All prerequisites found"
echo ""

# Check if we're in the right directory
if [ ! -d "contracts" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

echo "📋 Deployment Plan:"
echo "1. Deploy 1inch Fusion+ contracts to Ethereum Sepolia"
echo "2. Deploy HTLC contract to Stellar Testnet"
echo "3. Update all configurations"
echo ""

read -p "Do you want to proceed? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "🔧 Phase 1: Ethereum Deployment"
echo "==============================="

cd contracts/ethereum

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Ethereum .env file not found. Please configure it first:"
    echo "1. cd contracts/ethereum"
    echo "2. cp env.template .env"
    echo "3. Edit .env with your Ethereum private key and Infura URL"
    echo "4. Run this script again"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d node_modules ]; then
    echo "📦 Installing Ethereum dependencies..."
    npm install
fi

# Deploy Ethereum contracts
echo "🚀 Deploying 1inch contracts to Sepolia..."
ETHEREUM_OUTPUT=$(npm run deploy:sepolia 2>&1) || {
    echo "❌ Ethereum deployment failed:"
    echo "$ETHEREUM_OUTPUT"
    exit 1
}

echo "✅ Ethereum contracts deployed successfully!"

# Extract contract addresses from output
LOP_ADDRESS=$(echo "$ETHEREUM_OUTPUT" | grep "LimitOrderProtocolV3:" | awk '{print $2}')
SETTLEMENT_ADDRESS=$(echo "$ETHEREUM_OUTPUT" | grep "Settlement (Fusion+):" | awk '{print $3}')

cd ../..

echo ""
echo "🌟 Phase 2: Stellar Deployment"
echo "=============================="

cd contracts/stellar

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Stellar .env file not found. Please configure it first:"
    echo "1. cd contracts/stellar"
    echo "2. cp env.template .env"
    echo "3. Edit .env with your Stellar secret key"
    echo "4. Run this script again"
    exit 1
fi

# Deploy Stellar contract
echo "🚀 Deploying HTLC contract to Stellar testnet..."
STELLAR_OUTPUT=$(./deploy.sh 2>&1) || {
    echo "❌ Stellar deployment failed:"
    echo "$STELLAR_OUTPUT"
    exit 1
}

echo "✅ Stellar contract deployed successfully!"

# Extract contract ID from output
STELLAR_CONTRACT_ID=$(echo "$STELLAR_OUTPUT" | grep "Contract ID:" | awk '{print $3}')

cd ../..

echo ""
echo "🔧 Phase 3: Configuration Update"
echo "================================"

# Update resolver service configuration
if [ -d "resolver-service" ]; then
    echo "📝 Updating resolver service configuration..."
    
    # Create or update resolver .env
    cat > resolver-service/.env << EOF
# Resolver Service Configuration - Auto-generated $(date)

# Ethereum Configuration
ETHEREUM_RPC_URL=$(grep ETHEREUM_RPC_URL contracts/ethereum/.env | cut -d'=' -f2)
ETHEREUM_LIMIT_ORDER_PROTOCOL=$LOP_ADDRESS
ETHEREUM_SETTLEMENT_CONTRACT=$SETTLEMENT_ADDRESS
ETHEREUM_USDC_CONTRACT=0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d
RESOLVER_ETHEREUM_PRIVATE_KEY=$(grep ETHEREUM_PRIVATE_KEY contracts/ethereum/.env | cut -d'=' -f2)

# Stellar Configuration  
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_ESCROW_CONTRACT_ID=$STELLAR_CONTRACT_ID
STELLAR_USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
RESOLVER_STELLAR_SECRET_KEY=$(grep STELLAR_SECRET_KEY contracts/stellar/.env | cut -d'=' -f2)

# Service Configuration
PORT=3001
LOG_LEVEL=info
NODE_ENV=development
EOF

    echo "✅ Resolver service configured"
fi

# Update frontend configuration
if [ -d "stellar-fusion-extension" ]; then
    echo "📝 Updating frontend configuration..."
    
    # Create or update frontend .env
    cat > stellar-fusion-extension/.env.local << EOF
# Frontend Configuration - Auto-generated $(date)

# Ethereum Configuration
REACT_APP_ETHEREUM_RPC_URL=$(grep ETHEREUM_RPC_URL contracts/ethereum/.env | cut -d'=' -f2)
REACT_APP_ETHEREUM_LIMIT_ORDER_PROTOCOL=$LOP_ADDRESS
REACT_APP_ETHEREUM_SETTLEMENT_CONTRACT=$SETTLEMENT_ADDRESS
REACT_APP_ETHEREUM_USDC_ADDRESS=0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d

# Stellar Configuration
REACT_APP_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
REACT_APP_STELLAR_ESCROW_ADDRESS=$STELLAR_CONTRACT_ID
REACT_APP_STELLAR_USDC_ADDRESS=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA

# Resolver Configuration
REACT_APP_RESOLVER_ENDPOINT=http://localhost:3001
EOF

    echo "✅ Frontend configured"
fi

# Create deployment summary
cat > deployment-summary.json << EOF
{
  "deploymentTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ethereum": {
    "network": "sepolia",
    "limitOrderProtocol": "$LOP_ADDRESS",
    "settlement": "$SETTLEMENT_ADDRESS",
    "usdc": "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d"
  },
  "stellar": {
    "network": "testnet", 
    "htlcContract": "$STELLAR_CONTRACT_ID",
    "usdc": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
  }
}
EOF

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo "======================"
echo ""
echo "📋 Deployed Contracts:"
echo "━━━━━━━━━━━━━━━━━━━━━━"
echo "🔷 Ethereum Sepolia:"
echo "  • LimitOrderProtocolV3: $LOP_ADDRESS"
echo "  • Settlement (Fusion+): $SETTLEMENT_ADDRESS"
echo "  • USDC Token:          0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d"
echo ""
echo "🌟 Stellar Testnet:"
echo "  • HTLC Contract:       $STELLAR_CONTRACT_ID"
echo "  • USDC Token:          CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
echo ""
echo "🚀 Next Steps:"
echo "━━━━━━━━━━━━━━"
echo "1. Start the resolver service:"
echo "   cd resolver-service && npm install && npm start"
echo ""
echo "2. Start the frontend:"
echo "   cd stellar-fusion-extension && npm start"
echo ""
echo "3. Fund your resolver accounts with USDC for liquidity"
echo ""
echo "4. Test the cross-chain swap functionality!"
echo ""
echo "📄 Full deployment details saved to: deployment-summary.json"
echo ""