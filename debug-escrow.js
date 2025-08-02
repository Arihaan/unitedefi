#!/usr/bin/env node

import { ethers } from 'ethers';

// Test the escrow states and understand what's failing
const NETWORKS = {
  celo: {
    chainId: 44787,
    rpcUrl: "https://celo-alfajores.drpc.org",
    usdc: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    escrowFactory: "0x739c229A3d05F00Fb49418662774c0770cE713C6"
  }
};

const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User

const ESCROW_ABI = [
    "function withdraw(bytes32 secret) external",
    "function getState() view returns (string)",
    "function revealedSecret() view returns (bytes32)",
    "function immutables() view returns (tuple(bytes32 orderHash, bytes32 hashLock, address maker, address taker, address token, uint256 amount, uint256 safetyDeposit, uint256 timeLocks))",
    "function timeLocks() view returns (tuple(uint32 deployedAt, uint32 withdrawal, uint32 publicWithdrawal, uint32 cancellation, uint32 publicCancellation))",
    "function withdrawn() view returns (bool)",
    "function cancelled() view returns (bool)"
];

async function debugEscrow() {
    console.log("🔍 Debugging Escrow State");
    
    const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);
    const userCelo = new ethers.Wallet(PRIVATE_KEY_1, celoProvider);
    
    // Use the most recent escrow address from the failed test
    const escrowAddress = "0xa5AF387604e73dC9E4E1d4FB6AdF4C758d622515";
    const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, userCelo);
    
    try {
        console.log(`\n📍 Escrow Address: ${escrowAddress}`);
        console.log(`👤 User Address: ${userCelo.address}`);
        
        // Get current state
        const state = await escrow.getState();
        console.log(`📊 Current State: ${state}`);
        
        // Get timelock information
        const timeLocks = await escrow.timeLocks();
        console.log(`\n⏰ TimeLocks:`);
        console.log(`  deployedAt: ${timeLocks.deployedAt} (${new Date(Number(timeLocks.deployedAt) * 1000).toISOString()})`);
        console.log(`  withdrawal: ${timeLocks.withdrawal} (${new Date(Number(timeLocks.withdrawal) * 1000).toISOString()})`);
        console.log(`  publicWithdrawal: ${timeLocks.publicWithdrawal} (${new Date(Number(timeLocks.publicWithdrawal) * 1000).toISOString()})`);
        console.log(`  cancellation: ${timeLocks.cancellation} (${new Date(Number(timeLocks.cancellation) * 1000).toISOString()})`);
        console.log(`  publicCancellation: ${timeLocks.publicCancellation} (${new Date(Number(timeLocks.publicCancellation) * 1000).toISOString()})`);
        
        // Get current time
        const currentTime = Math.floor(Date.now() / 1000);
        console.log(`\n🕐 Current Time: ${currentTime} (${new Date(currentTime * 1000).toISOString()})`);
        
        // Check time calculations
        console.log(`\n⏳ Time Checks:`);
        console.log(`  Current >= deployedAt + withdrawal: ${currentTime >= Number(timeLocks.deployedAt) + Number(timeLocks.withdrawal)}`);
        console.log(`  Current < deployedAt + cancellation: ${currentTime < Number(timeLocks.deployedAt) + Number(timeLocks.cancellation)}`);
        
        // Get immutables
        const immutables = await escrow.immutables();
        console.log(`\n🔒 Immutables:`);
        console.log(`  maker: ${immutables.maker}`);
        console.log(`  taker: ${immutables.taker}`);
        console.log(`  User is taker: ${userCelo.address.toLowerCase() === immutables.taker.toLowerCase()}`);
        
        // Check withdrawn/cancelled status
        const withdrawn = await escrow.withdrawn();
        const cancelled = await escrow.cancelled();
        console.log(`\n📊 Status:`);
        console.log(`  withdrawn: ${withdrawn}`);
        console.log(`  cancelled: ${cancelled}`);
        
        // Try to call the contract with static call to see the revert reason
        const secret = "0xd49f2e04a582add9410db9eb6038374457a3cfca007e73d1ade3cc1d9f79d3fb";
        console.log(`\n🔑 Testing withdrawal with secret: ${secret}`);
        
        try {
            // Use staticCall to see what would happen without sending transaction
            await escrow.withdraw.staticCall(secret);
            console.log("✅ Static call succeeded - withdrawal should work");
        } catch (error) {
            console.log("❌ Static call failed:", error.message);
            if (error.data) {
                console.log("Error data:", error.data);
            }
        }
        
    } catch (error) {
        console.error("❌ Debug failed:", error.message);
        console.error("Stack:", error.stack);
    }
}

debugEscrow().catch(console.error);