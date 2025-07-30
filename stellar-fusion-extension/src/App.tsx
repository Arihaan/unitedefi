import React, { useState } from 'react';
import { SwapInterface } from './components/SwapInterface';
import './App.css';

function App() {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const handleSwapInitiated = (orderId: string) => {
    setActiveOrderId(orderId);
    console.log('Swap initiated with order ID:', orderId);
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>Stellar Fusion+ Extension</h1>
          <p>Cross-chain USDC swaps between Ethereum and Stellar using 1inch Fusion+ protocol</p>
        </div>
      </header>
      
      <main className="App-main">
        <SwapInterface onSwapInitiated={handleSwapInitiated} />
        
        {activeOrderId && (
          <div className="order-info">
            <h3>Active Order</h3>
            <p>Order ID: <code>{activeOrderId}</code></p>
            <p>Track your swap progress above.</p>
          </div>
        )}
      </main>

      <footer className="App-footer">
        <div className="footer-content">
          <p>
            Built for ETH Global Unite DeFi Hackathon • 
            Extending 1inch Fusion+ to Stellar Network
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App; 