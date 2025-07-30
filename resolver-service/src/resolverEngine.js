import { ethers } from 'ethers';
import * as StellarSdk from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger.js';
import { EthereumFusionManager } from './chains/ethereumFusionManager.js';
import { StellarEscrowManager } from './chains/stellarEscrowManager.js';
import { generateSecret, hashSecret } from './utils/crypto.js';

export class ResolverEngine {
  constructor() {
    this.orders = new Map(); // In-memory order storage (use database in production)
    this.ethereumManager = new EthereumFusionManager();
    this.stellarManager = new StellarEscrowManager();
    
    logger.info('Resolver Engine initialized with 1inch Fusion+ integration');
  }

  /**
   * Generate a quote for a cross-chain swap
   */
  async generateQuote(request) {
    const { srcChain, dstChain, srcToken, dstToken, amount } = request;
    
    // Validate chains
    if (!['ethereum', 'stellar'].includes(srcChain) || !['ethereum', 'stellar'].includes(dstChain)) {
      throw new Error('Unsupported chain');
    }

    if (srcChain === dstChain) {
      throw new Error('Source and destination chains must be different');
    }

    // For USDC-to-USDC cross-chain, we'll use 1:1 ratio minus fees
    const exchangeRate = 0.998; // 0.2% fee for resolver
    const dstAmount = (parseFloat(amount) * exchangeRate).toFixed(6);
    
    // Calculate estimated time (based on block times)
    const estimatedTime = srcChain === 'ethereum' ? 
      5 * 60 : // Ethereum to Stellar: ~5 minutes
      3 * 60;  // Stellar to Ethereum: ~3 minutes

    const quote = {
      id: uuidv4(),
      srcChain,
      dstChain,
      srcToken,
      dstToken,
      srcAmount: amount,
      dstAmount,
      exchangeRate: exchangeRate.toString(),
      estimatedTime,
      fee: (parseFloat(amount) * 0.002).toFixed(6), // 0.2% fee
      validUntil: Date.now() + 5 * 60 * 1000, // Valid for 5 minutes
      timestamp: Date.now()
    };

    logger.info('Quote generated', {
      quoteId: quote.id,
      srcChain,
      dstChain,
      srcAmount: amount,
      dstAmount
    });

    return quote;
  }

  /**
   * Create a new cross-chain swap order and execute it
   */
  async createOrder(orderRequest) {
    const orderId = orderRequest.orderId || uuidv4();
    
    // Generate cryptographic materials for HTLC
    const secret = generateSecret();
    const hashLock = hashSecret(secret);
    
    // Create order object
    const order = {
      id: orderId,
      ...orderRequest,
      secret,
      hashLock,
      status: 'created',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      escrows: {
        source: null,
        destination: null
      },
      events: []
    };

    // Store order
    this.orders.set(orderId, order);
    
    logger.info('Order created', {
      orderId,
      srcChain: order.srcChain,
      dstChain: order.dstChain,
      amount: order.amount,
      hashLock: hashLock.toString('hex')
    });

    // Start the swap execution process
    this.executeSwap(order).catch(error => {
      logger.error('Swap execution failed', {
        orderId,
        error: error.message
      });
      this.updateOrderStatus(orderId, 'failed', error.message);
    });

    return {
      orderId,
      status: order.status,
      hashLock: hashLock.toString('hex'),
      createdAt: order.createdAt
    };
  }

  /**
   * Execute the complete cross-chain swap with proper atomic flow
   */
  async executeSwap(order) {
    try {
      this.updateOrderStatus(order.id, 'processing', 'Starting cross-chain atomic swap');
      
      // The flow depends on the direction of the swap
      if (order.srcChain === 'ethereum' && order.dstChain === 'stellar') {
        await this.executeEthereumToStellarSwap(order);
      } else if (order.srcChain === 'stellar' && order.dstChain === 'ethereum') {
        await this.executeStellarToEthereumSwap(order);
      } else {
        throw new Error(`Unsupported swap direction: ${order.srcChain} → ${order.dstChain}`);
      }

      logger.info('Atomic swap execution completed', { orderId: order.id });

    } catch (error) {
      logger.error('Atomic swap execution error', {
        orderId: order.id,
        error: error.message,
        stack: error.stack
      });
      
      this.updateOrderStatus(order.id, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Execute Ethereum → Stellar atomic swap
   * 1. User creates 1inch order on Ethereum
   * 2. Resolver creates escrow on Stellar  
   * 3. Resolver fills 1inch order (reveals secret)
   * 4. User claims Stellar escrow
   */
  async executeEthereumToStellarSwap(order) {
    // Step 1: Wait for user to create 1inch order on Ethereum
    // (In production, this would be monitored via events)
    logger.info('Waiting for user to create 1inch order on Ethereum', {
      orderId: order.id,
      maker: order.makerAddress,
      amount: order.amount
    });
    
    // For demo, we'll simulate the user creating the order
    const userOrderId = await this.simulateUserOrder(order, 'ethereum');
    order.escrows.source = userOrderId;
    this.updateOrderStatus(order.id, 'user_order_created', `User 1inch order created: ${userOrderId}`);

    // Step 2: Resolver creates escrow on Stellar (provides liquidity)
    logger.info('Resolver creating Stellar escrow', {
      orderId: order.id,
      dstChain: order.dstChain
    });

    const stellarEscrowId = await this.stellarManager.createEscrow({
      orderId: order.id,
      maker: process.env.RESOLVER_STELLAR_ADDRESS, // Resolver provides liquidity
      token: order.dstToken,
      amount: order.dstAmount,
      hashLock: order.hashLock,
      timelock: 1800 // 30 minutes
    });

    order.escrows.destination = stellarEscrowId;
    this.updateOrderStatus(order.id, 'resolver_escrow_created', `Resolver Stellar escrow: ${stellarEscrowId}`);

    // Wait for confirmations
    await this.waitForEscrowConfirmation('stellar', stellarEscrowId);

    // Step 3: Resolver fills user's 1inch order (reveals secret)
    logger.info('Resolver filling user 1inch order', {
      orderId: order.id,
      userOrderId
    });

    await this.ethereumManager.fillFusionOrder(userOrderId, order, order.secret);
    this.updateOrderStatus(order.id, 'ethereum_order_filled', 'Resolver filled 1inch order, secret revealed');

    // Step 4: User can now claim Stellar escrow using revealed secret
    // (User will do this independently using the revealed secret)
    this.updateOrderStatus(order.id, 'ready_for_claim', 'User can now claim Stellar escrow with revealed secret');
    
    // Mark as completed after delay (simulating user claim)
    setTimeout(() => {
      this.updateOrderStatus(order.id, 'completed', 'Ethereum→Stellar atomic swap completed');
    }, 30000);
  }

  /**
   * Execute Stellar → Ethereum atomic swap  
   * 1. User creates escrow on Stellar
   * 2. Resolver creates 1inch order on Ethereum
   * 3. Resolver claims Stellar escrow (reveals secret)
   * 4. User fills 1inch order
   */
  async executeStellarToEthereumSwap(order) {
    // Step 1: Wait for user to create escrow on Stellar
    logger.info('Waiting for user to create Stellar escrow', {
      orderId: order.id,
      maker: order.makerAddress,
      amount: order.amount
    });
    
    // For demo, simulate user creating escrow
    const userEscrowId = await this.simulateUserEscrow(order, 'stellar');
    order.escrows.source = userEscrowId;
    this.updateOrderStatus(order.id, 'user_escrow_created', `User Stellar escrow created: ${userEscrowId}`);

    // Step 2: Resolver creates 1inch order on Ethereum (provides liquidity)
    logger.info('Resolver creating 1inch order on Ethereum', {
      orderId: order.id,
      dstChain: order.dstChain
    });

    const ethereumOrderId = await this.ethereumManager.createFusionOrder({
      orderId: order.id,
      maker: process.env.RESOLVER_ETHEREUM_ADDRESS, // Resolver provides liquidity
      srcToken: order.dstToken,
      dstToken: order.srcToken, // Swapped for resolver order
      srcAmount: order.dstAmount,
      dstAmount: order.amount,
      hashLock: order.hashLock,
      timelock: 1800
    });

    order.escrows.destination = ethereumOrderId;
    this.updateOrderStatus(order.id, 'resolver_order_created', `Resolver 1inch order: ${ethereumOrderId}`);

    // Wait for confirmations  
    await this.waitForEscrowConfirmation('ethereum', ethereumOrderId);

    // Step 3: Resolver claims Stellar escrow (reveals secret)
    logger.info('Resolver claiming Stellar escrow', {
      orderId: order.id,
      userEscrowId
    });

    await this.stellarManager.claimEscrow(userEscrowId, order.secret);
    this.updateOrderStatus(order.id, 'stellar_escrow_claimed', 'Resolver claimed Stellar escrow, secret revealed');

    // Step 4: User can now fill 1inch order using revealed secret
    this.updateOrderStatus(order.id, 'ready_for_fill', 'User can now fill 1inch order with revealed secret');
    
    // Mark as completed after delay (simulating user fill)
    setTimeout(() => {
      this.updateOrderStatus(order.id, 'completed', 'Stellar→Ethereum atomic swap completed');
    }, 30000);
  }

  /**
   * Simulate user creating order/escrow (for demo purposes)
   * In production, this would be monitored via blockchain events
   */
  async simulateUserOrder(order, chain) {
    if (chain === 'ethereum') {
      // Simulate user creating 1inch order
      logger.info('Simulating user 1inch order creation', {
        maker: order.makerAddress,
        srcToken: order.srcToken,
        amount: order.amount,
        hashLock: order.hashLock.toString('hex')
      });
      return `user-1inch-order-${Date.now()}`;
    }
    return null;
  }

  async simulateUserEscrow(order, chain) {
    if (chain === 'stellar') {
      // Simulate user creating Stellar escrow
      logger.info('Simulating user Stellar escrow creation', {
        maker: order.makerAddress,
        token: order.srcToken,
        amount: order.amount,
        hashLock: order.hashLock.toString('hex')
      });
      return `user-stellar-escrow-${Date.now()}`;
    }
    return null;
  }

  /**
   * Wait for escrow confirmation on blockchain
   */
  async waitForEscrowConfirmation(chain, escrowId) {
    // In production, this would monitor blockchain events
    // For demo, we'll use a simple delay
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second wait
    
    logger.info('Escrow confirmed', { chain, escrowId });
  }

  /**
   * Update order status and add event
   */
  updateOrderStatus(orderId, status, message) {
    const order = this.orders.get(orderId);
    if (!order) return;

    order.status = status;
    order.updatedAt = Date.now();
    order.events.push({
      timestamp: Date.now(),
      status,
      message
    });

    logger.info('Order status updated', {
      orderId,
      status,
      message
    });
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId) {
    const order = this.orders.get(orderId);
    if (!order) return null;

    return {
      id: order.id,
      status: order.status,
      srcChain: order.srcChain,
      dstChain: order.dstChain,
      amount: order.amount,
      dstAmount: order.dstAmount,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      escrows: order.escrows,
      events: order.events
    };
  }

  /**
   * Get all active orders
   */
  async getActiveOrders() {
    const orders = Array.from(this.orders.values());
    return orders.map(order => ({
      id: order.id,
      status: order.status,
      srcChain: order.srcChain,
      dstChain: order.dstChain,
      amount: order.amount,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    }));
  }
} 