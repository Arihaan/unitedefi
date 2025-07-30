import { ethers } from 'ethers';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Contract, TransactionBuilder, TimeoutInfinite } from '@stellar/stellar-sdk';
import {
  CrossChainSwapOrder,
  SwapRequest,
  SwapQuote,
  SwapProgress,
  SwapStep,
  ResolverConfig,
  CreateOrderResponse,
  ContractInteractionError
} from '../types';
import { generateSecret, hashSecret, generateOrderHash, generateNonce, toBytes32, secretToBytes } from '../utils/crypto';
import { ETHEREUM_ESCROW_ABI, ERC20_ABI } from '../utils/config';

export class ResolverService {
  private static instance: ResolverService;
  private activeOrders: Map<string, CrossChainSwapOrder> = new Map();
  private progressListeners: Map<string, (progress: SwapProgress) => void> = new Map();

  // Resolver configuration
  private resolverConfig: ResolverConfig = {
    ethereumRpcUrl: process.env.REACT_APP_ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
    stellarRpcUrl: 'https://horizon-testnet.stellar.org',
    privateKeys: {
      ethereum: process.env.REACT_APP_RESOLVER_ETH_PRIVATE_KEY || '',
      stellar: process.env.REACT_APP_RESOLVER_STELLAR_SECRET || ''
    },
    contracts: {
      ethereumEscrow: process.env.REACT_APP_ETHEREUM_ESCROW_ADDRESS || '',
      stellarEscrow: process.env.REACT_APP_STELLAR_ESCROW_ADDRESS || ''
    },
    tokens: {
      ethereumUSDC: process.env.REACT_APP_ETHEREUM_USDC_ADDRESS || '',
      stellarUSDC: process.env.REACT_APP_STELLAR_USDC_ADDRESS || ''
    }
  };

  private constructor() {}

  static getInstance(): ResolverService {
    if (!ResolverService.instance) {
      ResolverService.instance = new ResolverService();
    }
    return ResolverService.instance;
  }

  /**
   * Get a quote for a cross-chain swap
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    // Simplified quote - in production this would query liquidity and calculate optimal rates
    const srcAmount = request.amount;
    const dstAmount = request.amount; // 1:1 for demo purposes
    
    return {
      srcAmount,
      dstAmount,
      estimatedGas: '0.01', // ETH or XLM
      timelock: 1800, // 30 minutes
      expiry: Date.now() + 300000 // Quote valid for 5 minutes
    };
  }

  /**
   * Create a new cross-chain swap order
   */
  async createOrder(swapRequest: SwapRequest): Promise<CreateOrderResponse> {
    const secret = generateSecret();
    const hashLock = hashSecret(secret);
    const orderId = generateNonce();

    // Create quote first
    const quote = await this.getQuote(swapRequest);

    // Create final order
    const finalOrder: CrossChainSwapOrder = {
      id: orderId,
      maker: 'user-address', // This would come from wallet
      srcChain: swapRequest.srcChain,
      dstChain: swapRequest.dstChain,
      srcToken: swapRequest.srcToken,
      dstToken: swapRequest.dstToken,
      srcAmount: swapRequest.amount,
      dstAmount: swapRequest.amount, // Simplified for demo
      hashLock,
      secret,
      timelock: Date.now() + 1800000,
      status: 'pending',
      createdAt: Date.now()
    };

    this.activeOrders.set(orderId, finalOrder);

    // Start the cross-chain swap process
    this.executeSwap(orderId);

    return {
      orderId,
      secret,
      hashLock,
      timelock: 1800
    };
  }

  /**
   * Execute the cross-chain swap (real resolver logic)
   */
  private async executeSwap(orderId: string): Promise<void> {
    const order = this.activeOrders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const steps: SwapStep[] = [
      {
        id: 'approve-src',
        title: 'Approve source token',
        description: 'Approve escrow contract to spend tokens',
        status: 'pending'
      },
      {
        id: 'create-src-escrow',
        title: 'Create source escrow',
        description: 'Lock tokens on source chain',
        status: 'pending'
      },
      {
        id: 'create-dst-escrow',
        title: 'Create destination escrow',
        description: 'Lock tokens on destination chain',
        status: 'pending'
      },
      {
        id: 'reveal-secret',
        title: 'Reveal secret',
        description: 'Complete the atomic swap',
        status: 'pending'
      }
    ];

    const progress: SwapProgress = {
      orderId,
      steps,
      currentStep: 0,
      completed: false,
      failed: false
    };

    this.updateProgress(orderId, progress);

    try {
      // Step 1: Approval (handled by frontend)
      await this.updateStepStatus(orderId, 0, 'completed');

      // Step 2: Create source chain escrow
      await this.updateStepStatus(orderId, 1, 'in-progress');
      const srcEscrowId = await this.createSourceEscrow(order);
      order.ethereumEscrowId = order.srcChain === 'ethereum' ? srcEscrowId : undefined;
      order.stellarEscrowId = order.srcChain === 'stellar' ? srcEscrowId : undefined;
      await this.updateStepStatus(orderId, 1, 'completed');

      // Step 3: Create destination chain escrow (resolver provides liquidity)
      await this.updateStepStatus(orderId, 2, 'in-progress');
      const dstEscrowId = await this.createDestinationEscrow(order);
      order.ethereumEscrowId = order.dstChain === 'ethereum' ? dstEscrowId : order.ethereumEscrowId;
      order.stellarEscrowId = order.dstChain === 'stellar' ? dstEscrowId : order.stellarEscrowId;
      await this.updateStepStatus(orderId, 2, 'completed');

      // Step 4: Reveal secret and complete swap
      await this.updateStepStatus(orderId, 3, 'in-progress');
      await this.revealSecretAndComplete(order);
      await this.updateStepStatus(orderId, 3, 'completed');

      // Mark order as completed
      order.status = 'completed';
      const finalProgress = { ...progress, completed: true, currentStep: steps.length };
      this.updateProgress(orderId, finalProgress);

    } catch (error: any) {
      console.error('Swap execution failed:', error);
      order.status = 'refunded';
      const failedProgress = { 
        ...progress, 
        failed: true, 
        error: error.message 
      };
      this.updateProgress(orderId, failedProgress);
    }
  }

  /**
   * Create escrow on source chain (where user provides tokens)
   */
  private async createSourceEscrow(order: CrossChainSwapOrder): Promise<number> {
    if (order.srcChain === 'ethereum') {
      return this.createEthereumEscrow(order, true);
    } else {
      return this.createStellarEscrow(order, true);
    }
  }

  /**
   * Create escrow on destination chain (where resolver provides liquidity)
   */
  private async createDestinationEscrow(order: CrossChainSwapOrder): Promise<number> {
    if (order.dstChain === 'ethereum') {
      return this.createEthereumEscrow(order, false);
    } else {
      return this.createStellarEscrow(order, false);
    }
  }

  /**
   * Create Ethereum escrow (REAL implementation)
   */
  private async createEthereumEscrow(order: CrossChainSwapOrder, isSource: boolean): Promise<number> {
    try {
      const provider = new ethers.JsonRpcProvider(this.resolverConfig.ethereumRpcUrl);
      const wallet = new ethers.Wallet(this.resolverConfig.privateKeys.ethereum, provider);
      
      const escrowContract = new ethers.Contract(
        this.resolverConfig.contracts.ethereumEscrow,
        ETHEREUM_ESCROW_ABI,
        wallet
      );

      const maker = isSource ? order.maker : wallet.address;
      const token = this.resolverConfig.tokens.ethereumUSDC;
      const amount = ethers.parseUnits(isSource ? order.srcAmount : order.dstAmount, 6);
      const hashLock = toBytes32(order.hashLock);
      const timelockDuration = 1800; // 30 minutes
      const dstChainId = order.dstChain === 'stellar' ? 1 : 11155111;
      const orderHash = toBytes32(order.id);

      // If resolver is creating escrow, first approve tokens
      if (!isSource) {
        const tokenContract = new ethers.Contract(token, ERC20_ABI, wallet);
        const approveTx = await tokenContract.approve(
          this.resolverConfig.contracts.ethereumEscrow,
          amount
        );
        await approveTx.wait();
      }

      const tx = await escrowContract.createEscrow(
        maker,
        token,
        amount,
        hashLock,
        timelockDuration,
        dstChainId,
        orderHash
      );

      const receipt = await tx.wait();
      
      // Extract escrow ID from events
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = escrowContract.interface.parseLog(log);
          return parsed?.name === 'EscrowCreated';
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = escrowContract.interface.parseLog(event);
        return Number(parsed?.args?.escrowId || 0);
      }

      return 0;
    } catch (error: any) {
      throw new ContractInteractionError(
        `Failed to create Ethereum escrow: ${error.message}`,
        'EthereumEscrow',
        'createEscrow',
        error
      );
    }
  }

  /**
   * Create Stellar escrow (Simplified for demo)
   */
  private async createStellarEscrow(order: CrossChainSwapOrder, isSource: boolean): Promise<number> {
    try {
      // For hackathon demo, we'll log the details and return a mock escrow ID
      // In production, this would create a real Soroban contract escrow
      
      console.log(`Creating Stellar escrow for order ${order.id}`);
      console.log(`Depositor: ${isSource ? order.maker : 'resolver'}`);
      console.log(`Beneficiary: ${isSource ? 'resolver' : order.maker}`);
      console.log(`Amount: ${isSource ? order.srcAmount : order.dstAmount} USDC`);
      console.log(`Hash lock: ${order.hashLock}`);
      console.log(`Timelock: ${order.timelock}`);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Return a demo escrow ID
      return Math.floor(Math.random() * 1000000);
      
    } catch (error: any) {
      throw new ContractInteractionError(
        `Failed to create Stellar escrow: ${error.message}`,
        'StellarEscrow',
        'createEscrow',
        error
      );
    }
  }

  /**
   * Reveal secret and complete both sides of the swap (REAL implementation)
   */
  private async revealSecretAndComplete(order: CrossChainSwapOrder): Promise<void> {
    try {
      console.log(`Starting secret revelation for order ${order.id}`);
      
      // Step 1: Claim on destination chain first (where resolver gets the desired tokens)
      if (order.dstChain === 'ethereum') {
        await this.claimEthereumEscrow(order, order.ethereumEscrowId!);
      } else {
        await this.claimStellarEscrow(order, order.stellarEscrowId!);
      }
      
      // Small delay to ensure first transaction is confirmed
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 2: Claim on source chain (where resolver provides liquidity back to user)
      if (order.srcChain === 'ethereum') {
        await this.claimEthereumEscrow(order, order.ethereumEscrowId!);
      } else {
        await this.claimStellarEscrow(order, order.stellarEscrowId!);
      }
      
      console.log(`Successfully completed cross-chain swap for order ${order.id}`);
      
    } catch (error: any) {
      console.error(`Failed to reveal secret and complete swap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Claim Ethereum escrow with secret (REAL implementation)
   */
  private async claimEthereumEscrow(order: CrossChainSwapOrder, escrowId: number): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(this.resolverConfig.ethereumRpcUrl);
      const wallet = new ethers.Wallet(this.resolverConfig.privateKeys.ethereum, provider);
      
      const escrowContract = new ethers.Contract(
        this.resolverConfig.contracts.ethereumEscrow,
        ETHEREUM_ESCROW_ABI,
        wallet
      );

      if (!order.secret) {
        throw new Error('Order secret is required for claiming escrow');
      }
      const secretBytes = toBytes32(order.secret);
      
      console.log(`Claiming Ethereum escrow ${escrowId} with secret: ${order.secret}`);
      
      const tx = await escrowContract.claimWithSecret(escrowId, secretBytes);
      const receipt = await tx.wait();
      
      console.log(`Ethereum escrow ${escrowId} claimed successfully. TX: ${receipt.hash}`);
      
    } catch (error: any) {
      throw new ContractInteractionError(
        `Failed to claim Ethereum escrow: ${error.message}`,
        'EthereumEscrow',
        'claimWithSecret',
        error
      );
    }
  }

  /**
   * Claim Stellar escrow with secret (Simplified for demo)
   */
  private async claimStellarEscrow(order: CrossChainSwapOrder, escrowId: number): Promise<void> {
    try {
      // For hackathon demo, we'll log the claim and simulate success
      // In production, this would call the real Soroban contract
      
      if (!order.secret) {
        throw new Error('Order secret is required for claiming escrow');
      }
      
      console.log(`Claiming Stellar escrow ${escrowId} with secret: ${order.secret}`);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`Stellar escrow ${escrowId} claimed successfully (demo)`);
      
    } catch (error: any) {
      throw new ContractInteractionError(
        `Failed to claim Stellar escrow: ${error.message}`,
        'StellarEscrow',
        'claimWithSecret',
        error
      );
    }
  }

  /**
   * Update progress and notify listeners
   */
  private updateProgress(orderId: string, progress: SwapProgress): void {
    const listener = this.progressListeners.get(orderId);
    if (listener) {
      listener(progress);
    }
  }

  /**
   * Update specific step status
   */
  private async updateStepStatus(
    orderId: string, 
    stepIndex: number, 
    status: SwapStep['status']
  ): Promise<void> {
    const listener = this.progressListeners.get(orderId);
    if (listener) {
      const steps = Array(4).fill(null).map((_, i) => ({
        id: ['approve-src', 'create-src-escrow', 'create-dst-escrow', 'reveal-secret'][i],
        title: ['Approve source token', 'Create source escrow', 'Create destination escrow', 'Reveal secret'][i],
        description: ['Approve escrow contract to spend tokens', 'Lock tokens on source chain', 'Lock tokens on destination chain', 'Complete the atomic swap'][i],
        status: i < stepIndex ? 'completed' : (i === stepIndex ? status : 'pending'),
        timestamp: i === stepIndex && status === 'completed' ? Date.now() : undefined
      }));

      const progress: SwapProgress = {
        orderId,
        steps,
        currentStep: stepIndex,
        completed: false,
        failed: false
      };

      listener(progress);
    }

    // Add delay to simulate real transaction times
    if (status === 'in-progress') {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Subscribe to order progress updates
   */
  subscribeToProgress(orderId: string, callback: (progress: SwapProgress) => void): void {
    this.progressListeners.set(orderId, callback);
  }

  /**
   * Unsubscribe from order progress updates
   */
  unsubscribeFromProgress(orderId: string): void {
    this.progressListeners.delete(orderId);
  }

  /**
   * Get order status
   */
  getOrder(orderId: string): CrossChainSwapOrder | undefined {
    return this.activeOrders.get(orderId);
  }

  /**
   * Get all active orders
   */
  getActiveOrders(): CrossChainSwapOrder[] {
    return Array.from(this.activeOrders.values());
  }
} 