import { ethers } from 'ethers';
import * as StellarSdk from '@stellar/stellar-sdk';
import { 
  getAddress, 
  signTransaction, 
  isConnected,
  isAllowed,
  setAllowed
} from '@stellar/freighter-api';
import { WalletConnectionState, WalletConnectionError } from '../types';
import { getConfig, ERC20_ABI } from '../utils/config';

export class WalletService {
  private static instance: WalletService;
  private connectionState: WalletConnectionState = {
    ethereum: { connected: false },
    stellar: { connected: false }
  };
  private listeners: ((state: WalletConnectionState) => void)[] = [];

  private constructor() {
    this.setupEventListeners();
  }

  static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  // Event listener management
  addStateListener(listener: (state: WalletConnectionState) => void) {
    this.listeners.push(listener);
  }

  removeStateListener(listener: (state: WalletConnectionState) => void) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.connectionState));
  }

  private setupEventListeners() {
    // MetaMask account change listener
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      (window as any).ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          this.disconnectEthereum();
        } else {
          this.updateEthereumConnection(accounts[0]);
        }
      });

      (window as any).ethereum.on('chainChanged', () => {
        this.checkEthereumConnection();
      });
    }

    // Check for wallet connection changes periodically
    setInterval(() => {
      this.checkEthereumConnection();
      this.checkStellarConnection();
    }, 3000); // Check every 3 seconds
  }

  getConnectionState(): WalletConnectionState {
    return { ...this.connectionState };
  }

  // Ethereum (MetaMask) wallet methods
  async connectEthereum(): Promise<void> {
    try {
      console.log('Attempting to connect to MetaMask...');
      
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        throw new WalletConnectionError(
          'MetaMask not found. Please install MetaMask extension.',
          'metamask'
        );
      }

      const ethereum = (window as any).ethereum;
      console.log('Requesting MetaMask accounts...');
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      console.log('MetaMask accounts result:', accounts);
      
      if (accounts.length === 0) {
        throw new WalletConnectionError('No accounts found in MetaMask', 'metamask');
      }

      console.log('Checking Ethereum network...');
      await this.checkEthereumNetwork();
      
      console.log('Updating Ethereum connection with address:', accounts[0]);
      await this.updateEthereumConnection(accounts[0]);
      
      // Force UI update
      console.log('Connected to MetaMask successfully');
      this.notifyListeners();
      
    } catch (error: any) {
      if (error instanceof WalletConnectionError) {
        throw error;
      }
      throw new WalletConnectionError(
        `Failed to connect to MetaMask: ${error.message}`,
        'metamask',
        error
      );
    }
  }

  async disconnectEthereum(): Promise<void> {
    this.connectionState.ethereum = { connected: false };
    this.notifyListeners();
  }

  private async updateEthereumConnection(address: string): Promise<void> {
    try {
      console.log('Updating Ethereum connection for address:', address);
      const config = getConfig();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      
      console.log('Getting network info...');
      const network = await provider.getNetwork();
      console.log('Network:', network.name, 'ChainId:', network.chainId);
      
      // Get USDC balance instead of ETH balance
      console.log('Getting USDC balance...');
      const usdcAddress = config.tokens.ethereum.usdc.address;
      console.log('USDC contract address:', usdcAddress);
      
      const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
      const usdcBalance = await usdcContract.balanceOf(address);
      const formattedBalance = ethers.formatUnits(usdcBalance, config.tokens.ethereum.usdc.decimals);
      console.log('USDC Balance:', formattedBalance);

      this.connectionState.ethereum = {
        connected: true,
        address,
        network: network.name,
        balance: formattedBalance
      };

      console.log('Ethereum connection state updated:', this.connectionState.ethereum);
      this.notifyListeners();
    } catch (error: any) {
      console.error('Error updating Ethereum connection:', error);
      this.connectionState.ethereum = { connected: false };
      this.notifyListeners();
    }
  }

  private async checkEthereumNetwork(): Promise<void> {
    const config = getConfig();
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const network = await provider.getNetwork();

    if (Number(network.chainId) !== config.networks.ethereum.chainId) {
      try {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${config.networks.ethereum.chainId.toString(16)}` }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          // Chain not added to MetaMask
          await this.addEthereumNetwork();
        } else {
          throw new WalletConnectionError(
            `Please switch to ${config.networks.ethereum.name} network`,
            'metamask',
            switchError
          );
        }
      }
    }
  }

  private async addEthereumNetwork(): Promise<void> {
    const config = getConfig();
    try {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${config.networks.ethereum.chainId.toString(16)}`,
          chainName: config.networks.ethereum.name,
          rpcUrls: [config.networks.ethereum.rpcUrl],
          blockExplorerUrls: [config.networks.ethereum.explorerUrl],
        }],
      });
    } catch (error: any) {
      throw new WalletConnectionError(
        'Failed to add Ethereum network to MetaMask',
        'metamask',
        error
      );
    }
  }

  async checkEthereumConnection(): Promise<void> {
    try {
      console.log('Checking existing Ethereum connection...');
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({ 
          method: 'eth_accounts' 
        });
        console.log('Ethereum accounts check result:', accounts);
        
        if (accounts.length > 0) {
          console.log('Found existing Ethereum connection:', accounts[0]);
          await this.updateEthereumConnection(accounts[0]);
        } else {
          console.log('No Ethereum accounts connected');
          this.connectionState.ethereum = { connected: false };
          this.notifyListeners();
        }
      } else {
        console.log('MetaMask not available');
        this.connectionState.ethereum = { connected: false };
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Error checking Ethereum connection:', error);
      this.connectionState.ethereum = { connected: false };
      this.notifyListeners();
    }
  }

  // Stellar (Freighter) wallet methods
  async connectStellar(): Promise<void> {
    try {
      console.log('Attempting to connect to Freighter...');
      
      // First, request permission if not already granted
      console.log('Checking if site is allowed...');
      const allowedCheck = await isAllowed();
      console.log('Site allowed status:', allowedCheck);
      
      if (!allowedCheck.isAllowed) {
        console.log('Requesting permission from Freighter...');
        try {
          const permissionResult = await setAllowed();
          console.log('Permission request result:', permissionResult);
          
          if (permissionResult.error) {
            throw new Error(`Permission denied: ${permissionResult.error}`);
          }
        } catch (permissionError: any) {
          throw new WalletConnectionError(
            'Permission denied. Please allow this site in Freighter and try again.',
            'freighter',
            permissionError
          );
        }
      }

      console.log('Checking if Freighter is connected...');
      const connected = await isConnected();
      console.log('Freighter connection status:', connected);
      
      if (!connected.isConnected) {
        throw new WalletConnectionError(
          'Freighter is not connected. Please open Freighter and connect your wallet.',
          'freighter'
        );
      }

      console.log('Getting Freighter address...');
      const result = await getAddress();
      console.log('Freighter address result:', result);
      
      if (result.error) {
        throw new Error(`Failed to get address: ${result.error}`);
      }
      
      if (!result.address || result.address.trim() === '') {
        throw new Error('No address returned from Freighter. Please make sure you have an account selected in Freighter.');
      }
      
      const publicKey = result.address;
      console.log('Connected to Freighter with address:', publicKey);
      await this.updateStellarConnection(publicKey);
      
      // Force UI update
      this.notifyListeners();
      
    } catch (error: any) {
      if (error instanceof WalletConnectionError) {
        throw error;
      }
      throw new WalletConnectionError(
        `Failed to connect to Freighter: ${error.message}`,
        'freighter',
        error
      );
    }
  }

  async disconnectStellar(): Promise<void> {
    this.connectionState.stellar = { connected: false };
    this.notifyListeners();
  }

  private async updateStellarConnection(publicKey: string): Promise<void> {
    try {
      const config = getConfig();
      const server = new StellarSdk.Horizon.Server(config.networks.stellar.horizonUrl);
      
      console.log('Getting Stellar USDC balance for:', publicKey);
      console.log('USDC contract address:', config.tokens.stellar.usdc.address);
      
      // Check if account exists and get USDC balance
      try {
        const account = await server.loadAccount(publicKey);
        
        // Look for USDC token balance instead of XLM
        const usdcBalance = account.balances.find(balance => {
          // For Stellar, USDC could be a credit_alphanum4 or credit_alphanum12 asset
          // Also check for Soroban contract tokens
          if (balance.asset_type === 'credit_alphanum4' || balance.asset_type === 'credit_alphanum12') {
            return (balance as any).asset_code === 'USDC' ||
                   (balance as any).asset_issuer === config.tokens.stellar.usdc.address;
          }
          // For Soroban contract tokens, the asset_type might be different
          // Check if the balance has any reference to our USDC contract
          return false;
        });

        const formattedBalance = usdcBalance ? usdcBalance.balance : '0';
        
        console.log('Stellar USDC Balance:', formattedBalance);

        this.connectionState.stellar = {
          connected: true,
          address: publicKey,
          network: config.networks.stellar.network,
          balance: formattedBalance
        };
      } catch (accountError) {
        console.log('Account might not be funded yet or no USDC balance');
        // Account might not be funded yet or no USDC balance
        this.connectionState.stellar = {
          connected: true,
          address: publicKey,
          network: config.networks.stellar.network,
          balance: '0'
        };
      }

      this.notifyListeners();
    } catch (error: any) {
      console.error('Error updating Stellar connection:', error);
      this.connectionState.stellar = { connected: false };
      this.notifyListeners();
    }
  }

  async checkStellarConnection(): Promise<void> {
    try {
      console.log('Checking existing Stellar connection...');
      const connected = await isConnected();
      console.log('Stellar connection check result:', connected);
      
      if (connected.isConnected) {
        const result = await getAddress();
        console.log('Stellar address check result:', result);
        
        if (result.address && result.address.trim() !== '') {
          const publicKey = result.address;
          console.log('Found existing Stellar connection:', publicKey);
          await this.updateStellarConnection(publicKey);
        } else {
          console.log('No address available from Freighter');
          this.connectionState.stellar = { connected: false };
          this.notifyListeners();
        }
      } else {
        console.log('Freighter not connected');
        this.connectionState.stellar = { connected: false };
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Error checking Stellar connection:', error);
      this.connectionState.stellar = { connected: false };
      this.notifyListeners();
    }
  }

  // Utility methods
  getEthereumProvider(): ethers.BrowserProvider | null {
    if (this.connectionState.ethereum.connected && (window as any).ethereum) {
      return new ethers.BrowserProvider((window as any).ethereum);
    }
    return null;
  }

  getStellarPublicKey(): string | null {
    return this.connectionState.stellar.address || null;
  }

  async getEthereumSigner(): Promise<ethers.JsonRpcSigner | null> {
    const provider = this.getEthereumProvider();
    if (provider) {
      return provider.getSigner();
    }
    return null;
  }

  async signStellarTransaction(transaction: StellarSdk.Transaction): Promise<StellarSdk.Transaction> {
    if (!this.connectionState.stellar.connected) {
      throw new WalletConnectionError('Stellar wallet not connected', 'freighter');
    }

    try {
      const signResult = await signTransaction(transaction.toXDR());
      return StellarSdk.TransactionBuilder.fromXDR(signResult.signedTxXdr, StellarSdk.Networks.TESTNET) as StellarSdk.Transaction;
    } catch (error: any) {
      throw new WalletConnectionError(
        `Failed to sign Stellar transaction: ${error.message}`,
        'freighter',
        error
      );
    }
  }

  // Initialize connections on app start
  async initialize(): Promise<void> {
    await Promise.all([
      this.checkEthereumConnection(),
      this.checkStellarConnection()
    ]);
  }
} 