#!/bin/bash

# Stellar Fusion+ HTLC Contract Deployment Script
# This script deploys the Stellar HTLC contract to Stellar testnet

set -e

echo "🌟 Deploying Stellar Fusion+ HTLC Contract"
echo "==========================================="

# Check if Stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo "❌ Stellar CLI not found. Please install it first:"
    echo "curl -L https://github.com/stellar/stellar-cli/releases/download/v21.1.0/stellar-cli-21.1.0-x86_64-apple-darwin.tar.gz | tar -xz"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    echo "📋 Loading environment variables from .env"
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
else
    echo "⚠️  No .env file found. Creating template..."
    cat > .env << EOF
# Stellar Deployment Configuration
STELLAR_SECRET_KEY=YOUR_STELLAR_SECRET_KEY_HERE
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
EOF
    echo "❌ Please edit .env with your Stellar secret key and run again"
    exit 1
fi

# Check if secret key is configured
if [ "$STELLAR_SECRET_KEY" = "YOUR_STELLAR_SECRET_KEY_HERE" ]; then
    echo "❌ Please configure your STELLAR_SECRET_KEY in .env file"
    exit 1
fi

echo "🔧 Setting up Stellar CLI configuration"

# Configure Stellar CLI for testnet
stellar network add testnet \
    --rpc-url https://soroban-testnet.stellar.org \
    --network-passphrase "Test SDF Network ; September 2015" \
    2>/dev/null || echo "Testnet already configured"

# Use existing alice identity (already funded)
echo "Using alice identity for deployment"

echo "🏗️  Building Stellar contract"

# Build the contract
cargo build --target wasm32-unknown-unknown --release

if [ ! -f target/wasm32-unknown-unknown/release/stellar_fusion_contracts.wasm ]; then
    echo "❌ Contract build failed"
    exit 1
fi

echo "✅ Contract built successfully"

echo "🚀 Deploying contract to Stellar testnet"

# Deploy the contract
CONTRACT_ID=$(stellar contract deploy \
    --wasm target/wasm32-unknown-unknown/release/stellar_fusion_contracts.wasm \
    --source alice \
    --network testnet)

if [ -z "$CONTRACT_ID" ]; then
    echo "❌ Contract deployment failed"
    exit 1
fi

echo "✅ Contract deployed successfully!"
echo "📋 Contract ID: $CONTRACT_ID"

echo "🔧 Initializing contract"

# Initialize the contract
stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source alice \
    --network testnet \
    -- initialize

echo "✅ Contract initialized successfully!"

# Save deployment info
cat > deployment-info.json << EOF
{
  "contractId": "$CONTRACT_ID",
  "network": "testnet",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployerAddress": "$(stellar keys address alice)"
}
EOF

echo "📄 Deployment info saved to deployment-info.json"

echo ""
echo "🎉 Stellar HTLC Contract Deployment Complete!"
echo "=============================================="
echo "Contract ID: $CONTRACT_ID"
echo "Network: Stellar Testnet"
echo "RPC URL: https://soroban-testnet.stellar.org"
echo ""
echo "📋 Next steps:"
echo "1. Update your resolver service configuration:"
echo "   STELLAR_ESCROW_CONTRACT_ID=$CONTRACT_ID"
echo "2. Update your frontend configuration"
echo "3. Fund your resolver's Stellar account with USDC"
echo ""