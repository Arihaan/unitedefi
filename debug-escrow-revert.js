#!/usr/bin/env node

import { ethers } from 'ethers';

// Network configurations
const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    usdc: "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d",
    escrowFactory: "0x9E12f1D513b90F64dd45dE7bE20983DE6152E870"
  }
};

const PRIVATE_KEY_2 = "0x7ca0c4f3bcad95308bbf1b5687e8e38c59a00f8b8b56e0666a5c6b689466f2a2"; // Resolver

const ESCROW_FACTORY_ABI = [
    "function createEscrow(bytes32 orderHash, address token, uint256 amount, bytes32 hashLock, uint256 timeLocks, address maker, address taker) payable returns (address)",
    "function authorizedResolvers(address) view returns (bool)",
    "function escrows(bytes32) view returns (address)"
];

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

async function debugEscrowRevert() {
    console.log("🔍 Debugging Escrow Creation Revert");
    console.log("=" .repeat(50));

    const provider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const resolverWallet = new ethers.Wallet(PRIVATE_KEY_2, provider);
    
    const escrowFactory = new ethers.Contract(NETWORKS.sepolia.escrowFactory, ESCROW_FACTORY_ABI, resolverWallet);
    const usdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, resolverWallet);

    try {
        // Check all preconditions
        console.log("🔍 Checking preconditions:");
        
        const isAuthorized = await escrowFactory.authorizedResolvers(resolverWallet.address);
        const resolverBalance = await usdc.balanceOf(resolverWallet.address);
        const allowance = await usdc.allowance(resolverWallet.address, NETWORKS.sepolia.escrowFactory);
        
        console.log(`Resolver authorized: ${isAuthorized}`);
        console.log(`Resolver USDC balance: ${ethers.formatUnits(resolverBalance, 6)}`);
        console.log(`Factory allowance: ${ethers.formatUnits(allowance, 6)}`);

        // Test parameters
        const orderHash = ethers.randomBytes(32);
        const amount = ethers.parseUnits("1", 6);
        const hashLock = ethers.keccak256(ethers.randomBytes(32));
        const currentTime = Math.floor(Date.now() / 1000);
        
        const timeLocks = 
            BigInt(currentTime) |
            (BigInt(currentTime + 300) << 32n) |
            (BigInt(currentTime + 600) << 64n) |
            (BigInt(currentTime + 1800) << 96n) |
            (BigInt(currentTime + 86400) << 128n);

        console.log("\n🧪 Testing createEscrow with staticCall:");
        
        // Use staticCall to see the exact revert reason
        try {
            await escrowFactory.createEscrow.staticCall(
                orderHash,
                NETWORKS.sepolia.usdc,
                amount,
                hashLock,
                timeLocks,
                "0xF86eCcDc06855d5e56F3B4949D3D02Fa9396F100", // user as maker
                resolverWallet.address, // resolver as taker
                {
                    value: ethers.parseEther("0.01"),
                    gasLimit: 3000000
                }
            );
            console.log("✅ StaticCall succeeded - should work in real transaction");
        } catch (staticError) {
            console.log("❌ StaticCall failed:");
            console.log("Error:", staticError.message);
            
            if (staticError.data) {
                console.log("Error data:", staticError.data);
                
                // Try to decode common error signatures
                const errorSig = staticError.data.slice(0, 10);
                console.log("Error signature:", errorSig);
                
                // Check for common revert reasons
                if (staticError.message.includes("ERC20InsufficientAllowance")) {
                    console.log("🔍 Issue: Token allowance problem");
                } else if (staticError.message.includes("Not authorized resolver")) {
                    console.log("🔍 Issue: Resolver not authorized");
                } else if (staticError.message.includes("Escrow already exists")) {
                    console.log("🔍 Issue: Escrow already exists for this order hash");
                } else if (staticError.message.includes("Already initialized")) {
                    console.log("🔍 Issue: Escrow implementation already initialized");
                } else {
                    console.log("🔍 Unknown revert reason - need to investigate further");
                }
            }
        }

        // Check if escrow already exists for this order hash
        const existingEscrow = await escrowFactory.escrows(orderHash);
        console.log(`\n🔍 Existing escrow for order hash: ${existingEscrow}`);
        
        if (existingEscrow !== ethers.ZeroAddress) {
            console.log("⚠️ Escrow already exists - this might be the issue");
        }

    } catch (error) {
        console.error("❌ Debug failed:", error.message);
    }
}

debugEscrowRevert().catch(console.error);