import express from 'express';
import cors from 'cors';
import { FusionResolver } from './fusion-resolver.js';
import { RESOLVER_CONFIG } from './config.js';

const app = express();
const resolver = new FusionResolver();

// Middleware
app.use(cors());
app.use(express.json());

// Start resolver
console.log("🚀 Starting 1inch Fusion+ Mock Resolver...");
await resolver.start();

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: '1inch Fusion+ Mock Resolver',
    resolver: RESOLVER_CONFIG.address,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Get resolver info
app.get('/info', (req, res) => {
  res.json({
    resolverAddress: RESOLVER_CONFIG.address,
    supportedNetworks: ['sepolia', 'celo', 'monad', 'etherlink', 'tron'],
    timeLocks: RESOLVER_CONFIG.timeLocks,
    safetyDeposit: RESOLVER_CONFIG.safetyDeposit,
    architecture: '1inch Fusion+ Compatible',
    features: [
      'Cross-chain atomic swaps',
      'Hash time lock contracts (HTLC)',
      'Dutch auction mechanics',
      'Professional resolver role',
      'Safety deposit guarantees'
    ]
  });
});

// Process cross-chain swap request (core 1inch Fusion+ functionality)
app.post('/swap', async (req, res) => {
  try {
    const {
      fromNetwork,
      toNetwork,
      fromToken,
      toToken,
      amount,
      userAddress,
      destinationAddress
    } = req.body;

    // Validate request
    if (!fromNetwork || !toNetwork || !fromToken || !toToken || !amount || !userAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['fromNetwork', 'toNetwork', 'fromToken', 'toToken', 'amount', 'userAddress']
      });
    }

    if (!['sepolia', 'celo', 'monad', 'etherlink', 'tron'].includes(fromNetwork) || !['sepolia', 'celo', 'monad', 'etherlink', 'tron'].includes(toNetwork)) {
      return res.status(400).json({
        error: 'Unsupported network',
        supported: ['sepolia', 'celo', 'monad', 'etherlink', 'tron']
      });
    }

    if (fromNetwork === toNetwork) {
      return res.status(400).json({
        error: 'Source and destination networks must be different'
      });
    }

    console.log(`\n📨 Received swap request from ${req.ip}`);
    console.log(`   ${amount} ${fromToken} (${fromNetwork}) -> ${toToken} (${toNetwork})`);

    // Process the swap using 1inch Fusion+ architecture
    let result;
    try {
      console.log('🔍 About to call processSwapRequest with:', {
        fromNetwork,
        toNetwork,
        fromToken,
        toToken,
        amount,
        userAddress,
        destinationAddress: destinationAddress || userAddress
      });
      
      result = await resolver.processSwapRequest({
        fromNetwork,
        toNetwork,
        fromToken,
        toToken,
        amount,
        userAddress,
        destinationAddress: destinationAddress || userAddress
      });
      
      console.log('✅ processSwapRequest completed with result:', result);
    } catch (swapError) {
      console.error('❌ Error in processSwapRequest:', swapError);
      console.error('Stack:', swapError.stack);
      
      return res.status(500).json({
        success: false,
        error: swapError.message
      });
    }

    if (result && result.success) {
      res.json({
        success: true,
        orderHash: result.orderHash,
        hashLock: result.hashLock,
        secret: result.secret, // In production, this would be kept private until reveal
        srcEscrow: result.srcEscrow,
        dstEscrow: result.dstEscrow,
        message: result.message,
        architecture: '1inch Fusion+',
        nextSteps: [
          '1. Escrows created on both chains',
          '2. Waiting for finality period',
          '3. Secret will be auto-revealed',
          '4. Atomic swap completed'
        ]
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('💥 Swap request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get order status (track cross-chain swap progress)
app.get('/order/:orderHash', (req, res) => {
  try {
    const { orderHash } = req.params;
    const status = resolver.getOrderStatus(orderHash);
    
    if (!status.found) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    // Add human-readable status
    const statusMap = {
      'pending': 'Order created, preparing escrows',
      'escrows_created': 'Escrows deployed, waiting for finality',
      'completed': 'Atomic swap completed successfully',
      'failed': 'Swap failed, funds can be recovered'
    };

    res.json({
      ...status,
      statusDescription: statusMap[status.status] || 'Unknown status',
      architecture: '1inch Fusion+ HTLC'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Get all orders (resolver dashboard)
app.get('/orders', (req, res) => {
  try {
    const orders = resolver.getAllOrders();
    res.json({
      orders,
      count: Object.keys(orders).length,
      resolver: RESOLVER_CONFIG.address,
      architecture: '1inch Fusion+'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Get supported tokens and networks
app.get('/supported', (req, res) => {
  res.json({
    networks: {
      sepolia: {
        name: 'Ethereum Sepolia',
        chainId: 11155111,
        tokens: ['USDC']
      },
      celo: {
        name: 'Celo Alfajores',
        chainId: 44787,
        tokens: ['USDC']
      },
      monad: {
        name: 'Monad Testnet',
        chainId: 10143,
        tokens: ['USDC']
      },
      etherlink: {
        name: 'Etherlink Testnet',
        chainId: 128123,
        tokens: ['USDC']
      },
      tron: {
        name: 'Tron Shasta',
        chainId: 2,
        tokens: ['USDC']
      }
    },
    pairs: [
      { from: 'sepolia', to: 'celo', tokens: ['USDC'] },
      { from: 'celo', to: 'sepolia', tokens: ['USDC'] },
      { from: 'sepolia', to: 'monad', tokens: ['USDC'] },
      { from: 'monad', to: 'sepolia', tokens: ['USDC'] },
      { from: 'sepolia', to: 'etherlink', tokens: ['USDC'] },
      { from: 'etherlink', to: 'sepolia', tokens: ['USDC'] },
      { from: 'celo', to: 'monad', tokens: ['USDC'] },
      { from: 'monad', to: 'celo', tokens: ['USDC'] },
      { from: 'celo', to: 'etherlink', tokens: ['USDC'] },
      { from: 'etherlink', to: 'celo', tokens: ['USDC'] },
      { from: 'monad', to: 'etherlink', tokens: ['USDC'] },
      { from: 'etherlink', to: 'monad', tokens: ['USDC'] },
      { from: 'sepolia', to: 'tron', tokens: ['USDC'] },
      { from: 'tron', to: 'sepolia', tokens: ['USDC'] },
      { from: 'celo', to: 'tron', tokens: ['USDC'] },
      { from: 'tron', to: 'celo', tokens: ['USDC'] },
      { from: 'monad', to: 'tron', tokens: ['USDC'] },
      { from: 'tron', to: 'monad', tokens: ['USDC'] },
      { from: 'etherlink', to: 'tron', tokens: ['USDC'] },
      { from: 'tron', to: 'etherlink', tokens: ['USDC'] }
    ],
    architecture: '1inch Fusion+ Compatible'
  });
});

// Debug endpoint for development
app.get('/debug', (req, res) => {
  res.json({
    resolver: RESOLVER_CONFIG.address,
    activeOrders: Array.from(resolver.activeOrders.keys()),
    config: {
      timeLocks: RESOLVER_CONFIG.timeLocks,
      auction: RESOLVER_CONFIG.auction,
      networks: Object.keys(resolver.providers)
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('💥 Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    architecture: '1inch Fusion+ Mock Resolver'
  });
});

// Start server
const PORT = RESOLVER_CONFIG.port;
app.listen(PORT, () => {
  console.log(`\n🌐 1inch Fusion+ Mock Resolver API`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔗 Resolver: ${RESOLVER_CONFIG.address}`);
  console.log(`\n📖 Available Endpoints:`);
  console.log(`  GET  /health          - Health check`);
  console.log(`  GET  /info            - Resolver information`);
  console.log(`  GET  /supported       - Supported networks and tokens`);
  console.log(`  POST /swap            - Process cross-chain swap`);
  console.log(`  GET  /order/:hash     - Get order status`);
  console.log(`  GET  /orders          - Get all orders`);
  console.log(`  GET  /debug           - Debug information`);
  console.log(`\n🔄 Professional Resolver ready for 1inch Fusion+ orders!`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹️ Shutting down 1inch Fusion+ Resolver...');
  await resolver.stop();
  process.exit(0);
});