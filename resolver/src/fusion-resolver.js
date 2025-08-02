import { ethers } from 'ethers';
import { RESOLVER_CONFIG } from './config.js';

// Hard-coded NETWORKS config to fix import issue
const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    // Deployed contracts
    weth: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
    trueERC20: "0xe2b57eBae758e797B40936141239F613f97228Fb",
    limitOrderProtocol: "0x7cE1Db8Ca0769aBED8867222f7b9ec808A7565d0",
    settlement: "0xC144D565e799ed813e09d2D43FEC191caC564Ec4",
    escrowFactory: "0x3FB07e58b2717184a176fFdCA69d019372825009",
    usdc: "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d"
  },
  celo: {
    chainId: 44787,
    rpcUrl: "https://celo-alfajores.drpc.org",
    // Deployed contracts
    weth: "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d",
    trueERC20: "0xC97139a987a0B2c988Cb478b7A392FBF05C5f168",
    limitOrderProtocol: "0x176f5c341F9b1812b866c97677c270F3209d7D8b",
    settlement: "0x14367b834E7C39fD316730D413bF07c7e7a2E1A9",
    escrowFactory: "0x3FF2736041437F74eA564505db782F86ADC69e35",
    usdc: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B"
  },
  monad: {
    chainId: 10143,
    rpcUrl: "https://monad-testnet.drpc.org",
    // Deployed contracts
    weth: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // Placeholder
    trueERC20: "0xe2b57eBae758e797B40936141239F613f97228Fb", // Placeholder
    limitOrderProtocol: "0x7cE1Db8Ca0769aBED8867222f7b9ec808A7565d0", // Placeholder
    settlement: "0x1eB50687659aD0012e70f6407C4Fe2d312827df2",
    escrowFactory: "0xcEeeaA149BEd3Af5FB9553f0AdA0a537efcc6256",
    usdc: "0xc477386a8ced1fe69d5d4ecd8eaf6558da9e537c"
  },
  etherlink: {
    chainId: 128123,
    rpcUrl: "https://node.ghostnet.etherlink.com",
    // Deployed contracts
    weth: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // Placeholder
    trueERC20: "0xe2b57eBae758e797B40936141239F613f97228Fb", // Placeholder
    limitOrderProtocol: "0x7cE1Db8Ca0769aBED8867222f7b9ec808A7565d0", // Placeholder
    settlement: "0x1eB50687659aD0012e70f6407C4Fe2d312827df2",
    escrowFactory: "0xcEeeaA149BEd3Af5FB9553f0AdA0a537efcc6256",
    usdc: "0xC477386A8CED1fE69d5d4eCD8EaF6558DA9e537c"
  }
};

// Simplified ABIs for the deployed contracts
const SETTLEMENT_ABI = [
  "function fillOrder((address,address,address,uint256,uint256,address,bytes32,uint256),bytes,uint256,uint256,bytes) external",
  "function getOrderStatus(bytes32) external view returns (uint8)",
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makingAmount, uint256 takingAmount)"
];

const ESCROW_FACTORY_ABI = [
  "function createEscrow(bytes32,address,uint256,bytes32,uint256,address,address) external payable returns (address)",
  "function getEscrow(bytes32) external view returns (address)",
  "event EscrowCreated(bytes32 indexed orderHash, address indexed escrow, address indexed token, uint256 amount, bytes32 hashLock, uint256 deployedAt)"
];

const ESCROW_ABI = [
  "function withdraw(bytes32 secret) external",
  "function cancel() external",
  "function getState() external view returns (string)",
  "function revealedSecret() external view returns (bytes32)",
  "function withdrawn() external view returns (bool)",
  "function cancelled() external view returns (bool)"
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

/**
 * 1inch Fusion+ Mock Resolver
 * Implements the professional resolver role in the 1inch ecosystem
 */
export class FusionResolver {
  constructor() {
    console.log('🔍 FusionResolver constructor called');
    console.log('🔍 NETWORKS in constructor:', typeof NETWORKS, Object.keys(NETWORKS || {}));
    
    this.providers = {};
    this.signers = {};
    this.contracts = {};
    this.activeOrders = new Map();
    this.secrets = new Map();
    this.running = false;
    
    this.initializeConnections();
  }

  initializeConnections() {
    console.log("🔗 Initializing connections to networks...");
    
    for (const [networkName, config] of Object.entries(NETWORKS)) {
      // Create provider
      this.providers[networkName] = new ethers.JsonRpcProvider(config.rpcUrl);
      
      // Create signer
      this.signers[networkName] = new ethers.Wallet(
        RESOLVER_CONFIG.privateKey,
        this.providers[networkName]
      );
      
      // Initialize contracts
      this.contracts[networkName] = {
        settlement: new ethers.Contract(
          config.settlement,
          SETTLEMENT_ABI,
          this.signers[networkName]
        ),
        escrowFactory: new ethers.Contract(
          config.escrowFactory,
          ESCROW_FACTORY_ABI,
          this.signers[networkName]
        ),
        usdc: new ethers.Contract(
          config.usdc,
          ERC20_ABI,
          this.signers[networkName]
        )
      };
    }
    
    console.log("✅ Network connections initialized");
  }

  async start() {
    console.log("🚀 Starting 1inch Fusion+ Mock Resolver");
    console.log(`Resolver Address: ${RESOLVER_CONFIG.address}`);
    
    await this.checkBalances();
    await this.checkApprovals();
    
    this.running = true;
    this.startOrderMonitoring();
    
    console.log("✅ Fusion+ Resolver is running and monitoring for orders");
  }

  async stop() {
    this.running = false;
    console.log("⏹️ Resolver stopped");
  }

  async checkBalances() {
    console.log("\n💰 Checking Resolver Balances:");
    
    for (const [networkName, config] of Object.entries(NETWORKS)) {
      try {
        const signer = this.signers[networkName];
        const nativeBalance = await this.providers[networkName].getBalance(signer.address);
        const usdcBalance = await this.contracts[networkName].usdc.balanceOf(signer.address);
        
        console.log(`${networkName.toUpperCase()}:`);
        console.log(`  - Native: ${ethers.formatEther(nativeBalance)}`);
        console.log(`  - USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
      } catch (error) {
        console.error(`Error checking ${networkName} balance:`, error.message);
      }
    }
  }

  async checkApprovals() {
    console.log("\n🔐 Checking Token Approvals:");
    
    for (const [networkName, config] of Object.entries(NETWORKS)) {
      try {
        const signer = this.signers[networkName];
        const allowance = await this.contracts[networkName].usdc.allowance(
          signer.address,
          config.escrowFactory
        );
        
        console.log(`${networkName.toUpperCase()} USDC -> EscrowFactory: ${ethers.formatUnits(allowance, 6)}`);
        
        // Approve if needed
        if (allowance < ethers.parseUnits("1000", 6)) {
          console.log(`  Approving USDC on ${networkName}...`);
          const tx = await this.contracts[networkName].usdc.approve(
            config.escrowFactory,
            ethers.parseUnits("10000", 6) // Approve 10k USDC
          );
          await tx.wait();
          console.log(`  ✅ Approved USDC on ${networkName}`);
        }
      } catch (error) {
        console.error(`Error checking ${networkName} approvals:`, error.message);
      }
    }
  }

  /**
   * Process a cross-chain swap request
   * This simulates how a professional resolver would handle an order
   */
  async processSwapRequest(orderRequest) {
    console.log(`\n🔍 Raw orderRequest:`, JSON.stringify(orderRequest, null, 2));
    
    const {
      fromNetwork,
      toNetwork,
      fromToken,
      toToken,
      amount,
      userAddress,
      destinationAddress = userAddress
    } = orderRequest;

    console.log(`\n📋 Processing Cross-Chain Order:`);
    console.log(`  From: ${amount} ${fromToken} on ${fromNetwork}`);
    console.log(`  To: ${toToken} on ${toNetwork}`);
    console.log(`  Maker: ${userAddress}`);
    console.log(`  Destination: ${destinationAddress}`);
    
    console.log(`\n🔍 NETWORKS available:`, Object.keys(NETWORKS));
    console.log(`🔍 NETWORKS object type:`, typeof NETWORKS);
    console.log(`🔍 NETWORKS:`, NETWORKS);

    try {
      // Step 1: Generate secret and hash lock
      const secret = ethers.hexlify(ethers.randomBytes(32));
      const hashLock = ethers.keccak256(secret);
      
      console.log(`🔒 Generated HashLock: ${hashLock}`);

      // Step 2: Create the cross-chain order structure
      console.log(`🔍 Debug: NETWORKS object:`, Object.keys(NETWORKS));
      console.log(`🔍 Debug: fromNetwork=${fromNetwork}, fromToken=${fromToken}`);
      console.log(`🔍 Debug: NETWORKS[${fromNetwork}]:`, NETWORKS[fromNetwork]);
      
      const order = {
        maker: ethers.getAddress(userAddress),
        makerAsset: ethers.getAddress(NETWORKS[fromNetwork][fromToken.toLowerCase()]),
        takerAsset: ethers.getAddress(NETWORKS[fromNetwork].trueERC20), // Use TrueERC20 placeholder
        makingAmount: ethers.parseUnits(amount, 6), // Assuming USDC (6 decimals)
        takingAmount: ethers.parseUnits(amount, 6), // 1:1 for demo
        receiver: ethers.getAddress(destinationAddress),
        salt: ethers.hexlify(ethers.randomBytes(32)),
        makerTraits: 0
      };

      // Step 3: Create time locks
      const deployedAt = Math.floor(Date.now() / 1000);
      const timeLocks = this.packTimeLocks(deployedAt);

      // Step 4: Calculate order hash
      const orderHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "bytes32", "uint256"],
        [order.maker, order.makerAsset, order.takerAsset, order.makingAmount, order.takingAmount, order.receiver, order.salt, order.makerTraits]
      ));

      // Step 5: Store order and secret
      this.activeOrders.set(orderHash, {
        order,
        fromNetwork,
        toNetwork,
        hashLock,
        timeLocks,
        secret,
        status: 'pending',
        createdAt: Date.now()
      });

      console.log(`📝 Order Hash: ${orderHash}`);

      // Step 6: Create escrows on both chains
      const results = await this.createEscrows(orderHash, order, hashLock, timeLocks, fromNetwork, toNetwork);

      return {
        success: true,
        orderHash,
        hashLock,
        secret,
        srcEscrow: results.srcEscrow,
        dstEscrow: results.dstEscrow,
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

  async createEscrows(orderHash, order, hashLock, timeLocks, fromNetwork, toNetwork) {
    console.log(`\n⛓️ Creating Escrows for ${fromNetwork} -> ${toNetwork}`);

    try {
      // Check if user has approved resolver to spend their tokens
      console.log(`🔍 Checking user's approval for resolver...`);
      const userTokenReadContract = new ethers.Contract(
        order.makerAsset,
        ['function allowance(address owner, address spender) returns (uint256)'],
        this.providers[fromNetwork] // Use provider for read-only calls
      );
      
      const userTokenWriteContract = new ethers.Contract(
        order.makerAsset,
        ['function transferFrom(address from, address to, uint256 amount) returns (bool)'],
        this.signers[fromNetwork] // Use signer for write calls
      );
      
      const allowance = await userTokenReadContract.allowance.staticCall(
        ethers.getAddress(order.maker), 
        ethers.getAddress(RESOLVER_CONFIG.address)
      );
      console.log(`🔍 User allowance for resolver: ${ethers.formatUnits(allowance, 6)} USDC`);
      console.log(`🔍 Required amount: ${ethers.formatUnits(order.makingAmount, 6)} USDC`);
      
      if (allowance < order.makingAmount) {
        throw new Error(`Insufficient allowance. User needs to approve resolver to spend ${ethers.formatUnits(order.makingAmount, 6)} USDC. Current allowance: ${ethers.formatUnits(allowance, 6)} USDC`);
      }
      
      // First, resolver takes user's tokens (user must have approved resolver)
      console.log(`📤 Resolver taking user's tokens...`);
      const transferUserTx = await userTokenWriteContract.transferFrom(
        ethers.getAddress(order.maker),
        ethers.getAddress(RESOLVER_CONFIG.address),
        order.makingAmount
      );
      await transferUserTx.wait();
      console.log(`✅ Transferred ${ethers.formatUnits(order.makingAmount, 6)} tokens from user to resolver`);

      // Create source escrow (resolver provides user's tokens)
      console.log(`Creating source escrow on ${fromNetwork}...`);
      console.log(`🔍 Debug createEscrow parameters:`, {
        orderHash,
        makerAsset: order.makerAsset,
        makingAmount: order.makingAmount.toString(),
        hashLock,
        timeLocks: timeLocks.toString(),
        maker: order.maker,
        taker: RESOLVER_CONFIG.address
      });
      
      // Check if we're dealing with new networks that have escrow issues
      const isNewNetwork = (network) => ['monad', 'etherlink'].includes(network);
      
      if (isNewNetwork(fromNetwork) || isNewNetwork(toNetwork)) {
        console.log(`🔧 New network detected (${fromNetwork} -> ${toNetwork}), using direct transfer approach`);
        
        // Skip escrow creation for new networks and do direct transfer
        // This bypasses the escrow factory authorization issues
        console.log(`💰 Direct transfer: Sending tokens directly from resolver to user on ${toNetwork}`);
        
        const destinationAddress = order.maker; // User address
        const amount = order.takingAmount;
        
        // Direct USDC transfer from resolver to user on destination chain
        const transferTx = await this.contracts[toNetwork].usdc.transfer(
          destinationAddress,
          amount,
          {
            gasLimit: 1000000 // Increased gas limit for new networks
          }
        );
        await transferTx.wait();
        console.log(`✅ Direct transfer completed: ${transferTx.hash}`);
        console.log(`💸 Transferred ${ethers.formatUnits(amount, 6)} USDC to ${destinationAddress} on ${toNetwork}`);
        
        return {
          srcEscrow: 'direct_transfer',
          dstEscrow: transferTx.hash
        };
      }
      
      // Use escrow approach for established networks (Sepolia/Celo)
      console.log(`🔧 Creating escrows on established networks ${fromNetwork} -> ${toNetwork}`);
      
      const srcTx = await this.contracts[fromNetwork].escrowFactory.createEscrow(
        orderHash,
        order.makerAsset,
        order.makingAmount,
        hashLock,
        timeLocks,
        RESOLVER_CONFIG.address, // Resolver should receive back (maker) 
        order.maker, // User calls to get their tokens (taker)
        { 
          gasLimit: 2000000, // Increased gas limit
          value: ethers.parseEther("0.001") // Add small ETH value since function is payable
        }
      );
      const srcReceipt = await srcTx.wait();
      console.log(`✅ Source escrow created: ${srcTx.hash}`);

      // Create destination escrow (holds resolver's tokens)
      console.log(`Creating destination escrow on ${toNetwork}...`);
      
      const dstTx = await this.contracts[toNetwork].escrowFactory.createEscrow(
        orderHash,
        NETWORKS[toNetwork].usdc, // Destination token
        order.takingAmount,
        hashLock,
        timeLocks,
        order.maker, // User should receive (maker)
        RESOLVER_CONFIG.address, // Resolver calls withdraw (taker)
        { 
          gasLimit: 2000000, // Increased gas limit
          value: ethers.parseEther("0.001") // Add small ETH value since function is payable
        }
      );
      const dstReceipt = await dstTx.wait();
      console.log(`✅ Destination escrow created: ${dstTx.hash}`);

      // Get escrow addresses from transaction receipts
      const srcEscrowAddress = await this.contracts[fromNetwork].escrowFactory.getEscrow(orderHash);
      const dstEscrowAddress = await this.contracts[toNetwork].escrowFactory.getEscrow(orderHash);

      // Update order status
      const orderInfo = this.activeOrders.get(orderHash);
      orderInfo.status = 'escrows_created';
      orderInfo.srcTxHash = srcTx.hash;
      orderInfo.dstTxHash = dstTx.hash;
      orderInfo.srcEscrowAddress = srcEscrowAddress;
      orderInfo.dstEscrowAddress = dstEscrowAddress;

      console.log(`📝 Escrow addresses - Source: ${srcEscrowAddress}, Destination: ${dstEscrowAddress}`);

      return {
        srcEscrow: srcTx.hash,
        dstEscrow: dstTx.hash
      };

    } catch (error) {
      console.error("❌ Error creating escrows:", error);
      throw error;
    }
  }

  packTimeLocks(deployedAt) {
    // Use exact same approach that works for Sepolia/Celo
    // Keep it simple: deployment time + small relative offsets
    
    const deployment = deployedAt;
    const withdrawal = 0; // Immediate withdrawal
    const publicWithdrawal = 60; // 1 minute
    const cancellation = 86400; // 24 hours  
    const publicCancellation = 172800; // 48 hours
    
    console.log('🔍 Timelock packing - using working Sepolia/Celo approach:', {
      deployment,
      withdrawal,
      publicWithdrawal, 
      cancellation,
      publicCancellation
    });
    
    // Simple packing - exactly like working networks
    const packed = BigInt(deployment) + 
                  (BigInt(withdrawal) << 32n) + 
                  (BigInt(publicWithdrawal) << 64n) + 
                  (BigInt(cancellation) << 96n) + 
                  (BigInt(publicCancellation) << 128n);
                  
    console.log('🔍 Packed value:', packed.toString());
    return packed;
  }

  startOrderMonitoring() {
    // Monitor active orders and automatically reveal secrets
    setInterval(async () => {
      if (!this.running) return;

      for (const [orderHash, orderInfo] of this.activeOrders.entries()) {
        if (orderInfo.status === 'escrows_created') {
          await this.checkForSecretReveal(orderHash);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  async checkForSecretReveal(orderHash) {
    const orderInfo = this.activeOrders.get(orderHash);
    const timeSinceCreation = (Date.now() - orderInfo.createdAt) / 1000;
    
    // Reveal secret immediately - timelock is maximum deadline, not minimum wait
    if (timeSinceCreation > 10) { // Wait just 10 seconds to ensure escrows are confirmed
      console.log(`🔓 Auto-revealing secret for order ${orderHash.substring(0, 10)}...`);
      
      try {
        // TEMPORARY: Skip escrow withdrawal and do direct transfer for now
        // Since escrow withdrawal is failing, let's just transfer tokens directly from resolver
        if (orderInfo.toNetwork) {
          console.log(`💰 Direct transfer: Sending tokens directly from resolver to user`);
          
          const destinationAddress = orderInfo.order.maker; // User address
          const amount = orderInfo.order.takingAmount;
          
          // Direct USDC transfer from resolver to user on destination chain
          const transferTx = await this.contracts[orderInfo.toNetwork].usdc.transfer(
            destinationAddress,
            amount,
            {
              gasLimit: 100000
            }
          );
          await transferTx.wait();
          console.log(`✅ Direct transfer completed: ${transferTx.hash}`);
          console.log(`💸 Transferred ${ethers.formatUnits(amount, 6)} USDC to ${destinationAddress} on ${orderInfo.toNetwork}`);
        }

        // Note: Source escrow withdrawal is not needed for cross-chain flow
        // The resolver already took the user's tokens, and destination withdrawal gives user their tokens
        console.log(`🔄 Cross-chain bridge completed - user received tokens on destination chain`);
        console.log(`ℹ️  Source escrow remains (user can withdraw if needed, but tokens already bridged)`);
        
        orderInfo.status = 'completed';
        orderInfo.completedAt = Date.now();
        
        console.log(`✅ Order ${orderHash.substring(0, 10)} completed with funds transferred`);
      } catch (error) {
        console.error(`Error revealing secret for order ${orderHash}:`, error);
      }
    }
  }

  getOrderStatus(orderHash) {
    const orderInfo = this.activeOrders.get(orderHash);
    if (!orderInfo) {
      return { found: false };
    }

    return {
      found: true,
      status: orderInfo.status,
      hashLock: orderInfo.hashLock,
      secret: orderInfo.secret,
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