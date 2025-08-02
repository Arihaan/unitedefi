#!/usr/bin/env node

import { ethers } from 'ethers';
import { NETWORKS } from './resolver/src/config.js';

// Test accounts
const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User wallet

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

async function fixApprovalFlow() {
    console.log("🔧 Fixing User Token Approval Flow");
    console.log("=" .repeat(50));

    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);
    
    const userSepoliaWallet = new ethers.Wallet(PRIVATE_KEY_1, sepoliaProvider);
    const userCeloWallet = new ethers.Wallet(PRIVATE_KEY_1, celoProvider);
    
    console.log(`👤 User Address: ${userSepoliaWallet.address}`);

    try {
        // Setup contract instances
        const sepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userSepoliaWallet);
        const celoUsdc = new ethers.Contract(NETWORKS.celo.usdc, ERC20_ABI, userCeloWallet);

        // Check current allowances
        console.log("\n📊 Current Allowances:");
        const sepoliaFactoryAllowance = await sepoliaUsdc.allowance(
            userSepoliaWallet.address, 
            NETWORKS.sepolia.escrowFactory
        );
        const celoFactoryAllowance = await celoUsdc.allowance(
            userCeloWallet.address, 
            NETWORKS.celo.escrowFactory
        );
        
        console.log(`Sepolia USDC → EscrowFactory: ${ethers.formatUnits(sepoliaFactoryAllowance, 6)} USDC`);
        console.log(`Celo USDC → EscrowFactory: ${ethers.formatUnits(celoFactoryAllowance, 6)} USDC`);

        // Approve escrow factories for large amounts
        const approvalAmount = ethers.parseUnits("1000000", 6); // 1M USDC

        if (sepoliaFactoryAllowance < ethers.parseUnits("1000", 6)) {
            console.log("\n💳 Approving Sepolia EscrowFactory...");
            const approveTx1 = await sepoliaUsdc.approve(NETWORKS.sepolia.escrowFactory, approvalAmount);
            console.log(`Transaction hash: ${approveTx1.hash}`);
            await approveTx1.wait();
            console.log("✅ Sepolia EscrowFactory approved");
        } else {
            console.log("✅ Sepolia EscrowFactory already has sufficient approval");
        }

        if (celoFactoryAllowance < ethers.parseUnits("1000", 6)) {
            console.log("\n💳 Approving Celo EscrowFactory...");
            const approveTx2 = await celoUsdc.approve(NETWORKS.celo.escrowFactory, approvalAmount);
            console.log(`Transaction hash: ${approveTx2.hash}`);
            await approveTx2.wait();
            console.log("✅ Celo EscrowFactory approved");
        } else {
            console.log("✅ Celo EscrowFactory already has sufficient approval");
        }

        // Verify final allowances
        console.log("\n📊 Final Allowances:");
        const finalSepoliaAllowance = await sepoliaUsdc.allowance(
            userSepoliaWallet.address, 
            NETWORKS.sepolia.escrowFactory
        );
        const finalCeloAllowance = await celoUsdc.allowance(
            userCeloWallet.address, 
            NETWORKS.celo.escrowFactory
        );
        
        console.log(`Sepolia USDC → EscrowFactory: ${ethers.formatUnits(finalSepoliaAllowance, 6)} USDC`);
        console.log(`Celo USDC → EscrowFactory: ${ethers.formatUnits(finalCeloAllowance, 6)} USDC`);

        console.log("\n🎉 User token approvals fixed!");
        console.log("✅ Now the resolver should be able to create escrows that pull user tokens directly");

    } catch (error) {
        console.error("\n❌ Failed to fix approval flow:");
        console.error("Error:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
}

fixApprovalFlow().catch(console.error);