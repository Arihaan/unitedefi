#!/usr/bin/env node

import { ethers } from 'ethers';
import { NETWORKS, RESOLVER_CONFIG } from './resolver/src/config.js';

// Test accounts
const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User wallet

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

async function fixResolverApproval() {
    console.log("🔧 Fixing User → Resolver Token Approval");
    console.log("=" .repeat(50));

    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);
    
    const userSepoliaWallet = new ethers.Wallet(PRIVATE_KEY_1, sepoliaProvider);
    const userCeloWallet = new ethers.Wallet(PRIVATE_KEY_1, celoProvider);
    
    console.log(`👤 User Address: ${userSepoliaWallet.address}`);
    console.log(`🤖 Resolver Address: ${RESOLVER_CONFIG.address}`);

    try {
        // Setup contract instances
        const sepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userSepoliaWallet);
        const celoUsdc = new ethers.Contract(NETWORKS.celo.usdc, ERC20_ABI, userCeloWallet);

        // Check current allowances to resolver
        console.log("\n📊 Current Allowances to Resolver:");
        const sepoliaResolverAllowance = await sepoliaUsdc.allowance(
            userSepoliaWallet.address, 
            RESOLVER_CONFIG.address
        );
        const celoResolverAllowance = await celoUsdc.allowance(
            userCeloWallet.address, 
            RESOLVER_CONFIG.address
        );
        
        console.log(`Sepolia USDC → Resolver: ${ethers.formatUnits(sepoliaResolverAllowance, 6)} USDC`);
        console.log(`Celo USDC → Resolver: ${ethers.formatUnits(celoResolverAllowance, 6)} USDC`);

        // Approve resolver for large amounts
        const approvalAmount = ethers.parseUnits("1000000", 6); // 1M USDC

        if (sepoliaResolverAllowance < ethers.parseUnits("1000", 6)) {
            console.log("\n💳 Approving Resolver on Sepolia...");
            const approveTx1 = await sepoliaUsdc.approve(RESOLVER_CONFIG.address, approvalAmount);
            console.log(`Transaction hash: ${approveTx1.hash}`);
            console.log("Waiting for confirmation...");
            await approveTx1.wait();
            console.log("✅ Sepolia Resolver approved");
        } else {
            console.log("✅ Sepolia Resolver already has sufficient approval");
        }

        if (celoResolverAllowance < ethers.parseUnits("1000", 6)) {
            console.log("\n💳 Approving Resolver on Celo...");
            const approveTx2 = await celoUsdc.approve(RESOLVER_CONFIG.address, approvalAmount);
            console.log(`Transaction hash: ${approveTx2.hash}`);
            console.log("Waiting for confirmation...");
            await approveTx2.wait();
            console.log("✅ Celo Resolver approved");
        } else {
            console.log("✅ Celo Resolver already has sufficient approval");
        }

        // Verify final allowances
        console.log("\n📊 Final Allowances to Resolver:");
        const finalSepoliaAllowance = await sepoliaUsdc.allowance(
            userSepoliaWallet.address, 
            RESOLVER_CONFIG.address
        );
        const finalCeloAllowance = await celoUsdc.allowance(
            userCeloWallet.address, 
            RESOLVER_CONFIG.address
        );
        
        console.log(`Sepolia USDC → Resolver: ${ethers.formatUnits(finalSepoliaAllowance, 6)} USDC`);
        console.log(`Celo USDC → Resolver: ${ethers.formatUnits(finalCeloAllowance, 6)} USDC`);

        console.log("\n🎉 User → Resolver approvals fixed!");
        console.log("✅ Now the resolver can take user tokens and fund escrows");

    } catch (error) {
        console.error("\n❌ Failed to fix resolver approval:");
        console.error("Error:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
}

fixResolverApproval().catch(console.error);