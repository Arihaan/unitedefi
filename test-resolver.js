#!/usr/bin/env node

import { ethers } from 'ethers';

const RESOLVER_URL = 'http://localhost:3001';

// Test accounts
const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User wallet
const USER_ADDRESS = "0xF86eCcDc06855d5e56F3B4949D3D02Fa9396F100";

async function testResolverCrossChain() {
    console.log("🧪 Testing Cross-Chain Swap via Resolver");
    console.log("=" .repeat(50));
    
    try {
        // Step 1: Check resolver health
        console.log("🏥 Checking resolver health...");
        const healthResponse = await fetch(`${RESOLVER_URL}/health`);
        const health = await healthResponse.json();
        console.log("✅ Resolver status:", health.status);
        
        // Step 2: Get resolver info
        console.log("\n📊 Getting resolver information...");
        const infoResponse = await fetch(`${RESOLVER_URL}/info`);
        const info = await infoResponse.json();
        console.log("🤖 Resolver Address:", info.resolverAddress);
        console.log("🌐 Supported Networks:", info.supportedNetworks);
        console.log("🏗️ Architecture:", info.architecture);

        // Step 3: Test cross-chain swap request
        console.log("\n🌉 Requesting Cross-Chain Swap...");
        console.log("📋 Request: 1 USDC Sepolia → Celo");
        
        const swapRequest = {
            fromNetwork: "sepolia",
            toNetwork: "celo", 
            fromToken: "usdc",
            toToken: "usdc",
            amount: "1000000", // 1 USDC (6 decimals)
            userAddress: USER_ADDRESS
        };

        console.log("📤 Sending swap request...");
        const swapResponse = await fetch(`${RESOLVER_URL}/swap`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(swapRequest)
        });

        if (!swapResponse.ok) {
            const errorText = await swapResponse.text();
            throw new Error(`Swap request failed: ${swapResponse.status} - ${errorText}`);
        }

        const swapResult = await swapResponse.json();
        console.log("✅ Swap request accepted!");
        console.log("📝 Order Hash:", swapResult.orderHash);
        console.log("🔐 Hash Lock:", swapResult.hashLock);
        console.log("⏰ Deadline:", new Date(swapResult.deadline * 1000).toLocaleString());
        
        if (swapResult.srcEscrow) {
            console.log("🏦 Source Escrow:", swapResult.srcEscrow);
        }
        if (swapResult.dstEscrow) {
            console.log("🏦 Destination Escrow:", swapResult.dstEscrow);
        }

        // Step 4: Monitor order status
        console.log("\n👀 Monitoring order status...");
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
            attempts++;
            
            try {
                const statusResponse = await fetch(`${RESOLVER_URL}/order/${swapResult.orderHash}`);
                const status = await statusResponse.json();
                
                console.log(`📊 Attempt ${attempts}: Status = ${status.status}`);
                
                if (status.status === 'completed') {
                    console.log("🎉 Cross-chain swap completed successfully!");
                    console.log("🔓 Secret revealed:", status.secret);
                    break;
                } else if (status.status === 'failed' || status.status === 'cancelled') {
                    console.log("❌ Swap failed:", status.error || 'Unknown error');
                    break;
                } else {
                    console.log("⏳ Status:", status.status);
                    if (status.srcEscrow) console.log("   Source Escrow:", status.srcEscrow);
                    if (status.dstEscrow) console.log("   Dest Escrow:", status.dstEscrow);
                }
            } catch (error) {
                console.log(`⚠️  Error checking status: ${error.message}`);
            }
        }
        
        if (attempts >= maxAttempts) {
            console.log("⏰ Timeout reached, but swap may still be processing...");
        }

        // Step 5: Get final status
        console.log("\n📋 Final Status Check...");
        try {
            const finalResponse = await fetch(`${RESOLVER_URL}/order/${swapResult.orderHash}`);
            const finalStatus = await finalResponse.json();
            console.log("🏁 Final Status:", JSON.stringify(finalStatus, null, 2));
        } catch (error) {
            console.log("❌ Could not get final status:", error.message);
        }

    } catch (error) {
        console.error("\n❌ Test Failed:");
        console.error("Error:", error.message);
        if (error.stack) {
            console.error("Stack:", error.stack);
        }
    }
}

// Run the test  
testResolverCrossChain().catch(console.error);