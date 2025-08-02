#!/usr/bin/env node

import { ethers } from 'ethers';
import { NETWORKS } from './resolver/src/config.js';

// Test accounts
const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User wallet
const PRIVATE_KEY_2 = "0x7ca0c4f3bcad95308bbf1b5687e8e38c59a00f8b8b56e0666a5c6b689466f2a2"; // Resolver wallet

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const ESCROW_FACTORY_ABI = [
    "function createEscrow(bytes32 orderHash, address token, uint256 amount, bytes32 hashLock, uint256 timeLocks, address maker, address taker) payable returns (address)",
    "function authorizedResolvers(address) view returns (bool)"
];

async function manualCrossChainTest() {
    console.log("🔬 Manual Cross-Chain Test: Direct Contract Interaction");
    console.log("=" .repeat(60));

    // Setup providers and wallets
    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);
    
    const userWallet = new ethers.Wallet(PRIVATE_KEY_1, sepoliaProvider);
    const resolverWallet = new ethers.Wallet(PRIVATE_KEY_2, sepoliaProvider);
    
    const userCeloWallet = userWallet.connect(celoProvider);
    
    console.log(`👤 User Address: ${userWallet.address}`);
    console.log(`🤖 Resolver Address: ${resolverWallet.address}`);

    // Setup contracts
    const sepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userWallet);
    const celoUsdc = new ethers.Contract(NETWORKS.celo.usdc, ERC20_ABI, userCeloWallet);
    const escrowFactory = new ethers.Contract(NETWORKS.sepolia.escrowFactory, ESCROW_FACTORY_ABI, resolverWallet);

    try {
        // Step 1: Check initial balances
        console.log("\n📊 Initial Balances:");
        const initialSepoliaBalance = await sepoliaUsdc.balanceOf(userWallet.address);
        const initialCeloBalance = await celoUsdc.balanceOf(userWallet.address);
        
        console.log(`Sepolia USDC: ${ethers.formatUnits(initialSepoliaBalance, 6)} USDC`);
        console.log(`Celo USDC: ${ethers.formatUnits(initialCeloBalance, 6)} USDC`);

        // Step 2: Check resolver authorization
        console.log("\n🔐 Checking Authorization:");
        const isAuthorized = await escrowFactory.authorizedResolvers(resolverWallet.address);
        console.log(`Resolver authorized: ${isAuthorized}`);
        
        if (!isAuthorized) {
            throw new Error("❌ Resolver not authorized");
        }

        // Step 3: Check user allowances
        console.log("\n💳 Checking User Allowances:");
        const factoryAllowance = await sepoliaUsdc.allowance(userWallet.address, NETWORKS.sepolia.escrowFactory);
        const resolverUsdcBalance = await sepoliaUsdc.balanceOf(resolverWallet.address);
        
        console.log(`User → EscrowFactory: ${ethers.formatUnits(factoryAllowance, 6)} USDC`);
        console.log(`Resolver USDC balance: ${ethers.formatUnits(resolverUsdcBalance, 6)} USDC`);

        // Step 4: Approve if needed
        if (factoryAllowance < ethers.parseUnits("10", 6)) {
            console.log("Approving EscrowFactory...");
            const approveTx = await sepoliaUsdc.approve(NETWORKS.sepolia.escrowFactory, ethers.parseUnits("1000", 6));
            await approveTx.wait();
            console.log("✅ Approved");
        }

        // Step 5: Test direct escrow creation
        console.log("\n🏗️ Creating Escrow Directly:");
        
        const orderHash = ethers.randomBytes(32);
        const secret = ethers.randomBytes(32);
        const hashLock = ethers.keccak256(secret);
        const amount = ethers.parseUnits("1", 6); // 1 USDC
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Pack timelocks
        const timeLocks = 
            BigInt(currentTime) |
            (BigInt(currentTime + 300) << 32n) |  // withdrawal: 5 min
            (BigInt(currentTime + 600) << 64n) |  // public withdrawal: 10 min
            (BigInt(currentTime + 1800) << 96n) | // cancellation: 30 min
            (BigInt(currentTime + 86400) << 128n); // public cancellation: 1 day

        console.log(`Order Hash: ${ethers.hexlify(orderHash)}`);
        console.log(`Hash Lock: ${hashLock}`);
        console.log(`Amount: ${ethers.formatUnits(amount, 6)} USDC`);
        console.log(`Secret: ${ethers.hexlify(secret)}`);

        // Before creating escrow, transfer tokens to resolver so it can fund the escrow
        console.log("\n💸 Transferring tokens to resolver for escrow funding...");
        const transferTx = await sepoliaUsdc.transfer(resolverWallet.address, amount);
        await transferTx.wait();
        console.log("✅ Tokens transferred to resolver");

        // Now resolver approves the factory to spend its tokens
        const resolverUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, resolverWallet);
        const approveResolverTx = await resolverUsdc.approve(NETWORKS.sepolia.escrowFactory, amount);
        await approveResolverTx.wait();
        console.log("✅ Resolver approved factory");

        // Create escrow with safety deposit
        const safetyDeposit = ethers.parseEther("0.01"); // 0.01 ETH
        console.log(`\n🏦 Creating escrow with ${ethers.formatEther(safetyDeposit)} ETH safety deposit...`);
        
        const createTx = await escrowFactory.createEscrow(
            orderHash,
            NETWORKS.sepolia.usdc,
            amount,
            hashLock,
            timeLocks,
            userWallet.address, // maker
            resolverWallet.address, // taker (resolver)
            { value: safetyDeposit }
        );
        
        const receipt = await createTx.wait();
        console.log("✅ Escrow created successfully!");
        console.log(`Transaction: ${createTx.hash}`);
        
        // Get escrow address from events
        const escrowCreatedEvent = receipt.logs.find(log => 
            log.topics[0] === ethers.id("EscrowCreated(bytes32,address,address,uint256,bytes32,uint256)")
        );
        
        if (escrowCreatedEvent) {
            const escrowAddress = ethers.getAddress("0x" + escrowCreatedEvent.topics[2].slice(-40));
            console.log(`🏦 Escrow Address: ${escrowAddress}`);
            
            // Check escrow state
            const ESCROW_ABI = [
                "function getState() view returns (string)",
                "function immutables() view returns ((bytes32,bytes32,address,address,address,uint256,uint256,uint256))"
            ];
            
            const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, userWallet);
            const state = await escrow.getState();
            console.log(`🔒 Escrow State: ${state}`);
            
            // Check final balances
            console.log("\n📊 Final Balances:");
            const finalSepoliaBalance = await sepoliaUsdc.balanceOf(userWallet.address);
            const finalCeloBalance = await celoUsdc.balanceOf(userWallet.address);
            
            console.log(`Sepolia USDC: ${ethers.formatUnits(finalSepoliaBalance, 6)} USDC`);
            console.log(`Celo USDC: ${ethers.formatUnits(finalCeloBalance, 6)} USDC`);
            
            const sepoliaChange = finalSepoliaBalance - initialSepoliaBalance;
            console.log(`📈 Sepolia Change: ${ethers.formatUnits(sepoliaChange, 6)} USDC`);
            
            console.log("\n🎉 Manual test completed successfully!");
            console.log("✅ Escrow creation works - the issue is likely in the resolver logic");
            console.log(`🔑 Use secret ${ethers.hexlify(secret)} to withdraw from escrow ${escrowAddress}`);
        }

    } catch (error) {
        console.error("\n❌ Manual Test Failed:");
        console.error("Error:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
        console.error("\n🔧 Stack trace:");
        console.error(error.stack);
    }
}

manualCrossChainTest().catch(console.error);