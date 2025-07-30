# Stellar Fusion+ Resolver Service

This is the off-chain resolver service for the 1inch Fusion+ Stellar extension. It acts as a market maker and facilitates cross-chain atomic swaps between Ethereum and Stellar networks.

## Features

- **Real Blockchain Transactions**: Executes actual on-chain escrow creation and claiming
- **Cross-Chain Atomic Swaps**: HTLC-based trustless swaps between Ethereum and Stellar
- **1inch Fusion+ Compatible**: Follows the Fusion+ protocol for intent-based swaps
- **Bidirectional Swaps**: Supports both Ethereum → Stellar and Stellar → Ethereum
- **Production Ready**: Comprehensive logging, error handling, and monitoring

## Architecture

```
Frontend (React) → Resolver API → Blockchain Managers → Smart Contracts
                                      ↓
                              Ethereum Escrow ↔ Stellar Escrow
```

## Installation

```bash
cd resolver-service
npm install
```

## Environment Setup

Create a `.env` file with the following variables:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# Ethereum Configuration
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
ETHEREUM_ESCROW_CONTRACT=0x0000000000000000000000000000000000000000
ETHEREUM_USDC_CONTRACT=0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d
RESOLVER_ETHEREUM_PRIVATE_KEY=your_ethereum_private_key_here

# Stellar Configuration
STELLAR_NETWORK=testnet
STELLAR_ESCROW_CONTRACT=STELLAR_CONTRACT_ID
STELLAR_USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
RESOLVER_STELLAR_PRIVATE_KEY=your_stellar_secret_key_here
```

## Running the Service

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Get Quote
```
POST /api/quote
{
  "srcChain": "ethereum",
  "dstChain": "stellar", 
  "srcToken": "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d",
  "dstToken": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  "amount": "100"
}
```

### Create Order
```
POST /api/orders
{
  "srcChain": "ethereum",
  "dstChain": "stellar",
  "srcToken": "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d",
  "dstToken": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  "amount": "100",
  "dstAmount": "99.8",
  "makerAddress": "0x..."
}
```

### Get Order Status
```
GET /api/orders/:orderId
```

## Cross-Chain Swap Flow

1. **Quote Generation**: Calculate exchange rate and fees
2. **Order Creation**: Generate secret and hashlock for HTLC
3. **Source Escrow**: Create escrow on source chain with maker's tokens
4. **Destination Escrow**: Create escrow on destination chain with resolver's tokens
5. **Claim Destination**: Resolver claims destination escrow, revealing secret
6. **Claim Source**: Maker can now claim source escrow using revealed secret

## Requirements Compliance

✅ **Hashlock and Timelock**: Both preserved in Stellar Soroban contracts
✅ **Bidirectional Swaps**: Ethereum ↔ Stellar in both directions  
✅ **On-chain Execution**: Real blockchain transactions during demo
✅ **Fusion+ Extension**: Compatible with 1inch protocol architecture

## Deployment

For production deployment:

1. Deploy Ethereum escrow contract to mainnet/L2
2. Deploy Stellar Soroban escrow contract
3. Fund resolver accounts with liquidity
4. Configure environment variables
5. Start service with process manager (PM2)

## Monitoring

Logs are written to:
- Console (development)
- `logs/combined.log` (all logs)
- `logs/error.log` (errors only)

Monitor these endpoints:
- `/health` - Service health
- `/api/orders` - Active orders
- Application logs for transaction details 