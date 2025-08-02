import { ethers } from 'ethers';

// Test the resolver directly
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const USDC_ADDRESS = '0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d';
const RESOLVER_ADDRESS = '0x917999645773E99d03d44817B7318861F018Cb74';

// User private key
const USER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)'
];

async function testDirectFlow() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const userWallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, userWallet);
  
  console.log('👤 User address:', userWallet.address);
  console.log('🔗 Resolver address:', RESOLVER_ADDRESS);
  
  // Check current balances and allowances
  const balance = await usdcContract.balanceOf(userWallet.address);
  const allowance = await usdcContract.allowance(userWallet.address, RESOLVER_ADDRESS);
  
  console.log('💰 User USDC balance:', ethers.formatUnits(balance, 6));
  console.log('🔐 Current allowance to resolver:', ethers.formatUnits(allowance, 6));
  
  // If allowance is insufficient, approve
  const requiredAmount = ethers.parseUnits('1', 6); // 1 USDC
  if (allowance < requiredAmount) {
    console.log('📝 Approving resolver to spend USDC...');
    const approveTx = await usdcContract.approve(RESOLVER_ADDRESS, ethers.parseUnits('10', 6)); // Approve 10 USDC
    await approveTx.wait();
    console.log('✅ Approved resolver');
    
    // Check new allowance
    const newAllowance = await usdcContract.allowance(userWallet.address, RESOLVER_ADDRESS);
    console.log('🔐 New allowance:', ethers.formatUnits(newAllowance, 6));
  }
  
  // Now call the resolver API
  console.log('🌉 Calling resolver API...');
  const response = await fetch('http://localhost:3001/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromNetwork: 'sepolia',
      toNetwork: 'celo',
      fromToken: 'USDC',
      toToken: 'USDC',
      amount: '1',
      userAddress: userWallet.address,
      destinationAddress: userWallet.address
    })
  });
  
  const result = await response.json();
  console.log('📊 Result:', result);
}

testDirectFlow().catch(console.error);