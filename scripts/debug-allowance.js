#!/usr/bin/env node

import { ethers } from 'ethers';
import { NETWORKS } from './resolver/src/config.js';

const PRIVATE_KEY_1 = "0x5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8"; // User wallet
const USER_ADDRESS = "0xF86eCcDc06855d5e56F3B4949D3D02Fa9396F100";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

async function checkAllowances() {
    console.log("🔍 Debugging User Allowances...");
    
    const sepoliaProvider = new ethers.JsonRpcProvider(NETWORKS.sepolia.rpcUrl);
    const userWallet = new ethers.Wallet(PRIVATE_KEY_1, sepoliaProvider);
    
    const sepoliaUsdc = new ethers.Contract(NETWORKS.sepolia.usdc, ERC20_ABI, userWallet);
    
    console.log(`\n👤 User: ${USER_ADDRESS}`);
    
    // Check balances
    const balance = await sepoliaUsdc.balanceOf(USER_ADDRESS);
    console.log(`💰 USDC Balance: ${ethers.formatUnits(balance, 6)} USDC`);
    
    // Check allowances to different contracts
    const escrowFactoryAllowance = await sepoliaUsdc.allowance(USER_ADDRESS, NETWORKS.sepolia.escrowFactory);
    const settlementAllowance = await sepoliaUsdc.allowance(USER_ADDRESS, NETWORKS.sepolia.settlement);
    
    console.log(`\n🔐 Allowances:`);
    console.log(`  EscrowFactory: ${ethers.formatUnits(escrowFactoryAllowance, 6)} USDC`);
    console.log(`  Settlement: ${ethers.formatUnits(settlementAllowance, 6)} USDC`);
    
    // Approve if needed
    if (settlementAllowance < ethers.parseUnits("1000", 6)) {
        console.log(`\n💳 Approving Settlement contract...`);
        const approveTx = await sepoliaUsdc.approve(NETWORKS.sepolia.settlement, ethers.parseUnits("1000000", 6)); // 1M USDC
        await approveTx.wait();
        console.log("✅ Settlement approved");
    }
    
    if (escrowFactoryAllowance < ethers.parseUnits("1000", 6)) {
        console.log(`\n💳 Approving EscrowFactory contract...`);
        const approveTx = await sepoliaUsdc.approve(NETWORKS.sepolia.escrowFactory, ethers.parseUnits("1000000", 6)); // 1M USDC
        await approveTx.wait();
        console.log("✅ EscrowFactory approved");
    }
    
    console.log("\n✅ User allowances checked and fixed!");
}

checkAllowances().catch(console.error);