import { ethers } from 'ethers';
import * as StellarSdk from '@stellar/stellar-sdk';
import { WalletService } from './walletService';
import { ResolverService } from './resolverService';
import {
  SwapRequest,
  SwapQuote,
  CreateOrderResponse,
  SwapProgress,
  CrossChainSwapOrder,
  ContractInteractionError,
  CrossChainSwapError
} from '../types';
import { getConfig, ERC20_ABI } from '../utils/config';

export class CrossChainSwapService {
  private static instance: CrossChainSwapService;
  private walletService: WalletService;
  private resolverService: ResolverService;
  private config = getConfig();

  private constructor() {
    this.walletService = WalletService.getInstance();
    this.resolverService = ResolverService.getInstance();
  }

  static getInstance(): CrossChainSwapService {
    if (!CrossChainSwapService.instance) {
      CrossChainSwapService.instance = new CrossChainSwapService();
    }
    return CrossChainSwapService.instance;
  }

  /**
   * Get a quote for a cross-chain swap
   */
  async getQuote(request: SwapRequest): Promise<SwapQuote> {
    try {
      // Validate swap direction
      if (request.srcChain === request.dstChain) {
        throw new CrossChainSwapError(
          'Source and destination chains must be different',
          'INVALID_SWAP_DIRECTION'
        );
      }

      // Validate supported chains
      if (!['ethereum', 'stellar'].includes(request.srcChain) || 
          !['ethereum', 'stellar'].includes(request.dstChain)) {
        throw new CrossChainSwapError(
          'Unsupported chain combination',
          'UNSUPPORTED_CHAINS'
        );
      }

      // Validate amount
      const amount = parseFloat(request.amount);
      if (amount <= 0 || isNaN(amount)) {
        throw new CrossChainSwapError(
          'Invalid swap amount',
          'INVALID_AMOUNT'
        );
      }

      // Call real resolver service API
      const response = await fetch('http://localhost:3001/api/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          srcChain: request.srcChain,
          dstChain: request.dstChain,
          srcToken: request.srcToken,
          dstToken: request.dstToken,
          amount: request.amount
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      if (error instanceof CrossChainSwapError) {
        throw error;
      }
      throw new CrossChainSwapError(
        `Failed to get quote: ${error.message}`,
        'QUOTE_ERROR',
        error
      );
    }
  }

  /**
   * Initiate a cross-chain swap
   */
  async initiateSwap(
    request: SwapRequest,
    onProgress?: (progress: SwapProgress) => void
  ): Promise<CreateOrderResponse> {
    try {
      // Check wallet connections
      const connectionState = this.walletService.getConnectionState();
      
      if (request.srcChain === 'ethereum' && !connectionState.ethereum.connected) {
        throw new CrossChainSwapError(
          'MetaMask wallet not connected',
          'WALLET_NOT_CONNECTED'
        );
      }
      
      if (request.srcChain === 'stellar' && !connectionState.stellar.connected) {
        throw new CrossChainSwapError(
          'Freighter wallet not connected',
          'WALLET_NOT_CONNECTED'
        );
      }

      // Get maker address
      const makerAddress = request.srcChain === 'ethereum' 
        ? connectionState.ethereum.address!
        : connectionState.stellar.address!;

      // Check token balance
      await this.checkTokenBalance(request);

      // Create order with real resolver service
      const response = await fetch('http://localhost:3001/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          makerAddress
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const orderResponse = await response.json();

      // Subscribe to progress updates
      if (onProgress) {
        this.resolverService.subscribeToProgress(orderResponse.orderId, onProgress);
      }

      // Approve tokens for escrow
      await this.approveTokens(request, orderResponse);

      return orderResponse;
    } catch (error: any) {
      if (error instanceof CrossChainSwapError) {
        throw error;
      }
      throw new CrossChainSwapError(
        `Failed to initiate swap: ${error.message}`,
        'SWAP_INITIATION_ERROR',
        error
      );
    }
  }

  /**
   * Check if user has sufficient token balance
   */
  private async checkTokenBalance(request: SwapRequest): Promise<void> {
    const amount = parseFloat(request.amount);
    
    if (request.srcChain === 'ethereum') {
      const provider = this.walletService.getEthereumProvider();
      if (!provider) {
        throw new CrossChainSwapError(
          'Ethereum provider not available',
          'PROVIDER_ERROR'
        );
      }

      const signer = await this.walletService.getEthereumSigner();
      if (!signer) {
        throw new CrossChainSwapError(
          'Ethereum signer not available',
          'SIGNER_ERROR'
        );
      }

      const tokenContract = new ethers.Contract(
        request.srcToken,
        ERC20_ABI,
        provider
      );

      const balance = await tokenContract.balanceOf(await signer.getAddress());
      const decimals = await tokenContract.decimals();
      const requiredAmount = ethers.parseUnits(request.amount, decimals);

      if (balance < requiredAmount) {
        throw new CrossChainSwapError(
          'Insufficient token balance',
          'INSUFFICIENT_BALANCE'
        );
      }
    } else {
      // Stellar balance check
      const publicKey = this.walletService.getStellarPublicKey();
      if (!publicKey) {
        throw new CrossChainSwapError(
          'Stellar public key not available',
          'WALLET_ERROR'
        );
      }

      const server = new StellarSdk.Horizon.Server(this.config.networks.stellar.horizonUrl);
      
      try {
        const account = await server.loadAccount(publicKey);
        const tokenBalance = account.balances.find(balance => 
          balance.asset_type === 'credit_alphanum4' && 
          (balance as any).asset_code === 'USDC'
        );

        if (!tokenBalance || parseFloat(tokenBalance.balance) < amount) {
          throw new CrossChainSwapError(
            'Insufficient USDC balance on Stellar',
            'INSUFFICIENT_BALANCE'
          );
        }
      } catch (error) {
        throw new CrossChainSwapError(
          'Failed to check Stellar balance',
          'BALANCE_CHECK_ERROR',
          error
        );
      }
    }
  }

  /**
   * Approve tokens for escrow contract
   */
  private async approveTokens(
    request: SwapRequest,
    orderResponse: CreateOrderResponse
  ): Promise<void> {
    if (request.srcChain === 'ethereum') {
      await this.approveEthereumTokens(request);
    } else {
      await this.approveStellarTokens(request);
    }
  }

  /**
   * Approve Ethereum tokens for escrow
   */
  private async approveEthereumTokens(request: SwapRequest): Promise<void> {
    try {
      const signer = await this.walletService.getEthereumSigner();
      if (!signer) {
        throw new Error('Ethereum signer not available');
      }

      const tokenContract = new ethers.Contract(
        request.srcToken,
        ERC20_ABI,
        signer
      );

      const decimals = await tokenContract.decimals();
      const amount = ethers.parseUnits(request.amount, decimals);
      const escrowAddress = this.config.contracts.ethereumEscrow;

      // Check current allowance
      const currentAllowance = await tokenContract.allowance(
        await signer.getAddress(),
        escrowAddress
      );

      if (currentAllowance < amount) {
        // Approve tokens
        const approveTx = await tokenContract.approve(escrowAddress, amount);
        await approveTx.wait();
      }
    } catch (error: any) {
      throw new ContractInteractionError(
        `Failed to approve Ethereum tokens: ${error.message}`,
        'ERC20',
        'approve',
        error
      );
    }
  }

  /**
   * Approve Stellar tokens (prepare trustline if needed)
   */
  private async approveStellarTokens(request: SwapRequest): Promise<void> {
    try {
      const publicKey = this.walletService.getStellarPublicKey();
      if (!publicKey) {
        throw new Error('Stellar public key not available');
      }

      const server = new StellarSdk.Horizon.Server(this.config.networks.stellar.horizonUrl);
      const account = await server.loadAccount(publicKey);

      // Check if trustline exists for USDC
      const usdcTrustline = account.balances.find(balance => 
        balance.asset_type === 'credit_alphanum4' && 
        (balance as any).asset_code === 'USDC'
      );

      if (!usdcTrustline) {
        throw new CrossChainSwapError(
          'USDC trustline not found. Please add USDC trustline to your Stellar account.',
          'TRUSTLINE_MISSING'
        );
      }
    } catch (error: any) {
      if (error instanceof CrossChainSwapError) {
        throw error;
      }
      throw new CrossChainSwapError(
        `Failed to validate Stellar tokens: ${error.message}`,
        'STELLAR_VALIDATION_ERROR',
        error
      );
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string): Promise<CrossChainSwapOrder | null> {
    try {
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error: any) {
      console.error('Failed to get order status:', error);
      return null;
    }
  }

  /**
   * Get all active orders
   */
  async getActiveOrders(): Promise<CrossChainSwapOrder[]> {
    try {
      const response = await fetch('http://localhost:3001/api/orders');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error: any) {
      console.error('Failed to get active orders:', error);
      return [];
    }
  }

  /**
   * Subscribe to order progress
   */
  subscribeToOrderProgress(
    orderId: string,
    callback: (progress: SwapProgress) => void
  ): void {
    this.resolverService.subscribeToProgress(orderId, callback);
  }

  /**
   * Unsubscribe from order progress
   */
  unsubscribeFromOrderProgress(orderId: string): void {
    this.resolverService.unsubscribeFromProgress(orderId);
  }

  /**
   * Cancel a swap order (if possible)
   */
  async cancelOrder(orderId: string): Promise<void> {
    const order = await this.getOrderStatus(orderId);
    if (!order) {
      throw new CrossChainSwapError(
        'Order not found',
        'ORDER_NOT_FOUND'
      );
    }

    if (order.status !== 'pending' && order.status !== 'escrowed') {
      throw new CrossChainSwapError(
        'Order cannot be cancelled at this stage',
        'CANCELLATION_NOT_ALLOWED'
      );
    }

    // In a real implementation, this would trigger refund mechanisms
    // For now, we'll just mark it as cancelled
    order.status = 'refunded';
  }

  /**
   * Estimate gas for swap operations
   */
  async estimateGas(request: SwapRequest): Promise<{
    approval: string;
    escrow: string;
    total: string;
  }> {
    if (request.srcChain === 'ethereum') {
      try {
        const provider = this.walletService.getEthereumProvider();
        if (!provider) {
          throw new Error('Ethereum provider not available');
        }

        const signer = await this.walletService.getEthereumSigner();
        if (!signer) {
          throw new Error('Ethereum signer not available');
        }

        // Estimate approval gas
        const tokenContract = new ethers.Contract(
          request.srcToken,
          ERC20_ABI,
          signer
        );
        
        const decimals = await tokenContract.decimals();
        const amount = ethers.parseUnits(request.amount, decimals);
        
        const approvalGas = await tokenContract.approve.estimateGas(
          this.config.contracts.ethereumEscrow,
          amount
        );

        // Estimate escrow creation gas (simplified)
        const escrowGas = BigInt(150000); // Typical gas for escrow creation

        const totalGas = approvalGas + escrowGas;
        const gasPrice = await provider.getFeeData();
        const totalCost = totalGas * (gasPrice.gasPrice || BigInt(20000000000));

        return {
          approval: ethers.formatEther(approvalGas * (gasPrice.gasPrice || BigInt(20000000000))),
          escrow: ethers.formatEther(escrowGas * (gasPrice.gasPrice || BigInt(20000000000))),
          total: ethers.formatEther(totalCost)
        };
      } catch (error: any) {
        throw new CrossChainSwapError(
          `Failed to estimate gas: ${error.message}`,
          'GAS_ESTIMATION_ERROR',
          error
        );
      }
    } else {
      // Stellar operations are typically very low cost
      return {
        approval: '0.0001',
        escrow: '0.0001',
        total: '0.0002'
      };
    }
  }
} 