import { BlockchainManager } from './blockchain.js';
import { RESOLVER_CONFIG, NETWORKS } from './config.js';

export class CrossChainResolver {
  constructor() {
    this.blockchain = new BlockchainManager();
    this.activeOrders = new Map(); // orderHash -> order data
    this.secrets = new Map(); // orderHash -> secret
    this.running = false;
  }

  async start() {
    console.log("🚀 Starting Cross-Chain Resolver...");
    console.log(`Resolver Address: ${RESOLVER_CONFIG.address}`);
    
    // Check balances
    await this.checkBalances();
    
    this.running = true;
    this.startMonitoring();
    
    console.log("✅ Resolver is now running and monitoring for orders");
  }

  async stop() {
    this.running = false;
    console.log("⏹️ Resolver stopped");
  }

  async checkBalances() {
    console.log("\n💰 Checking Resolver Balances:");
    
    for (const [networkName, config] of Object.entries(NETWORKS)) {
      try {
        const ethBalance = await this.blockchain.getBalance(networkName);
        const usdcBalance = await this.blockchain.getBalance(networkName, config.usdc);
        
        console.log(`${networkName.toUpperCase()}:`);
        console.log(`  - Native Token: ${ethBalance}`);
        console.log(`  - USDC: ${usdcBalance}`);
      } catch (error) {
        console.error(`Error checking balance on ${networkName}:`, error.message);
      }
    }
    console.log("");
  }

  async processSwapRequest(swapRequest) {
    const {
      fromNetwork,
      toNetwork,
      fromToken,
      toToken,
      amount,
      userAddress,
      destinationAddress
    } = swapRequest;

    console.log(`\n📋 Processing swap request:`);
    console.log(`  From: ${amount} ${fromToken} on ${fromNetwork}`);
    console.log(`  To: ${toToken} on ${toNetwork}`);
    console.log(`  User: ${userAddress}`);
    console.log(`  Destination: ${destinationAddress}`);

    try {
      // Generate secret for this swap
      const secret = this.blockchain.generateSecret();
      const hashLock = this.blockchain.hashSecret(secret);
      
      console.log(`🔒 Generated hashLock: ${hashLock}`);

      // Create order data
      const orderData = {
        maker: userAddress,
        makerAsset: NETWORKS[fromNetwork][fromToken.toLowerCase()],
        takerAsset: NETWORKS[toNetwork][toToken.toLowerCase()],
        makingAmount: amount,
        takingAmount: amount, // 1:1 for demo
        receiver: destinationAddress,
        salt: this.blockchain.generateSecret(),
        makerTraits: 0
      };

      // Create cross-chain data
      const crossChainData = {
        dstChainId: NETWORKS[toNetwork].chainId,
        dstToken: NETWORKS[toNetwork][toToken.toLowerCase()],
        hashLock: hashLock,
        timeLocks: this.blockchain.packTimeLocks(RESOLVER_CONFIG.timeLocks),
        srcSafetyDeposit: RESOLVER_CONFIG.safetyDeposit.src,
        dstSafetyDeposit: RESOLVER_CONFIG.safetyDeposit.dst
      };

      // Calculate order hash
      const orderHash = this.calculateOrderHash(orderData);
      
      // Store order and secret
      this.activeOrders.set(orderHash, {
        orderData,
        crossChainData,
        fromNetwork,
        toNetwork,
        status: 'pending',
        createdAt: Date.now()
      });
      this.secrets.set(orderHash, secret);

      console.log(`📝 Order created with hash: ${orderHash}`);

      // Step 1: Create escrow on source chain
      console.log(`\n⛓️ Creating escrow on ${fromNetwork}...`);
      const srcResult = await this.blockchain.createEscrow(
        fromNetwork,
        orderData,
        crossChainData
      );

      if (!srcResult.success) {
        throw new Error(`Failed to create source escrow: ${srcResult.error}`);
      }

      console.log(`✅ Source escrow created: ${srcResult.txHash}`);

      // Step 2: Create escrow on destination chain
      console.log(`\n⛓️ Creating escrow on ${toNetwork}...`);
      const dstResult = await this.blockchain.createEscrow(
        toNetwork,
        orderData,
        crossChainData
      );

      if (!dstResult.success) {
        throw new Error(`Failed to create destination escrow: ${dstResult.error}`);
      }

      console.log(`✅ Destination escrow created: ${dstResult.txHash}`);

      // Update order status
      const orderInfo = this.activeOrders.get(orderHash);
      orderInfo.status = 'escrows_created';
      orderInfo.srcTxHash = srcResult.txHash;
      orderInfo.dstTxHash = dstResult.txHash;

      return {
        success: true,
        orderHash,
        srcTxHash: srcResult.txHash,
        dstTxHash: dstResult.txHash,
        hashLock,
        message: "Cross-chain escrows created successfully"
      };

    } catch (error) {
      console.error("❌ Error processing swap request:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async revealSecret(orderHash) {
    const secret = this.secrets.get(orderHash);
    const orderInfo = this.activeOrders.get(orderHash);

    if (!secret || !orderInfo) {
      throw new Error("Order not found");
    }

    console.log(`\n🔓 Revealing secret for order ${orderHash}`);

    try {
      // Complete swap on both chains
      const srcResult = await this.blockchain.completeSwap(
        orderInfo.fromNetwork,
        orderHash,
        secret
      );

      const dstResult = await this.blockchain.completeSwap(
        orderInfo.toNetwork,
        orderHash,
        secret
      );

      orderInfo.status = 'completed';
      orderInfo.completedAt = Date.now();

      console.log(`✅ Secret revealed and swaps completed`);
      console.log(`  Source: ${srcResult.txHash}`);
      console.log(`  Destination: ${dstResult.txHash}`);

      return {
        success: true,
        secret,
        srcTxHash: srcResult.txHash,
        dstTxHash: dstResult.txHash
      };

    } catch (error) {
      console.error("❌ Error revealing secret:", error);
      throw error;
    }
  }

  startMonitoring() {
    // Monitor for escrow states and automatic secret revelation
    setInterval(async () => {
      if (!this.running) return;

      for (const [orderHash, orderInfo] of this.activeOrders.entries()) {
        if (orderInfo.status === 'escrows_created') {
          await this.checkAndRevealSecret(orderHash);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  async checkAndRevealSecret(orderHash) {
    const orderInfo = this.activeOrders.get(orderHash);
    
    try {
      // Get escrow addresses
      const srcEscrow = await this.blockchain.getEscrowAddress(orderInfo.fromNetwork, orderHash);
      const dstEscrow = await this.blockchain.getEscrowAddress(orderInfo.toNetwork, orderHash);

      // Check if both escrows are in withdrawal period
      const srcState = await this.blockchain.getEscrowState(orderInfo.fromNetwork, srcEscrow);
      const dstState = await this.blockchain.getEscrowState(orderInfo.toNetwork, dstEscrow);

      if (srcState === 'private_withdrawal' && dstState === 'private_withdrawal') {
        console.log(`🔄 Both escrows ready for withdrawal, revealing secret for ${orderHash}`);
        await this.revealSecret(orderHash);
      }
    } catch (error) {
      console.error(`Error checking escrow states for ${orderHash}:`, error);
    }
  }

  calculateOrderHash(orderData) {
    // Simplified order hash calculation
    const encoded = JSON.stringify(orderData) + Date.now();
    return this.blockchain.hashSecret(encoded);
  }

  getOrderStatus(orderHash) {
    const orderInfo = this.activeOrders.get(orderHash);
    if (!orderInfo) {
      return { found: false };
    }

    return {
      found: true,
      status: orderInfo.status,
      createdAt: orderInfo.createdAt,
      completedAt: orderInfo.completedAt,
      srcTxHash: orderInfo.srcTxHash,
      dstTxHash: orderInfo.dstTxHash
    };
  }

  getAllOrders() {
    const orders = {};
    for (const [orderHash, orderInfo] of this.activeOrders.entries()) {
      orders[orderHash] = {
        status: orderInfo.status,
        fromNetwork: orderInfo.fromNetwork,
        toNetwork: orderInfo.toNetwork,
        createdAt: orderInfo.createdAt,
        completedAt: orderInfo.completedAt
      };
    }
    return orders;
  }
}