#!/usr/bin/env node

import { ethers } from 'ethers';

// Quick test of fixed timelock logic
const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    usdc: "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d",
    escrowFactory: "0xBe15Ff1F63a6c23Ea7Dd1648d3C16722049d9d37"
  }
};

const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User
const PRIVATE_KEY_2 = "0x7ca0c4f3bcad95308bbf1b5687e8e38c59a00f8b8b56e0666a5c6b689466f2a2"; // Resolver

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)"
];

const ESCROW_FACTORY_ABI = [
    "function createEscrow(bytes32 orderHash, address token, uint256 amount, bytes32 hashLock, uint256 timeLocks, address maker, address taker) payable returns (address)"
];

const ESCROW_ABI = [
    "function withdraw(bytes32 secret) external",
    "function getState() view returns (string)"
];

async function quickTest() {
    console.log("⚡ Quick Test - Fixed Timelock Logic");
    
    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const userSepolia = new ethers.Wallet(PRIVATE_KEY_1, sepoliaProvider);
    const resolverSepolia = new ethers.Wallet(PRIVATE_KEY_2, sepoliaProvider);
    
    const sepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userSepolia);
    const sepoliaFactory = new ethers.Contract(NETWORKS.sepolia.escrowFactory, ESCROW_FACTORY_ABI, resolverSepolia);
    
    const amount = ethers.parseUnits("0.1", 6); // 0.1 USDC for quick test
    
    try {
        console.log("💳 Setting up approvals...");
        const approveTx = await sepoliaUsdc.approve(resolverSepolia.address, amount);
        await approveTx.wait();
        console.log("✅ User approved resolver");
        
        console.log("🔐 Generating parameters...");
        const secret = ethers.randomBytes(32);
        const hashLock = ethers.keccak256(secret);
        const orderHash = ethers.randomBytes(32);
        
        // Create very short timelocks for quick testing
        const currentTime = Math.floor(Date.now() / 1000);
        const timeLocks = 
            BigInt(currentTime) |
            (BigInt(currentTime + 5) << 32n) |     // withdrawal: 5 seconds
            (BigInt(currentTime + 10) << 64n) |    // public withdrawal: 10 seconds  
            (BigInt(currentTime + 60) << 96n) |    // cancellation: 1 minute
            (BigInt(currentTime + 120) << 128n);   // public cancellation: 2 minutes
        
        console.log("⛓️ Creating escrow...");
        
        // Resolver takes tokens first
        const resolverUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, resolverSepolia);
        const takeTokensTx = await resolverUsdc.transferFrom(userSepolia.address, resolverSepolia.address, amount);
        await takeTokensTx.wait();
        console.log("✅ Resolver took tokens");
        
        // Resolver approves factory
        const approveFactoryTx = await resolverUsdc.approve(NETWORKS.sepolia.escrowFactory, amount);
        await approveFactoryTx.wait();
        console.log("✅ Resolver approved factory");
        
        // Create escrow
        const escrowTx = await sepoliaFactory.createEscrow(
            orderHash,
            NETWORKS.sepolia.usdc,
            amount,
            hashLock,
            timeLocks,
            userSepolia.address, // maker
            resolverSepolia.address, // taker
            {
                value: ethers.parseEther("0.001"), // small safety deposit
                gasLimit: 2000000
            }
        );
        
        const receipt = await escrowTx.wait();
        console.log("✅ Escrow created!");
        
        // Get escrow address
        const escrowEvent = receipt.logs.find(log => 
            log.topics[0] === ethers.id("EscrowCreated(bytes32,address,address,uint256,bytes32,uint256)")
        );
        const escrowAddress = ethers.getAddress("0x" + escrowEvent.topics[2].slice(-40));
        console.log(`🏦 Escrow: ${escrowAddress}`);
        
        const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, resolverSepolia);
        
        // Check initial state
        let state = await escrow.getState();
        console.log(`📊 Initial state: ${state}`);
        
        // Wait for withdrawal period
        console.log("⏳ Waiting 7 seconds for withdrawal period...");
        await new Promise(resolve => setTimeout(resolve, 7000));
        
        // Check state after waiting
        state = await escrow.getState();
        console.log(`📊 State after waiting: ${state}`);
        
        // Try withdrawal
        console.log("🔓 Attempting withdrawal...");
        const withdrawTx = await escrow.withdraw(secret, { gasLimit: 500000 });
        await withdrawTx.wait();
        console.log("✅ Withdrawal successful!");
        
        // Final state
        state = await escrow.getState();
        console.log(`📊 Final state: ${state}`);
        
        console.log("\n🎉 QUICK TEST PASSED!");
        console.log("✅ Fixed timelock logic is working correctly");
        
    } catch (error) {
        console.error("❌ Quick test failed:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
}

quickTest().catch(console.error);