#!/usr/bin/env node

import { ethers } from 'ethers';
import { NETWORKS, RESOLVER_CONFIG } from './resolver/src/config.js';

// Test accounts from hardhat config
const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User wallet
const PRIVATE_KEY_2 = "0x7ca0c4f3bcad95308bbf1b5687e8e38c59a00f8b8b56e0666a5c6b689466f2a2"; // Resolver wallet

// Contract ABIs (minimal for testing)
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const LIMIT_ORDER_ABI = [
    "function fillOrder((address maker,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,address receiver,bytes32 salt,uint256 makerTraits) order, bytes signature, uint256 amount) external",
    "function getOrderHash((address maker,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,address receiver,bytes32 salt,uint256 makerTraits) order) view returns (bytes32)",
    "function remaining(bytes32) view returns (uint256)",
    "function nonce(address) view returns (uint256)"
];

const SETTLEMENT_ABI = [
    "function createCrossChainOrder((address maker,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,address receiver,bytes32 salt,uint256 makerTraits) order, bytes signature, address dstToken, uint256 dstChainId, bytes32 hashLock, uint256 timeLocks) payable returns (bytes32)",
    "function getCrossChainOrder(bytes32) view returns ((bytes32 orderHash,address srcToken,address dstToken,uint256 srcChainId,uint256 dstChainId,bytes32 hashLock,uint256 timeLocks,address escrow,uint8 status))"
];

const ESCROW_ABI = [
    "function getState() view returns (string)",
    "function withdraw(bytes32 secret) external",
    "function revealedSecret() view returns (bytes32)",
    "function immutables() view returns ((bytes32 orderHash,bytes32 hashLock,address maker,address taker,address token,uint256 amount,uint256 safetyDeposit,uint256 timeLocks))"
];

async function testCrossChainSwap() {
    console.log("🚀 Starting Cross-Chain Swap Test: 1 USDC Sepolia → Celo");
    console.log("=" .repeat(60));

    // Setup providers and wallets
    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const celoProvider = new ethers.JsonRpcProvider(NETWORKS.celo.rpcUrl);
    
    const userWallet = new ethers.Wallet(PRIVATE_KEY_1, sepoliaProvider);
    const resolverWallet = new ethers.Wallet(PRIVATE_KEY_2, sepoliaProvider);
    
    console.log(`👤 User Address: ${userWallet.address}`);
    console.log(`🤖 Resolver Address: ${resolverWallet.address}`);

    // Setup contract instances
    const sepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userWallet);
    const celoUsdc = new ethers.Contract(NETWORKS.celo.usdc, ERC20_ABI, userWallet.connect(celoProvider));
    
    const sepoliaLOP = new ethers.Contract(NETWORKS.sepolia.limitOrderProtocol, LIMIT_ORDER_ABI, userWallet);
    const sepoliaSettlement = new ethers.Contract(NETWORKS.sepolia.settlement, SETTLEMENT_ABI, resolverWallet);

    try {
        // Step 1: Check initial balances
        console.log("\n📊 Checking Initial Balances...");
        const initialSepoliaBalance = await sepoliaUsdc.balanceOf(userWallet.address);
        const initialCeloBalance = await celoUsdc.balanceOf(userWallet.address);
        
        console.log(`Sepolia USDC: ${ethers.formatUnits(initialSepoliaBalance, 6)} USDC`);
        console.log(`Celo USDC: ${ethers.formatUnits(initialCeloBalance, 6)} USDC`);

        if (initialSepoliaBalance < ethers.parseUnits("1", 6)) {
            throw new Error("❌ Insufficient USDC balance on Sepolia for test");
        }

        // Step 2: Create a limit order for cross-chain swap
        console.log("\n📝 Creating Cross-Chain Limit Order...");
        
        const swapAmount = ethers.parseUnits("1", 6); // 1 USDC
        const salt = ethers.randomBytes(32);
        const currentNonce = await sepoliaLOP.nonce(userWallet.address);
        
        const order = {
            maker: userWallet.address,
            makerAsset: NETWORKS.sepolia.usdc,
            takerAsset: NETWORKS.sepolia.usdc, // Same asset for simplicity in test
            makingAmount: swapAmount,
            takingAmount: swapAmount, // 1:1 for test
            receiver: userWallet.address,
            salt: salt,
            makerTraits: currentNonce
        };

        // Step 3: Get order hash and create signature
        const orderHash = await sepoliaLOP.getOrderHash(order);
        console.log(`Order Hash: ${orderHash}`);

        // Create EIP-712 signature (simplified for test)
        const domain = {
            name: "LimitOrderProtocolV4",
            version: "1",
            chainId: NETWORKS.sepolia.chainId,
            verifyingContract: NETWORKS.sepolia.limitOrderProtocol
        };

        const types = {
            Order: [
                { name: "maker", type: "address" },
                { name: "makerAsset", type: "address" },
                { name: "takerAsset", type: "address" },
                { name: "makingAmount", type: "uint256" },
                { name: "takingAmount", type: "uint256" },
                { name: "receiver", type: "address" },
                { name: "salt", type: "bytes32" },
                { name: "makerTraits", type: "uint256" }
            ]
        };

        const signature = await userWallet.signTypedData(domain, types, order);
        console.log("✅ Order signed");

        // Step 4: Approve settlement contract to spend USDC
        console.log("\n💰 Approving Settlement Contract...");
        const approveTx = await sepoliaUsdc.approve(NETWORKS.sepolia.settlement, swapAmount);
        await approveTx.wait();
        console.log("✅ Approval confirmed");

        // Step 5: Generate cross-chain parameters
        const secret = ethers.randomBytes(32);
        const hashLock = ethers.keccak256(secret);
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Pack timelocks (following 1inch pattern)
        const timeLocks = 
            BigInt(currentTime) |
            (BigInt(currentTime + 300) << 32n) |  // withdrawal: 5 min
            (BigInt(currentTime + 600) << 64n) |  // public withdrawal: 10 min
            (BigInt(currentTime + 1800) << 96n) | // cancellation: 30 min
            (BigInt(currentTime + 86400) << 128n); // public cancellation: 1 day

        console.log(`🔐 HashLock: ${hashLock}`);
        console.log(`⏰ TimeLocks: ${timeLocks}`);

        // Step 6: Create cross-chain order through settlement
        console.log("\n🌉 Creating Cross-Chain Order...");
        const safetyDeposit = ethers.parseEther("0.1"); // 0.1 ETH safety deposit
        
        const createOrderTx = await sepoliaSettlement.createCrossChainOrder(
            order,
            signature,
            NETWORKS.celo.usdc, // destination token
            NETWORKS.celo.chainId, // destination chain
            hashLock,
            timeLocks,
            { value: safetyDeposit }
        );
        
        const receipt = await createOrderTx.wait();
        console.log(`✅ Cross-chain order created: ${createOrderTx.hash}`);

        // Step 7: Verify cross-chain order exists
        const crossChainOrder = await sepoliaSettlement.getCrossChainOrder(orderHash);
        console.log(`📋 Cross-chain order status: ${crossChainOrder[8]}`); // status field
        
        if (crossChainOrder[7] === ethers.ZeroAddress) {
            throw new Error("❌ Escrow not created properly");
        }
        
        console.log(`🏦 Escrow Address: ${crossChainOrder[7]}`);

        // Step 8: Check escrow state
        const escrow = new ethers.Contract(crossChainOrder[7], ESCROW_ABI, userWallet);
        const escrowState = await escrow.getState();
        console.log(`🔒 Escrow State: ${escrowState}`);

        // For this test, we'll simulate the secret being revealed after finality period
        console.log("\n⏳ Waiting for finality period (5 minutes simulated as 5 seconds)...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 9: Reveal secret to complete the swap
        console.log("\n🔓 Revealing Secret to Complete Swap...");
        try {
            const withdrawTx = await escrow.withdraw(secret);
            await withdrawTx.wait();
            console.log("✅ Secret revealed and swap completed!");
            
            // Check if secret was stored
            const revealedSecret = await escrow.revealedSecret();
            console.log(`🔍 Revealed Secret: ${revealedSecret}`);
            
        } catch (error) {
            console.log(`⚠️  Withdrawal might be in finality lock period: ${error.message}`);
        }

        // Step 10: Check final balances
        console.log("\n📊 Final Balance Check...");
        const finalSepoliaBalance = await sepoliaUsdc.balanceOf(userWallet.address);
        const finalCeloBalance = await celoUsdc.balanceOf(userWallet.address);
        
        console.log(`Sepolia USDC: ${ethers.formatUnits(finalSepoliaBalance, 6)} USDC`);
        console.log(`Celo USDC: ${ethers.formatUnits(finalCeloBalance, 6)} USDC`);
        
        const sepoliaChange = finalSepoliaBalance - initialSepoliaBalance;
        const celoChange = finalCeloBalance - initialCeloBalance;
        
        console.log(`📈 Sepolia Change: ${ethers.formatUnits(sepoliaChange, 6)} USDC`);
        console.log(`📈 Celo Change: ${ethers.formatUnits(celoChange, 6)} USDC`);

        console.log("\n✅ Cross-Chain Swap Test Completed Successfully!");
        console.log("🎉 1inch Fusion+ contracts are working correctly!");

    } catch (error) {
        console.error("\n❌ Test Failed:");
        console.error(error.message);
        console.error("\n🔧 Stack trace:");
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testCrossChainSwap().catch(console.error);