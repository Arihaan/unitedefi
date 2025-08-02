import { ethers } from 'ethers';
import { NETWORKS, RESOLVER_CONFIG } from './config.js';

// Contract ABIs (simplified for demonstration)
const SETTLEMENT_ABI = [
  "function fillOrder((address,address,address,uint256,uint256,address,bytes32,uint256),(uint256,address,bytes32,uint256,uint256,uint256),bytes,uint256,uint256) external",
  "function completeSwap(bytes32,bytes32) external",
  "function cancelOrder(bytes32) external",
  "function getEscrow(bytes32) external view returns (address)",
  "function isOrderFilled(bytes32) external view returns (bool)",
  "function getSecret(bytes32) external view returns (bytes32)"
];

const ESCROW_ABI = [
  "function withdraw(bytes32) external",
  "function cancel() external",
  "function getSecret() external view returns (bytes32)",
  "function isSecretRevealed() external view returns (bool)",
  "function getState() external view returns (string)"
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

export class BlockchainManager {
  constructor() {
    this.providers = {};
    this.signers = {};
    this.contracts = {};
    
    this.initializeProviders();
  }

  initializeProviders() {
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
        usdc: new ethers.Contract(
          config.usdc,
          ERC20_ABI,
          this.signers[networkName]
        )
      };
    }
  }

  getProvider(network) {
    return this.providers[network];
  }

  getSigner(network) {
    return this.signers[network];
  }

  getContract(network, contractName) {
    return this.contracts[network][contractName];
  }

  async getBalance(network, tokenAddress = null) {
    const signer = this.getSigner(network);
    
    if (!tokenAddress) {
      // Get native token balance
      const balance = await this.providers[network].getBalance(signer.address);
      return ethers.formatEther(balance);
    } else {
      // Get ERC20 token balance
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const balance = await tokenContract.balanceOf(signer.address);
      return ethers.formatUnits(balance, 6); // USDC has 6 decimals
    }
  }

  async approveToken(network, tokenAddress, spenderAddress, amount) {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      this.getSigner(network)
    );
    
    const tx = await tokenContract.approve(spenderAddress, amount);
    await tx.wait();
    return tx.hash;
  }

  packTimeLocks(timeLocks) {
    const deployedAt = Math.floor(Date.now() / 1000);
    
    // Pack time locks into uint256
    // Layout: deployedAt | publicCancellation | cancellation | publicWithdrawal | withdrawal
    let packed = BigInt(0);
    
    packed |= BigInt(deployedAt);
    packed |= BigInt(deployedAt + timeLocks.srcPrivateWithdrawal) << 32n;
    packed |= BigInt(deployedAt + timeLocks.srcPrivateWithdrawal + timeLocks.srcPublicWithdrawal) << 64n;
    packed |= BigInt(deployedAt + timeLocks.srcPrivateWithdrawal + timeLocks.srcPublicWithdrawal + timeLocks.srcPrivateCancellation) << 96n;
    packed |= BigInt(deployedAt + timeLocks.srcPrivateWithdrawal + timeLocks.srcPublicWithdrawal + timeLocks.srcPrivateCancellation + 86400) << 128n; // +1 day for public cancellation
    
    return packed;
  }

  generateSecret() {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  hashSecret(secret) {
    return ethers.keccak256(secret);
  }

  async createEscrow(network, orderData, crossChainData) {
    try {
      const settlement = this.getContract(network, 'settlement');
      
      const tx = await settlement.fillOrder(
        orderData,
        crossChainData,
        "0x", // Empty signature for demo
        orderData.makingAmount,
        orderData.takingAmount,
        {
          gasLimit: RESOLVER_CONFIG.gasLimits.createEscrow
        }
      );
      
      const receipt = await tx.wait();
      return {
        success: true,
        txHash: tx.hash,
        receipt
      };
    } catch (error) {
      console.error(`Error creating escrow on ${network}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async completeSwap(network, orderHash, secret) {
    try {
      const settlement = this.getContract(network, 'settlement');
      
      const tx = await settlement.completeSwap(orderHash, secret, {
        gasLimit: RESOLVER_CONFIG.gasLimits.withdraw
      });
      
      const receipt = await tx.wait();
      return {
        success: true,
        txHash: tx.hash,
        receipt
      };
    } catch (error) {
      console.error(`Error completing swap on ${network}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getEscrowAddress(network, orderHash) {
    const settlement = this.getContract(network, 'settlement');
    return await settlement.getEscrow(orderHash);
  }

  async getEscrowState(network, escrowAddress) {
    const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, this.getSigner(network));
    return await escrow.getState();
  }

  async isSecretRevealed(network, escrowAddress) {
    const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, this.getSigner(network));
    return await escrow.isSecretRevealed();
  }

  async getRevealedSecret(network, escrowAddress) {
    const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, this.getSigner(network));
    return await escrow.getSecret();
  }
}