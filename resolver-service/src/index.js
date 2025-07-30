import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ResolverEngine } from './resolverEngine.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize resolver engine
const resolverEngine = new ResolverEngine();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Get quote for a cross-chain swap
app.post('/api/quote', async (req, res) => {
  try {
    const { srcChain, dstChain, srcToken, dstToken, amount } = req.body;
    
    logger.info('Quote request received', {
      srcChain,
      dstChain,
      srcToken,
      dstToken,
      amount
    });

    const quote = await resolverEngine.generateQuote({
      srcChain,
      dstChain,
      srcToken,
      dstToken,
      amount
    });

    res.json(quote);
  } catch (error) {
    logger.error('Quote generation failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Create a new cross-chain swap order
app.post('/api/orders', async (req, res) => {
  try {
    const orderRequest = req.body;
    
    logger.info('Order creation request received', {
      orderId: orderRequest.orderId,
      srcChain: orderRequest.srcChain,
      dstChain: orderRequest.dstChain,
      amount: orderRequest.amount
    });

    const order = await resolverEngine.createOrder(orderRequest);

    res.json(order);
  } catch (error) {
    logger.error('Order creation failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get order status
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await resolverEngine.getOrderStatus(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    logger.error('Failed to get order status', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get all active orders (for debugging)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await resolverEngine.getActiveOrders();
    res.json(orders);
  } catch (error) {
    logger.error('Failed to get orders', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  logger.info(`Stellar Fusion+ Resolver Service running on port ${port}`);
  logger.info('Environment:', {
    nodeEnv: process.env.NODE_ENV || 'development',
    ethereumRpc: process.env.ETHEREUM_RPC_URL ? 'configured' : 'missing',
    stellarNetwork: process.env.STELLAR_NETWORK || 'testnet'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
}); 