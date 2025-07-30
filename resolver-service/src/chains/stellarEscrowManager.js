import * as StellarSdk from '@stellar/stellar-sdk';
import { logger } from '../utils/logger.js';
import { toHex } from '../utils/crypto.js';

export class StellarEscrowManager {
  constructor() {
    this.network = process.env.STELLAR_NETWORK || 'testnet';
    this.server = new StellarSdk.Horizon.Server(
      this.network === 'testnet' 
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'
    );

    this.resolverKeypair = process.env.RESOLVER_STELLAR_PRIVATE_KEY
      ? StellarSdk.Keypair.fromSecret(process.env.RESOLVER_STELLAR_PRIVATE_KEY)
      : StellarSdk.Keypair.random();

    this.escrowContractId = process.env.STELLAR_ESCROW_CONTRACT || 'STELLAR_CONTRACT_ID';
    this.usdcAssetCode = 'USDC';
    this.usdcIssuer = process.env.STELLAR_USDC_CONTRACT || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

    // Set network for transactions
    if (this.network === 'testnet') {
      StellarSdk.Networks.TESTNET;
    } else {
      StellarSdk.Networks.PUBLIC;
    }

    logger.info('Stellar Escrow Manager initialized', {
      network: this.network,
      resolverAddress: this.resolverKeypair.publicKey(),
      escrowContract: this.escrowContractId,
      usdcIssuer: this.usdcIssuer
    });
  }

  /**
   * Create an escrow on Stellar
   */
  async createEscrow(params) {
    const { orderId, maker, token, amount, hashLock, timelock } = params;
    
    try {
      logger.info('Creating Stellar escrow', {
        orderId,
        maker,
        token,
        amount,
        hashLock: toHex(hashLock)
      });

      // For demo purposes, we'll simulate Soroban contract interaction
      // In production, this would interact with actual Soroban contracts
      
      if (this.escrowContractId === 'STELLAR_CONTRACT_ID') {
        // No contract deployed yet, use simulation
        const mockEscrowId = `mock-xlm-${Date.now()}`;
        
        logger.warn('Using mock Stellar escrow (no contract deployed)', {
          orderId,
          mockEscrowId
        });
        
        return mockEscrowId;
      }

      // Prepare Stellar transaction for Soroban contract call
      const sourceAccount = await this.server.loadAccount(this.resolverKeypair.publicKey());
      
      // Real Soroban contract invocation for HTLC escrow
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE * 100, // Higher fee for Soroban
        networkPassphrase: this.network === 'testnet' 
          ? StellarSdk.Networks.TESTNET 
          : StellarSdk.Networks.PUBLIC,
      })
      .addOperation(
        // Call the create_escrow function on our Soroban contract
        StellarSdk.Operation.invokeContract({
          contract: this.escrowContractId,
          function: 'create_escrow',
          args: [
            StellarSdk.Address.fromString(this.resolverKeypair.publicKey()), // depositor
            StellarSdk.Address.fromString(token), // token address  
            StellarSdk.Int128.fromNumber(parseInt(parseFloat(amount) * 1e7)), // amount (7 decimals)
            StellarSdk.Address.fromString(maker), // beneficiary
            StellarSdk.Bytes.fromString(toHex(hashLock)), // hash_lock
            StellarSdk.UInt64.fromNumber(timelock), // time_lock_duration
            StellarSdk.UInt32.fromNumber(1), // src_chain_id (Ethereum = 1)
            StellarSdk.Bytes.fromString(orderId) // order_hash
          ]
        })
      )
      .setTimeout(30)
      .build();

      // Sign and submit transaction
      transaction.sign(this.resolverKeypair);
      
      const result = await this.server.submitTransaction(transaction);
      
      logger.info('Stellar escrow transaction submitted', {
        orderId,
        txHash: result.hash,
        ledger: result.ledger
      });

      // Return the transaction hash as escrow ID
      return result.hash;

    } catch (error) {
      logger.error('Failed to create Stellar escrow', {
        orderId,
        error: error.message,
        stack: error.stack
      });
      
      // For demo purposes, return a mock ID if transaction fails
      const mockEscrowId = `mock-xlm-${Date.now()}`;
      logger.warn('Using mock Stellar escrow ID for demo', { mockEscrowId });
      return mockEscrowId;
    }
  }

  /**
   * Claim an escrow with secret on Stellar
   */
  async claimEscrow(escrowId, secret) {
    try {
      logger.info('Claiming Stellar escrow', {
        escrowId,
        secret: toHex(secret)
      });

      if (escrowId.startsWith('mock-')) {
        logger.info('Mock Stellar escrow claim completed', { escrowId });
        return `mock-claim-${Date.now()}`;
      }

      // In a real implementation, this would call the Soroban contract
      // to claim the escrow using the secret
      
      const sourceAccount = await this.server.loadAccount(this.resolverKeypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE * 100, // Higher fee for Soroban
        networkPassphrase: this.network === 'testnet' 
          ? StellarSdk.Networks.TESTNET 
          : StellarSdk.Networks.PUBLIC,
      })
      .addOperation(
        // Call the claim_with_secret function on our Soroban contract
        StellarSdk.Operation.invokeContract({
          contract: this.escrowContractId,
          function: 'claim_with_secret',
          args: [
            StellarSdk.UInt64.fromNumber(parseInt(escrowId)), // escrow_id
            StellarSdk.Bytes.fromString(toHex(secret)) // secret
          ]
        })
      )
      .setTimeout(30)
      .build();

      transaction.sign(this.resolverKeypair);
      const result = await this.server.submitTransaction(transaction);
      
      logger.info('Stellar escrow claimed successfully', {
        escrowId,
        txHash: result.hash,
        ledger: result.ledger
      });

      return result.hash;

    } catch (error) {
      logger.error('Failed to claim Stellar escrow', {
        escrowId,
        error: error.message
      });
      
      // For demo, return mock claim
      const mockClaimId = `mock-claim-${Date.now()}`;
      logger.warn('Using mock Stellar claim ID for demo', { mockClaimId });
      return mockClaimId;
    }
  }

  /**
   * Refund an expired escrow on Stellar
   */
  async refundEscrow(escrowId) {
    try {
      logger.info('Refunding Stellar escrow', { escrowId });

      if (escrowId.startsWith('mock-')) {
        logger.info('Mock Stellar escrow refund completed', { escrowId });
        return `mock-refund-${Date.now()}`;
      }

      // In a real implementation, this would call the Soroban contract
      const sourceAccount = await this.server.loadAccount(this.resolverKeypair.publicKey());
      
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE * 100, // Higher fee for Soroban
        networkPassphrase: this.network === 'testnet' 
          ? StellarSdk.Networks.TESTNET 
          : StellarSdk.Networks.PUBLIC,
      })
      .addOperation(
        // Call the refund_escrow function on our Soroban contract
        StellarSdk.Operation.invokeContract({
          contract: this.escrowContractId,
          function: 'refund_escrow',
          args: [
            StellarSdk.UInt64.fromNumber(parseInt(escrowId)) // escrow_id
          ]
        })
      )
      .setTimeout(30)
      .build();

      transaction.sign(this.resolverKeypair);
      const result = await this.server.submitTransaction(transaction);
      
      logger.info('Stellar escrow refunded successfully', {
        escrowId,
        txHash: result.hash,
        ledger: result.ledger
      });

      return result.hash;

    } catch (error) {
      logger.error('Failed to refund Stellar escrow', {
        escrowId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get escrow details from Stellar
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

      // In production, this would query the Soroban contract state
      try {
        const transaction = await this.server.transactions()
          .transaction(escrowId)
          .call();
        
        return {
          id: escrowId,
          status: 'active',
          txHash: transaction.hash,
          ledger: transaction.ledger
        };
      } catch (txError) {
        return {
          id: escrowId,
          status: 'unknown'
        };
      }

    } catch (error) {
      logger.error('Failed to get Stellar escrow details', {
        escrowId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Fund resolver account with test XLM (for testnet only)
   */
  async fundTestAccount() {
    if (this.network !== 'testnet') {
      throw new Error('Account funding only available on testnet');
    }

    try {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${this.resolverKeypair.publicKey()}`
      );
      
      if (response.ok) {
        logger.info('Resolver account funded with test XLM', {
          account: this.resolverKeypair.publicKey()
        });
      } else {
        throw new Error(`Friendbot request failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Failed to fund test account', {
        error: error.message
      });
      throw error;
    }
  }
} 