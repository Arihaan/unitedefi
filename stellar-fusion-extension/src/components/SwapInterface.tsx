import React, { useState, useEffect } from 'react';
import { WalletService } from '../services/walletService';
import { CrossChainSwapService } from '../services/crossChainSwapService';
import {
  SwapRequest,
  SwapQuote,
  SwapProgress,
  WalletConnectionState,
  CrossChainSwapError
} from '../types';
import { getConfig } from '../utils/config';
import './SwapInterface.css';

interface SwapInterfaceProps {
  onSwapInitiated?: (orderId: string) => void;
}

export const SwapInterface: React.FC<SwapInterfaceProps> = ({ onSwapInitiated }) => {
  const [walletState, setWalletState] = useState<WalletConnectionState>({
    ethereum: { connected: false },
    stellar: { connected: false }
  });
  const [swapRequest, setSwapRequest] = useState<SwapRequest>({
    srcChain: 'ethereum',
    dstChain: 'stellar',
    srcToken: '',
    dstToken: '',
    amount: ''
  });
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapProgress, setSwapProgress] = useState<SwapProgress | null>(null);

  const walletService = WalletService.getInstance();
  const swapService = CrossChainSwapService.getInstance();
  const config = getConfig();

  useEffect(() => {
    const initializeWallets = async () => {
      console.log('Starting wallet initialization...');
      
      // Subscribe to state changes first
      walletService.addStateListener(setWalletState);
      
      // Get current wallet state before initialization
      const initialState = walletService.getConnectionState();
      console.log('Initial wallet state:', initialState);
      setWalletState(initialState);
      
      // Initialize wallet service (this checks for existing connections)
      console.log('Calling walletService.initialize()...');
      await walletService.initialize();
      
      // Get wallet state after initialization
      const postInitState = walletService.getConnectionState();
      console.log('Post-init wallet state:', postInitState);
      setWalletState(postInitState);
    };
    
    initializeWallets();
    
    // Set default token addresses
    setSwapRequest(prev => ({
      ...prev,
      srcToken: config.tokens.ethereum.usdc.address,
      dstToken: config.tokens.stellar.usdc.address
    }));

    return () => {
      walletService.removeStateListener(setWalletState);
    };
  }, [walletService, config.tokens.ethereum.usdc.address, config.tokens.stellar.usdc.address]);

  // Debug effect to log wallet state changes
  useEffect(() => {
    console.log('Wallet state changed:', walletState);
  }, [walletState]);

  const handleConnectWallet = async (chain: 'ethereum' | 'stellar') => {
    try {
      setError(null);
      if (chain === 'ethereum') {
        await walletService.connectEthereum();
      } else {
        await walletService.connectStellar();
      }
    } catch (error: any) {
      setError(`Failed to connect ${chain} wallet: ${error.message}`);
    }
  };

  const handleDisconnectWallet = async (chain: 'ethereum' | 'stellar') => {
    try {
      if (chain === 'ethereum') {
        await walletService.disconnectEthereum();
      } else {
        await walletService.disconnectStellar();
      }
    } catch (error: any) {
      setError(`Failed to disconnect ${chain} wallet: ${error.message}`);
    }
  };

  const handleSwapDirectionChange = () => {
    setSwapRequest(prev => ({
      ...prev,
      srcChain: prev.dstChain,
      dstChain: prev.srcChain,
      srcToken: prev.dstToken,
      dstToken: prev.srcToken
    }));
    setQuote(null);
  };

  const handleAmountChange = (amount: string) => {
    setSwapRequest(prev => ({ ...prev, amount }));
    setQuote(null);
  };

  const handleGetQuote = async () => {
    if (!swapRequest.amount || parseFloat(swapRequest.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newQuote = await swapService.getQuote(swapRequest);
      setQuote(newQuote);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateSwap = async () => {
    if (!quote) {
      setError('Please get a quote first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const orderResponse = await swapService.initiateSwap(
        swapRequest,
        (progress) => setSwapProgress(progress)
      );

      if (onSwapInitiated) {
        onSwapInitiated(orderResponse.orderId);
      }
    } catch (error: any) {
      if (error instanceof CrossChainSwapError) {
        setError(error.message);
      } else {
        setError(`Swap failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isSwapEnabled = () => {
    const srcConnected = swapRequest.srcChain === 'ethereum' 
      ? walletState.ethereum.connected 
      : walletState.stellar.connected;
    
    return srcConnected && quote && swapRequest.amount && !loading;
  };

  return (
    <div className="swap-interface">
      <div className="swap-interface__header">
        <h2>Cross-Chain USDC Swap</h2>
        <p>Powered by 1inch Fusion+ and Stellar</p>
      </div>

      {/* Wallet Connection Section */}
      <div className="swap-interface__wallets">
        <div className="wallet-section">
          <h3>Ethereum (Sepolia)</h3>
          {walletState.ethereum.connected ? (
            <div className="wallet-connected">
              <div className="wallet-info">
                <span className="address">{formatAddress(walletState.ethereum.address!)}</span>
                <span className="balance">{parseFloat(walletState.ethereum.balance || '0').toFixed(2)} USDC</span>
              </div>
              <button 
                className="btn btn-secondary"
                onClick={() => handleDisconnectWallet('ethereum')}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              className="btn btn-primary"
              onClick={() => handleConnectWallet('ethereum')}
            >
              Connect MetaMask
            </button>
          )}
        </div>

        <div className="wallet-section">
          <h3>Stellar (Testnet)</h3>
          {walletState.stellar.connected ? (
            <div className="wallet-connected">
              <div className="wallet-info">
                <span className="address">{formatAddress(walletState.stellar.address!)}</span>
                <span className="balance">{parseFloat(walletState.stellar.balance || '0').toFixed(2)} USDC</span>
              </div>
              <button 
                className="btn btn-secondary"
                onClick={() => handleDisconnectWallet('stellar')}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              className="btn btn-primary"
              onClick={() => handleConnectWallet('stellar')}
            >
              Connect Freighter
            </button>
          )}
        </div>
      </div>

      {/* Swap Form */}
      <div className="swap-interface__form">
        <div className="swap-direction">
          <div className="chain-selector">
            <label>From</label>
            <div className="chain-info">
              <span className="chain-name">
                {swapRequest.srcChain === 'ethereum' ? 'Ethereum (Sepolia)' : 'Stellar (Testnet)'}
              </span>
              <span className="token-name">USDC</span>
            </div>
          </div>

          <button 
            className="swap-direction-btn"
            onClick={handleSwapDirectionChange}
            title="Swap direction"
          >
            ⇄
          </button>

          <div className="chain-selector">
            <label>To</label>
            <div className="chain-info">
              <span className="chain-name">
                {swapRequest.dstChain === 'ethereum' ? 'Ethereum (Sepolia)' : 'Stellar (Testnet)'}
              </span>
              <span className="token-name">USDC</span>
            </div>
          </div>
        </div>

        <div className="amount-input">
          <label>Amount</label>
          <input
            type="number"
            placeholder="0.00"
            value={swapRequest.amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            min="0"
            step="0.000001"
          />
          <span className="currency">USDC</span>
        </div>

        <button 
          className="btn btn-secondary"
          onClick={handleGetQuote}
          disabled={!swapRequest.amount || loading}
        >
          {loading ? 'Getting Quote...' : 'Get Quote'}
        </button>

        {/* Quote Display */}
        {quote && (
          <div className="quote-display">
            <h4>Quote</h4>
            <div className="quote-details">
              <div className="quote-item">
                <span>You Send:</span>
                <span>{quote.srcAmount} USDC</span>
              </div>
              <div className="quote-item">
                <span>You Receive:</span>
                <span>{quote.dstAmount} USDC</span>
              </div>
              <div className="quote-item">
                <span>Estimated Gas:</span>
                <span>{quote.estimatedGas} {swapRequest.srcChain === 'ethereum' ? 'ETH' : 'XLM'}</span>
              </div>
              <div className="quote-item">
                <span>Timelock:</span>
                <span>{Math.floor(quote.timelock / 60)} minutes</span>
              </div>
            </div>
          </div>
        )}

        <button 
          className="btn btn-primary btn-large"
          onClick={handleInitiateSwap}
          disabled={!isSwapEnabled()}
        >
          {loading ? 'Initiating Swap...' : 'Initiate Cross-Chain Swap'}
        </button>
      </div>

      {/* Swap Progress */}
      {swapProgress && (
        <div className="swap-progress">
          <h4>Swap Progress</h4>
          <div className="progress-steps">
            {swapProgress.steps.map((step, index) => (
              <div 
                key={step.id} 
                className={`progress-step ${step.status}`}
              >
                <div className="step-indicator">
                  {step.status === 'completed' ? '✓' : 
                   step.status === 'in-progress' ? '⟳' : 
                   step.status === 'failed' ? '✗' : (index + 1)}
                </div>
                <div className="step-content">
                  <div className="step-title">{step.title}</div>
                  <div className="step-description">{step.description}</div>
                  {step.transaction && (
                    <div className="step-transaction">
                      <a 
                        href={step.transaction.explorerUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        View Transaction
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}; 