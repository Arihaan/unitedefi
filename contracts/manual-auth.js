const { ethers } = require('ethers');

async function main() {
  // Set up provider and wallet with correct owner private key
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const wallet = new ethers.Wallet('80e43bc7f9b5eae2b50f9b9d0a6b9c5b4c6e6b4e7c3d6b5e8f9e0a1b2c3d4e5f', provider);
  
  console.log('Wallet address:', wallet.address);
  
  // Contract addresses - use proper checksum
  const escrowFactoryAddress = ethers.getAddress('0x9E12f1D513b90F64dd45dE7bE20983DE6152E870');
  const resolverAddress = ethers.getAddress('0x917999645773E99d03d44817B7318861F018Cb74');
  
  console.log('EscrowFactory:', escrowFactoryAddress);
  console.log('Resolver:', resolverAddress);
  
  // Manual ABI for the functions we need
  const abi = [
    'function owner() view returns (address)',
    'function resolvers(address) view returns (bool)', 
    'function addResolver(address)',
    'function createEscrow(bytes32,address,uint256,bytes32,uint256,address,address) payable returns (address)'
  ];
  
  const contract = new ethers.Contract(escrowFactoryAddress, abi, wallet);
  
  try {
    console.log('\n1. Checking owner...');
    const owner = await contract.owner();
    console.log('Owner:', owner);
    console.log('Is wallet owner?', owner.toLowerCase() === wallet.address.toLowerCase());
    
    console.log('\n2. Checking current resolver status...');
    try {
      const isAuthorized = await contract.resolvers(resolverAddress);
      console.log('Resolver authorized:', isAuthorized);
      
      if (isAuthorized) {
        console.log('✅ Resolver is already authorized! No need to add.');
        return;
      }
    } catch (e) {
      console.log('❌ Cannot check resolver status:', e.message);
    }
    
    console.log('\n3. Adding resolver...');
    const tx = await contract.addResolver(resolverAddress, {
      gasLimit: 100000,
      gasPrice: ethers.parseUnits('20', 'gwei')
    });
    
    console.log('Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('✅ Success! Gas used:', receipt.gasUsed.toString());
    
    // Verify
    console.log('\n4. Verifying...');
    const isAuthorizedAfter = await contract.resolvers(resolverAddress);
    console.log('Resolver authorized after:', isAuthorizedAfter);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    if (error.data) {
      console.error('Error data:', error.data);
    }
  }
}

main().catch(console.error);