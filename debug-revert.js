#!/usr/bin/env node

import { ethers } from 'ethers';
import { NETWORKS } from './resolver/src/config.js';

const PRIVATE_KEY_2 = "0x7ca0c4f3bcad95308bbf1b5687e8e38c59a00f8b8b56e0666a5c6b689466f2a2"; // Resolver wallet

async function debugRevert() {
    console.log("🔍 Debugging Contract Revert Error");
    console.log("=" .repeat(50));

    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const resolverWallet = new ethers.Wallet(PRIVATE_KEY_2, sepoliaProvider);
    
    console.log(`🤖 Resolver Address: ${resolverWallet.address}`);

    const ESCROW_FACTORY_ABI = [
        "function createEscrow(bytes32 orderHash, address token, uint256 amount, bytes32 hashLock, uint256 timeLocks, address maker, address taker) payable returns (address)",
        "function authorizedResolvers(address) view returns (bool)",
        "function escrows(bytes32) view returns (address)"
    ];

    const ERC20_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)"
    ];

    try {
        const escrowFactory = new ethers.Contract(NETWORKS.sepolia.escrowFactory, ESCROW_FACTORY_ABI, resolverWallet);
        const usdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, resolverWallet);

        // Check resolver authorization
        console.log("\n🔐 Checking Authorization:");
        const isAuthorized = await escrowFactory.authorizedResolvers(resolverWallet.address);
        console.log(`Resolver authorized: ${isAuthorized}`);

        // Check user balances and allowances
        const userAddress = "0xF86eCcDc06855d5e56F3B4949D3D02Fa9396F100";
        console.log(`\n💰 Checking User (${userAddress}):`);
        
        const userBalance = await usdc.balanceOf(userAddress);
        const userAllowance = await usdc.allowance(userAddress, NETWORKS.sepolia.escrowFactory);
        
        console.log(`USDC Balance: ${ethers.formatUnits(userBalance, 6)} USDC`);
        console.log(`EscrowFactory Allowance: ${ethers.formatUnits(userAllowance, 6)} USDC`);

        // Check resolver balances
        console.log(`\n🤖 Checking Resolver:`);
        const resolverBalance = await usdc.balanceOf(resolverWallet.address);
        const resolverEthBalance = await sepoliaProvider.getBalance(resolverWallet.address);
        
        console.log(`USDC Balance: ${ethers.formatUnits(resolverBalance, 6)} USDC`);
        console.log(`ETH Balance: ${ethers.formatEther(resolverEthBalance)} ETH`);

        // Try to simulate the exact call that's failing
        console.log("\n🧪 Simulating Escrow Creation:");
        const testOrderHash = ethers.randomBytes(32);
        const testHashLock = ethers.keccak256(ethers.randomBytes(32));
        const testAmount = ethers.parseUnits("1", 6); // 1 USDC
        const currentTime = Math.floor(Date.now() / 1000);
        
        const testTimeLocks = 
            BigInt(currentTime) |
            (BigInt(currentTime + 300) << 32n) |
            (BigInt(currentTime + 600) << 64n) |
            (BigInt(currentTime + 1800) << 96n) |
            (BigInt(currentTime + 86400) << 128n);

        console.log(`Order Hash: ${ethers.hexlify(testOrderHash)}`);
        console.log(`Hash Lock: ${testHashLock}`);
        console.log(`Amount: ${ethers.formatUnits(testAmount, 6)} USDC`);
        console.log(`User: ${userAddress}`);
        console.log(`Resolver: ${resolverWallet.address}`);

        // Check if escrow already exists
        const existingEscrow = await escrowFactory.escrows(testOrderHash);
        console.log(`Existing escrow: ${existingEscrow}`);

        // Try static call first to see the exact error
        console.log("\n🔍 Testing with static call...");
        try {
            await escrowFactory.createEscrow.staticCall(
                testOrderHash,
                NETWORKS.sepolia.usdc,
                testAmount,
                testHashLock,
                testTimeLocks,
                userAddress, // maker
                resolverWallet.address, // taker
                {
                    value: ethers.parseEther("0.01"), // 0.01 ETH safety deposit
                    gasLimit: 2000000 // High gas limit
                }
            );
            console.log("✅ Static call succeeded - should work");
        } catch (staticError) {
            console.log("❌ Static call failed:");
            console.log("Error:", staticError.message);
            
            // Check if it's a specific revert reason
            if (staticError.data) {
                console.log("Error data:", staticError.data);
                
                // Try to decode common errors
                const errorSig = staticError.data.slice(0, 10);
                console.log("Error signature:", errorSig);
                
                if (errorSig === "0xfb8f41b2") {
                    console.log("🔍 This is a custom error - likely insufficient allowance or balance");
                }
            }
            
            // Check specific conditions that might cause the revert
            console.log("\n🔍 Checking potential issues:");
            
            if (userAllowance < testAmount) {
                console.log("❌ Issue: User hasn't approved enough tokens to EscrowFactory");
                console.log(`Need: ${ethers.formatUnits(testAmount, 6)} USDC`);
                console.log(`Have: ${ethers.formatUnits(userAllowance, 6)} USDC`);
            }
            
            if (userBalance < testAmount) {
                console.log("❌ Issue: User doesn't have enough tokens");
            }
            
            if (!isAuthorized) {
                console.log("❌ Issue: Resolver not authorized");
            }
        }

    } catch (error) {
        console.error("\n❌ Debug failed:");
        console.error("Error:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
}

debugRevert().catch(console.error);