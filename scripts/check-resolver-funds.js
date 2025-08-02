import { ethers } from 'ethers';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const USDC_ADDRESS = '0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d';
const ESCROW_FACTORY_ADDRESS = '0x9E12f1D513b90F64dd45dE7bE20983DE6152E870';
const RESOLVER_ADDRESS = '0x917999645773E99d03d44817B7318861F018Cb74';

const ERC20_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

async function checkResolverFunds() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  
  console.log('🤖 Resolver:', RESOLVER_ADDRESS);
  console.log('🏭 EscrowFactory:', ESCROW_FACTORY_ADDRESS);
  
  // Check resolver's USDC balance
  const usdcBalance = await usdcContract.balanceOf(RESOLVER_ADDRESS);
  console.log('💰 Resolver USDC balance:', ethers.formatUnits(usdcBalance, 6));
  
  // Check resolver's allowance to EscrowFactory
  const allowance = await usdcContract.allowance(RESOLVER_ADDRESS, ESCROW_FACTORY_ADDRESS);
  console.log('🔐 Resolver->EscrowFactory allowance:', ethers.formatUnits(allowance, 6));
  
  // Check resolver's ETH balance for gas
  const ethBalance = await provider.getBalance(RESOLVER_ADDRESS);
  console.log('⛽ Resolver ETH balance:', ethers.formatEther(ethBalance));
}

checkResolverFunds().catch(console.error);