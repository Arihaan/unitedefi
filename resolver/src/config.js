export const NETWORKS = {
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
  }
};

export const RESOLVER_CONFIG = {
  // Resolver account - load from environment variable
  privateKey: process.env.RESOLVER_PRIVATE_KEY || "",
  address: "0x917999645773E99d03d44817B7318861F018Cb74",
  
  // 1inch Fusion+ Time lock configuration (in seconds)
  timeLocks: {
    // Source chain timelock phases
    srcFinalityLock: 300,        // 5 minutes - wait for finality
    srcPrivateWithdrawal: 600,   // 10 minutes - resolver can withdraw
    srcPublicWithdrawal: 1200,   // 20 minutes - anyone can withdraw
    srcPrivateCancellation: 1800, // 30 minutes - maker can cancel
    srcPublicCancellation: 86400, // 1 day - anyone can cancel for maker
    
    // Destination chain timelock phases  
    dstFinalityLock: 300,        // 5 minutes
    dstPrivateWithdrawal: 600,   // 10 minutes
    dstPublicWithdrawal: 1200,   // 20 minutes
    dstPrivateCancellation: 1800  // 30 minutes
  },
  
  // Safety deposits (in wei for native tokens, wei equivalent for ERC20)
  safetyDeposit: {
    src: "1000000000000000000", // 1 ETH equivalent
    dst: "1000000000000000000"  // 1 ETH equivalent
  },
  
  // Server configuration
  port: 3001,
  
  // Gas configuration
  gasLimits: {
    escrowCreation: 800000,
    secretReveal: 200000,
    withdrawal: 150000,
    cancellation: 150000
  },
  
  // Dutch auction configuration
  auction: {
    startTime: 0, // Immediate start
    duration: 1800, // 30 minutes
    initialRateBump: 10000, // 100% initial premium (in basis points)
    finalRateBump: 0 // No premium at end
  }
};