// Global type declarations for Stellar Fusion+ Extension

declare global {
  interface Window {
    freighter?: {
      isConnected: () => Promise<boolean>;
      getAddress: () => Promise<{ address: string; error?: any }>;
      signTransaction: (xdr: string) => Promise<{ signedTxXdr: string; signerAddress: string; error?: any }>;
    };
  }
}

export {}; 