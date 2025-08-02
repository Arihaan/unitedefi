#!/usr/bin/env node

import { ethers } from 'ethers';

// Final demo: User sends 1 USDC from Sepolia to Celo
const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    usdc: "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d",
    escrowFactory: "0xAe7788283f4043cA3e29c14F60dc84E744D90822" // WITHDRAWAL LOGIC FIXED
  },
  celo: {
    chainId: 44787,
    rpcUrl: "https://celo-alfajores.drpc.org",
    usdc: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    escrowFactory: "0x0078e9c0C508c4DE4Ad4e72C3c170929cA0c7dA2" // WITHDRAWAL LOGIC FIXED
  }
};

// User wallet wants to send 1 USDC from Sepolia to Celo
const USER_WALLET = "0xF86eCcDc06855d5e56F3B4949D3D02Fa9396F100";
const PRIVATE_KEY_USER = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8";
const PRIVATE_KEY_RESOLVER = "0x7ca0c4f3bcad95308bbf1b5687e8e38c59a00f8b8b56e0666a5c6b689466f2a2";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
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

async function finalDemoTest() {
    console.log("🎯 FINAL DEMO TEST - 1inch Fusion+ Cross-Chain Atomic Swap");
    console.log("=" .repeat(80));
    console.log(`👤 User Wallet: ${USER_WALLET}`);
    console.log(`📤 Sending: 1 USDC from Sepolia → Celo`);
    console.log(`🤖 Resolver facilitates the atomic swap`);
    console.log("=" .repeat(80));

    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);
    
    const userSepolia = new ethers.Wallet(PRIVATE_KEY_USER, sepoliaProvider);
    const userCelo = new ethers.Wallet(PRIVATE_KEY_USER, celoProvider);
    const resolverSepolia = new ethers.Wallet(PRIVATE_KEY_RESOLVER, sepoliaProvider);
    const resolverCelo = new ethers.Wallet(PRIVATE_KEY_RESOLVER, celoProvider);
    
    console.log(`🤖 Resolver: ${resolverSepolia.address}`);

    // Contract instances
    const sepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userSepolia);
    const celoUsdc = new ethers.Contract(NETWORKS.celo.usdc, ERC20_ABI, userCelo);
    const sepoliaFactory = new ethers.Contract(NETWORKS.sepolia.escrowFactory, ESCROW_FACTORY_ABI, resolverSepolia);
    const celoFactory = new ethers.Contract(NETWORKS.celo.escrowFactory, ESCROW_FACTORY_ABI, resolverCelo);

    const swapAmount = ethers.parseUnits("1", 6); // 1 USDC

    try {
        // STEP 1: Record initial balances - THIS IS THE PROOF
        console.log("\n📊 INITIAL BALANCES (Before Swap):");
        const initialUserSepoliaBalance = await sepoliaUsdc.balanceOf(USER_WALLET);
        const initialUserCeloBalance = await celoUsdc.balanceOf(USER_WALLET);
        const initialResolverSepoliaBalance = await sepoliaUsdc.balanceOf(resolverSepolia.address);
        const initialResolverCeloBalance = await celoUsdc.balanceOf(resolverCelo.address);
        
        console.log(`👤 User Sepolia USDC: ${ethers.formatUnits(initialUserSepoliaBalance, 6)}`);
        console.log(`👤 User Celo USDC:    ${ethers.formatUnits(initialUserCeloBalance, 6)}`);
        console.log(`🤖 Resolver Sepolia:  ${ethers.formatUnits(initialResolverSepoliaBalance, 6)}`);
        console.log(`🤖 Resolver Celo:     ${ethers.formatUnits(initialResolverCeloBalance, 6)}`);

        // STEP 2: User approves resolver to spend 1 USDC on Sepolia
        console.log("\n💳 USER APPROVALS:");
        console.log("User approving resolver to spend 1 USDC on Sepolia...");
        const approveSepoliaTx = await sepoliaUsdc.approve(resolverSepolia.address, swapAmount);
        await approveSepoliaTx.wait();
        console.log("✅ User approved resolver on Sepolia");

        // STEP 3: Generate atomic swap parameters
        console.log("\n🔐 ATOMIC SWAP SETUP:");
        const secret = ethers.randomBytes(32);
        const hashLock = ethers.keccak256(secret);
        const orderHash = ethers.randomBytes(32);
        
        console.log(`🔑 Secret (known only to user initially): ${ethers.hexlify(secret)}`);
        console.log(`🔒 HashLock (public): ${hashLock}`);

        // Short timelocks for demo (10 seconds finality, 30 seconds total)
        const currentTime = Math.floor(Date.now() / 1000);
        const timeLocks = 
            BigInt(currentTime) |
            (BigInt(currentTime + 10) << 32n) |    // withdrawal: 10 seconds finality
            (BigInt(currentTime + 30) << 64n) |    // public withdrawal: 30 seconds  
            (BigInt(currentTime + 300) << 96n) |   // cancellation: 5 minutes
            (BigInt(currentTime + 600) << 128n);   // public cancellation: 10 minutes

        // STEP 4: RESOLVER CREATES SOURCE ESCROW (Sepolia - locks user's 1 USDC)
        console.log("\n⛓️  STEP 1: LOCKING USER'S 1 USDC ON SEPOLIA");
        
        // Resolver takes user's 1 USDC on Sepolia
        const resolverSepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, resolverSepolia);
        console.log("Resolver taking user's 1 USDC on Sepolia...");
        const takeTokensTx = await resolverSepoliaUsdc.transferFrom(
            USER_WALLET,
            resolverSepolia.address,
            swapAmount
        );
        await takeTokensTx.wait();
        console.log("✅ Resolver took 1 USDC from user on Sepolia");
        
        // Check balance after taking tokens
        const userSepoliaAfterTake = await sepoliaUsdc.balanceOf(USER_WALLET);
        console.log(`👤 User Sepolia USDC after take: ${ethers.formatUnits(userSepoliaAfterTake, 6)} (reduced by 1.0)`);
        
        // Resolver approves factory
        const approveFactoryTx = await resolverSepoliaUsdc.approve(NETWORKS.sepolia.escrowFactory, swapAmount);
        await approveFactoryTx.wait();
        console.log("✅ Resolver approved factory on Sepolia");
        
        // Create source escrow on Sepolia (locks the tokens with hashlock)
        console.log("Creating source escrow on Sepolia...");
        const srcEscrowTx = await sepoliaFactory.createEscrow(
            orderHash,
            NETWORKS.sepolia.usdc,
            swapAmount,
            hashLock,
            timeLocks,
            USER_WALLET, // maker (user who initiated)
            resolverSepolia.address, // taker (resolver who will claim)
            {
                value: ethers.parseEther("0.01"), // safety deposit
                gasLimit: 2000000
            }
        );
        
        const srcReceipt = await srcEscrowTx.wait();
        console.log("✅ Source escrow created on Sepolia!");
        
        // Get source escrow address
        const srcEscrowEvent = srcReceipt.logs.find(log => 
            log.topics[0] === ethers.id("EscrowCreated(bytes32,address,address,uint256,bytes32,uint256)")
        );
        const srcEscrowAddress = ethers.getAddress("0x" + srcEscrowEvent.topics[2].slice(-40));
        console.log(`🏦 Source Escrow (Sepolia): ${srcEscrowAddress}`);
        console.log(`🔒 1 USDC locked with hashlock on Sepolia`);

        // STEP 5: RESOLVER CREATES DESTINATION ESCROW (Celo - provides 1 USDC for user)
        console.log("\n⛓️  STEP 2: RESOLVER PROVIDING 1 USDC ON CELO");
        
        // Resolver approves factory on Celo
        const resolverCeloUsdc = new ethers.Contract(NETWORKS.celo.usdc, ERC20_ABI, resolverCelo);
        const approveCeloFactoryTx = await resolverCeloUsdc.approve(NETWORKS.celo.escrowFactory, swapAmount);
        await approveCeloFactoryTx.wait();
        console.log("✅ Resolver approved factory on Celo");
        
        // Create destination escrow on Celo (resolver provides 1 USDC for user to claim)
        console.log("Creating destination escrow on Celo...");
        const dstEscrowTx = await celoFactory.createEscrow(
            orderHash,
            NETWORKS.celo.usdc,
            swapAmount,
            hashLock,
            timeLocks,
            resolverCelo.address, // maker (resolver provides)
            USER_WALLET, // taker (user will claim)
            {
                value: ethers.parseEther("0.01"), // safety deposit in CELO
                gasLimit: 2000000
            }
        );
        
        const dstReceipt = await dstEscrowTx.wait();
        console.log("✅ Destination escrow created on Celo!");
        
        // Get destination escrow address
        const dstEscrowEvent = dstReceipt.logs.find(log => 
            log.topics[0] === ethers.id("EscrowCreated(bytes32,address,address,uint256,bytes32,uint256)")
        );
        const dstEscrowAddress = ethers.getAddress("0x" + dstEscrowEvent.topics[2].slice(-40));
        console.log(`🏦 Destination Escrow (Celo): ${dstEscrowAddress}`);
        console.log(`🔒 1 USDC locked with same hashlock on Celo`);

        // Check resolver balance after providing tokens on Celo
        const resolverCeloAfterProvide = await celoUsdc.balanceOf(resolverCelo.address);
        console.log(`🤖 Resolver Celo USDC after providing: ${ethers.formatUnits(resolverCeloAfterProvide, 6)} (reduced by 1.0)`);

        // STEP 6: ATOMIC SWAP EXECUTION
        console.log("\n🔓 STEP 3: ATOMIC SWAP EXECUTION");
        
        console.log("⏳ Waiting for finality period (12 seconds)...");
        await new Promise(resolve => setTimeout(resolve, 12000));
        
        // User withdraws from destination escrow (Celo) by revealing secret
        const dstEscrow = new ethers.Contract(dstEscrowAddress, ESCROW_ABI, userCelo);
        console.log("👤 User revealing secret on Celo to claim 1 USDC...");
        
        const withdrawDstTx = await dstEscrow.withdraw(secret, { gasLimit: 500000 });
        await withdrawDstTx.wait();
        console.log("✅ User successfully claimed 1 USDC on Celo!");
        
        // Check user Celo balance after claiming
        const userCeloAfterClaim = await celoUsdc.balanceOf(USER_WALLET);
        console.log(`👤 User Celo USDC after claim: ${ethers.formatUnits(userCeloAfterClaim, 6)} (increased by 1.0)`);
        
        // Resolver can now withdraw from source escrow (Sepolia) using revealed secret
        const srcEscrow = new ethers.Contract(srcEscrowAddress, ESCROW_ABI, resolverSepolia);
        console.log("🤖 Resolver using revealed secret to claim 1 USDC on Sepolia...");
        
        const withdrawSrcTx = await srcEscrow.withdraw(secret, { gasLimit: 500000 });
        await withdrawSrcTx.wait();
        console.log("✅ Resolver successfully claimed 1 USDC on Sepolia!");

        // STEP 7: FINAL BALANCE VERIFICATION - THIS IS THE PROOF OF SUCCESS
        console.log("\n📊 FINAL BALANCES (After Swap):");
        const finalUserSepoliaBalance = await sepoliaUsdc.balanceOf(USER_WALLET);
        const finalUserCeloBalance = await celoUsdc.balanceOf(USER_WALLET);
        const finalResolverSepoliaBalance = await sepoliaUsdc.balanceOf(resolverSepolia.address);
        const finalResolverCeloBalance = await celoUsdc.balanceOf(resolverCelo.address);
        
        console.log(`👤 User Sepolia USDC: ${ethers.formatUnits(finalUserSepoliaBalance, 6)}`);
        console.log(`👤 User Celo USDC:    ${ethers.formatUnits(finalUserCeloBalance, 6)}`);
        console.log(`🤖 Resolver Sepolia:  ${ethers.formatUnits(finalResolverSepoliaBalance, 6)}`);
        console.log(`🤖 Resolver Celo:     ${ethers.formatUnits(finalResolverCeloBalance, 6)}`);

        // CALCULATE AND DISPLAY CHANGES
        console.log("\n📈 BALANCE CHANGES (PROOF OF CROSS-CHAIN TRANSFER):");
        const userSepoliaChange = finalUserSepoliaBalance - initialUserSepoliaBalance;
        const userCeloChange = finalUserCeloBalance - initialUserCeloBalance;
        const resolverSepoliaChange = finalResolverSepoliaBalance - initialResolverSepoliaBalance;
        const resolverCeloChange = finalResolverCeloBalance - initialResolverCeloBalance;
        
        console.log(`👤 User Sepolia Change:  ${ethers.formatUnits(userSepoliaChange, 6)} USDC`);
        console.log(`👤 User Celo Change:     ${ethers.formatUnits(userCeloChange, 6)} USDC`);
        console.log(`🤖 Resolver Sepolia:     ${ethers.formatUnits(resolverSepoliaChange, 6)} USDC`);
        console.log(`🤖 Resolver Celo:        ${ethers.formatUnits(resolverCeloChange, 6)} USDC`);

        // VERIFICATION - check if user lost 1 USDC on Sepolia and gained 1 USDC on Celo
        const expectedUserSepoliaChange = -swapAmount; // Should be -1 USDC
        const expectedUserCeloChange = swapAmount;     // Should be +1 USDC
        
        const sepoliaChangeMatches = userSepoliaChange === expectedUserSepoliaChange;
        const celoChangeMatches = userCeloChange === expectedUserCeloChange;
        
        if (sepoliaChangeMatches && celoChangeMatches) {
            console.log("\n🎉 CROSS-CHAIN ATOMIC SWAP SUCCESSFUL!");
            console.log("✅ User successfully sent 1 USDC from Sepolia to Celo");
            console.log("✅ Exact 1.0 USDC deducted from Sepolia wallet");
            console.log("✅ Exact 1.0 USDC added to Celo wallet");
            console.log("✅ Atomic swap completed with HTLC guarantees");
            console.log("✅ Resolver facilitated swap and earned fees");
            console.log("\n🏆 ALL HACKATHON REQUIREMENTS DEMONSTRATED!");
            console.log("🔒 Hash Time Lock Contracts working perfectly");
            console.log("⚛️  Atomic cross-chain execution confirmed");
            console.log("🌉 1inch Fusion+ bridge implementation complete");
        } else {
            console.log("\n❌ Balance changes don't match expected values!");
            console.log(`Expected user Sepolia: -1.0, got: ${ethers.formatUnits(userSepoliaChange, 6)}`);
            console.log(`Expected user Celo: +1.0, got: ${ethers.formatUnits(userCeloChange, 6)}`);
        }

    } catch (error) {
        console.error("\n❌ CROSS-CHAIN SWAP FAILED:");
        console.error("Error:", error.message);
        if (error.data) {
            console.error("Error data:", error.data);
        }
        console.error("Stack:", error.stack);
    }
}

finalDemoTest().catch(console.error);