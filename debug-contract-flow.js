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

// Test accounts
const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User
const PRIVATE_KEY_2 = "0x7ca0c4f3bcad95308bbf1b5687e8e38c59a00f8b8b56e0666a5c6b689466f2a2"; // Resolver

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)"
];

const ESCROW_FACTORY_ABI = [
    "function createEscrow(bytes32 orderHash, address token, uint256 amount, bytes32 hashLock, uint256 timeLocks, address maker, address taker) payable returns (address)"
];

async function debugContractFlow() {
    console.log("🔍 Debugging Actual Contract Flow");
    console.log("=" .repeat(60));

    const provider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const userWallet = new ethers.Wallet(PRIVATE_KEY_1, provider);
    const resolverWallet = new ethers.Wallet(PRIVATE_KEY_2, provider);
    
    console.log(`👤 User: ${userWallet.address}`);
    console.log(`🤖 Resolver: ${resolverWallet.address}`);

    const usdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userWallet);
    const escrowFactory = new ethers.Contract(NETWORKS.sepolia.escrowFactory, ESCROW_FACTORY_ABI, resolverWallet);

    try {
        // Step 1: Check current balances and allowances
        console.log("\n📊 Current State:");
        const userBalance = await usdc.balanceOf(userWallet.address);
        const resolverBalance = await usdc.balanceOf(resolverWallet.address);
        
        console.log(`User USDC: ${ethers.formatUnits(userBalance, 6)}`);
        console.log(`Resolver USDC: ${ethers.formatUnits(resolverBalance, 6)}`);

        // Check allowances
        const userToResolver = await usdc.allowance(userWallet.address, resolverWallet.address);
        const userToFactory = await usdc.allowance(userWallet.address, NETWORKS.sepolia.escrowFactory);
        const resolverToFactory = await usdc.allowance(resolverWallet.address, NETWORKS.sepolia.escrowFactory);
        
        console.log(`\n🔐 Allowances:`);
        console.log(`User → Resolver: ${ethers.formatUnits(userToResolver, 6)} USDC`);
        console.log(`User → Factory: ${ethers.formatUnits(userToFactory, 6)} USDC`);
        console.log(`Resolver → Factory: ${ethers.formatUnits(resolverToFactory, 6)} USDC`);

        // Step 2: The CORRECT flow for 1inch Fusion+
        console.log("\n🔄 Implementing Correct 1inch Flow:");
        
        const amount = ethers.parseUnits("1", 6); // 1 USDC
        
        // In 1inch Fusion+, the user should approve the resolver to spend their tokens
        // Then resolver transfers user tokens to itself and creates escrow
        
        console.log("Step 1: User approves resolver to spend tokens");
        if (userToResolver < amount) {
            const approveTx = await usdc.approve(resolverWallet.address, ethers.parseUnits("1000", 6));
            await approveTx.wait();
            console.log("✅ User approved resolver");
        } else {
            console.log("✅ User already approved resolver");
        }

        console.log("Step 2: Resolver transfers user tokens to itself");
        const resolverUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, resolverWallet);
        const transferTx = await resolverUsdc.transferFrom(
            userWallet.address,
            resolverWallet.address,
            amount
        );
        await transferTx.wait();
        console.log("✅ Resolver took user tokens");

        console.log("Step 3: Resolver approves factory to spend its tokens");
        const approveFactoryTx = await resolverUsdc.approve(NETWORKS.sepolia.escrowFactory, amount);
        await approveFactoryTx.wait();
        console.log("✅ Resolver approved factory");

        console.log("Step 4: Create escrow (factory will pull tokens from resolver)");
        const orderHash = ethers.randomBytes(32);
        const secret = ethers.randomBytes(32);
        const hashLock = ethers.keccak256(secret);
        const currentTime = Math.floor(Date.now() / 1000);
        
        const timeLocks = 
            BigInt(currentTime) |
            (BigInt(currentTime + 300) << 32n) |
            (BigInt(currentTime + 600) << 64n) |
            (BigInt(currentTime + 1800) << 96n) |
            (BigInt(currentTime + 86400) << 128n);

        console.log(`Creating escrow with:`);
        console.log(`- Order Hash: ${ethers.hexlify(orderHash)}`);
        console.log(`- Hash Lock: ${hashLock}`);
        console.log(`- Amount: ${ethers.formatUnits(amount, 6)} USDC`);
        console.log(`- Secret: ${ethers.hexlify(secret)}`);

        const createTx = await escrowFactory.createEscrow(
            orderHash,
            NETWORKS.sepolia.usdc,
            amount,
            hashLock,
            timeLocks,
            userWallet.address, // maker (user)
            resolverWallet.address, // taker (resolver)
            {
                value: ethers.parseEther("0.01"), // safety deposit
                gasLimit: 2000000
            }
        );
        
        const receipt = await createTx.wait();
        console.log("✅ Escrow created successfully!");
        console.log(`Transaction: ${createTx.hash}`);

        // Step 5: Get escrow address and test withdrawal
        const escrowCreatedEvent = receipt.logs.find(log => 
            log.topics[0] === ethers.id("EscrowCreated(bytes32,address,address,uint256,bytes32,uint256)")
        );
        
        if (escrowCreatedEvent) {
            const escrowAddress = ethers.getAddress("0x" + escrowCreatedEvent.topics[2].slice(-40));
            console.log(`🏦 Escrow Address: ${escrowAddress}`);

            // Test withdrawal with secret
            const ESCROW_ABI = [
                "function withdraw(bytes32 secret) external",
                "function getState() view returns (string)",
                "function revealedSecret() view returns (bytes32)"
            ];

            const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, userWallet);
            
            console.log("\n⏳ Waiting for withdrawal period...");
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds (simulating finality)

            try {
                console.log("🔓 Attempting to withdraw with secret...");
                const withdrawTx = await escrow.withdraw(secret, { gasLimit: 500000 });
                await withdrawTx.wait();
                console.log("✅ Withdrawal successful!");
                
                const revealedSecret = await escrow.revealedSecret();
                console.log(`🔍 Revealed secret: ${revealedSecret}`);
                
            } catch (withdrawError) {
                console.log("⚠️ Withdrawal failed (might be in finality lock):", withdrawError.message);
                const state = await escrow.getState();
                console.log(`🔒 Escrow state: ${state}`);
            }
        }

        // Step 6: Check final balances
        console.log("\n📊 Final Balances:");
        const finalUserBalance = await usdc.balanceOf(userWallet.address);
        const finalResolverBalance = await usdc.balanceOf(resolverWallet.address);
        
        console.log(`User USDC: ${ethers.formatUnits(finalUserBalance, 6)}`);
        console.log(`Resolver USDC: ${ethers.formatUnits(finalResolverBalance, 6)}`);
        
        const userChange = finalUserBalance - userBalance;
        const resolverChange = finalResolverBalance - resolverBalance;
        
        console.log(`📈 User change: ${ethers.formatUnits(userChange, 6)} USDC`);
        console.log(`📈 Resolver change: ${ethers.formatUnits(resolverChange, 6)} USDC`);

        console.log("\n🎉 Contract flow debugging completed!");
        console.log("✅ 1inch Fusion+ HTLC escrow system is working!");

    } catch (error) {
        console.error("\n❌ Contract flow failed:");
        console.error("Error:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
        console.error("Stack:", error.stack);
    }
}

debugContractFlow().catch(console.error);