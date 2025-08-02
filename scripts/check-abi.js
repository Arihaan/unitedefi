import { ethers } from 'ethers';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ESCROW_FACTORY_ADDRESS = '0x9E12f1D513b90F64dd45dE7bE20983DE6152E870';

// Try different ABI variations
const ABI_V1 = [
  "function createEscrow(bytes32,address,uint256,bytes32,uint256,address,address) external returns (address)",
  "function getEscrow(bytes32) external view returns (address)"
];

const ABI_V2 = [
  "function createEscrow(bytes32 orderHash, address token, uint256 amount, bytes32 hashLock, uint256 timeLocks, address maker, address taker) external payable returns (address)",
  "function getEscrow(bytes32) external view returns (address)"
];

const ABI_V3 = [
  "function createEscrow(bytes32 orderHash, address token, uint256 amount, bytes32 hashLock, uint256 timeLock, address maker, address taker) external returns (address)",
  "function getEscrow(bytes32) external view returns (address)"
];

async function checkABI() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  
  const testOrderHash = '0x1234567890123456789012345678901234567890123456789012345678901234';
  
  for (let i = 1; i <= 3; i++) {
    try {
      const abi = i === 1 ? ABI_V1 : i === 2 ? ABI_V2 : ABI_V3;
      const contract = new ethers.Contract(ESCROW_FACTORY_ADDRESS, abi, provider);
      
      console.log(`\n🔍 Testing ABI v${i}:`);
      
      // Try to call getEscrow (view function - should work)
      const escrowAddress = await contract.getEscrow(testOrderHash);
      console.log(`✅ getEscrow call successful:`, escrowAddress);
      
      // Try to encode createEscrow call (this should work if ABI is correct)
      const iface = new ethers.Interface(abi);
      const encodedData = iface.encodeFunctionData('createEscrow', [
        testOrderHash,
        '0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d', // USDC
        ethers.parseUnits('1', 6), // amount
        testOrderHash, // Use same 32-byte value for hashLock
        1754154615, // timeLock
        '0xF86eCcDc06855d5e56F3B4949D3D02Fa9396F100', // maker
        '0x917999645773E99d03d44817B7318861F018Cb74'  // taker
      ]);
      console.log(`✅ Function encoding successful, data length:`, encodedData.length);
      console.log(`📝 Encoded data:`, encodedData.slice(0, 20) + '...');
      
    } catch (error) {
      console.log(`❌ ABI v${i} failed:`, error.message.split('\n')[0]);
    }
  }
}

checkABI().catch(console.error);