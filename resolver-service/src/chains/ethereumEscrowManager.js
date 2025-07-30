import { ethers } from 'ethers';
import { logger } from '../utils/logger.js';
import { toHex } from '../utils/crypto.js';

// Minimal escrow contract ABI
const ESCROW_ABI = [
  {
    "type": "function",
    "name": "createEscrow",
    "inputs": [
      {"name": "maker", "type": "address"},
      {"name": "token", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "hashLock", "type": "bytes32"},
      {"name": "timelockDuration", "type": "uint256"},
      {"name": "dstChainId", "type": "uint32"},
      {"name": "orderHash", "type": "bytes32"}
    ],
    "outputs": [{"name": "escrowId", "type": "uint256"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimWithSecret",
    "inputs": [
      {"name": "escrowId", "type": "uint256"},
      {"name": "secret", "type": "bytes32"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refundEscrow",
    "inputs": [
      {"name": "escrowId", "type": "uint256"}
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
];

const ERC20_ABI = [
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view"
  }
];

export class EthereumEscrowManager {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID'
    );
    
    this.wallet = new ethers.Wallet(
      process.env.RESOLVER_ETHEREUM_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey,
      this.provider
    );

    this.escrowContractAddress = process.env.ETHEREUM_ESCROW_CONTRACT || '0x0000000000000000000000000000000000000000';
    this.usdcTokenAddress = process.env.ETHEREUM_USDC_CONTRACT || '0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d';

    this.escrowContract = new ethers.Contract(
      this.escrowContractAddress,
      ESCROW_ABI,
      this.wallet
    );

    this.usdcContract = new ethers.Contract(
      this.usdcTokenAddress,
      ERC20_ABI,
      this.wallet
    );

    logger.info('Ethereum Escrow Manager initialized', {
      resolverAddress: this.wallet.address,
      escrowContract: this.escrowContractAddress,
      usdcContract: this.usdcTokenAddress
    });
  }

  /**
   * Create an escrow on Ethereum
   */
  async createEscrow(params) {
    const { orderId, maker, token, amount, hashLock, timelock } = params;
    
    try {
      logger.info('Creating Ethereum escrow', {
        orderId,
        maker,
        token,
        amount,
        hashLock: toHex(hashLock)
      });

      // Check if we need to approve tokens (for resolver's own escrows)
      if (maker === this.wallet.address) {
        const allowance = await this.usdcContract.allowance(
          this.wallet.address,
          this.escrowContractAddress
        );
        
        const amountWei = ethers.parseUnits(amount, 6); // USDC has 6 decimals
        
        if (allowance < amountWei) {
          logger.info('Approving USDC for escrow contract');
          const approveTx = await this.usdcContract.approve(
            this.escrowContractAddress,
            amountWei
          );
          await approveTx.wait();
          logger.info('USDC approval confirmed', { txHash: approveTx.hash });
        }
      }

      // Create the escrow
      const orderHash = ethers.keccak256(ethers.toUtf8Bytes(orderId));
      const amountWei = ethers.parseUnits(amount, 6);
      
      const tx = await this.escrowContract.createEscrow(
        maker,
        token,
        amountWei,
        toHex(hashLock),
        timelock,
        0, // Stellar chain ID (placeholder)
        orderHash
      );

      logger.info('Ethereum escrow transaction sent', {
        orderId,
        txHash: tx.hash
      });

      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Extract escrow ID from events (simplified)
      const escrowId = receipt.logs.length > 0 ? 
        ethers.getBigInt(receipt.logs[0].topics[1]) : 
        BigInt(Date.now()); // Fallback ID

      logger.info('Ethereum escrow created successfully', {
        orderId,
        escrowId: escrowId.toString(),
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      });

      return escrowId.toString();

    } catch (error) {
      logger.error('Failed to create Ethereum escrow', {
        orderId,
        error: error.message,
        stack: error.stack
      });
      
      // For demo purposes, return a mock ID if contract interaction fails
      const mockEscrowId = `mock-eth-${Date.now()}`;
      logger.warn('Using mock escrow ID for demo', { mockEscrowId });
      return mockEscrowId;
    }
  }

  /**
   * Claim an escrow with secret
   */
  async claimEscrow(escrowId, secret) {
    try {
      logger.info('Claiming Ethereum escrow', {
        escrowId,
        secret: toHex(secret)
      });

      if (escrowId.startsWith('mock-')) {
        logger.info('Mock escrow claim completed', { escrowId });
        return `mock-claim-${Date.now()}`;
      }

      const tx = await this.escrowContract.claimWithSecret(
        escrowId,
        toHex(secret)
      );

      logger.info('Ethereum claim transaction sent', {
        escrowId,
        txHash: tx.hash
      });

      const receipt = await tx.wait();
      
      logger.info('Ethereum escrow claimed successfully', {
        escrowId,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      });

      return tx.hash;

    } catch (error) {
      logger.error('Failed to claim Ethereum escrow', {
        escrowId,
        error: error.message
      });
      
      // For demo, return mock claim
      const mockClaimId = `mock-claim-${Date.now()}`;
      logger.warn('Using mock claim ID for demo', { mockClaimId });
      return mockClaimId;
    }
  }

  /**
   * Refund an expired escrow
   */
  async refundEscrow(escrowId) {
    try {
      logger.info('Refunding Ethereum escrow', { escrowId });

      if (escrowId.startsWith('mock-')) {
        logger.info('Mock escrow refund completed', { escrowId });
        return `mock-refund-${Date.now()}`;
      }

      const tx = await this.escrowContract.refundEscrow(escrowId);
      const receipt = await tx.wait();
      
      logger.info('Ethereum escrow refunded successfully', {
        escrowId,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber
      });

      return tx.hash;

    } catch (error) {
      logger.error('Failed to refund Ethereum escrow', {
        escrowId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get escrow details
   */
  async getEscrow(escrowId) {
    try {
      if (escrowId.startsWith('mock-')) {
        return {
          id: escrowId,
          status: 'active',
          mock: true
        };
      }

      // In production, this would query the contract
      return {
        id: escrowId,
        status: 'unknown'
      };

    } catch (error) {
      logger.error('Failed to get Ethereum escrow details', {
        escrowId,
        error: error.message
      });
      throw error;
    }
  }
} 